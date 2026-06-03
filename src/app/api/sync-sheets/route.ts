import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { google } from 'googleapis'
import { getFlatItems, getErasFlatItems, getInBodyFlatItems, INBODY_BALANCE_ITEMS, INBODY_BALANCE_OPTIONS, INBODY_BALANCE_KEYS } from '@/lib/outcomeItems'
import type { OverallLevel } from '@/types'

// ── Item metadata: key → { label, unit } ─────────────────────────────────────
const ITEM_META: Record<string, { label: string; unit: string }> = {}
for (const level of [1, 2, 3, 4] as OverallLevel[]) {
  getFlatItems(level).forEach(i => { ITEM_META[i.key] = { label: i.label, unit: i.unit } })
}
getErasFlatItems().forEach(i => { ITEM_META[i.key] = { label: i.label, unit: i.unit } })
getInBodyFlatItems().forEach(i => { ITEM_META[i.key] = { label: 'InBody: ' + i.label, unit: i.unit } })
INBODY_BALANCE_ITEMS.forEach(i => { ITEM_META[i.key] = { label: 'InBody: ' + i.label + ' balance', unit: '' } })

const HEADER = ['record_id', 'HN', 'patient_name', 'type', 'session_or_phase', 'outcome_name', 'value', 'unit', 'recorded_date']
const SHEET_TAB = 'Outcomes'
const LOC_TAB = 'Location History'
const LOC_HEADER = ['record_id', 'HN', 'patient_name', 'from_location', 'to_location', 'changed_at', 'changed_by']

// ── Firebase Admin singleton ─────────────────────────────────────────────────
function getAdminDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
    initializeApp({ credential: cert(sa) })
  }
  return getFirestore()
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function slug(s: string) { return s.replace(/\s+/g, '_') }
function makeRecordId(hn: string, label: string, session: string) {
  return `${slug(hn)}__${slug(label)}__${slug(session)}`
}
function toISODate(val: unknown): string {
  if (!val) return ''
  if (typeof (val as any).toDate === 'function') return (val as any).toDate().toISOString().split('T')[0]
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return ''
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { patientId?: string }
    const { patientId } = body
    const mode: 'single' | 'all' = patientId ? 'single' : 'all'

    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    const sheetId = process.env.GOOGLE_SHEET_ID
    if (!saJson || !sheetId) {
      return NextResponse.json(
        { ok: false, error: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID env vars.' },
        { status: 500 }
      )
    }

    const db = getAdminDb()

    // ── Fetch patients ────────────────────────────────────────────────────────
    type PatMeta = { hn: string; name: string; assessmentType?: string }
    const patientMap: Record<string, PatMeta> = {}

    if (mode === 'single') {
      const snap = await db.collection('patients').doc(patientId!).get()
      if (!snap.exists) {
        return NextResponse.json({ ok: false, error: 'Patient not found.' }, { status: 404 })
      }
      const d = snap.data()!
      patientMap[snap.id] = {
        hn: d.hn ?? '',
        name: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim(),
        assessmentType: d.assessmentType,
      }
    } else {
      const snap = await db.collection('patients').get()
      snap.docs.forEach(doc => {
        const d = doc.data()
        patientMap[doc.id] = {
          hn: d.hn ?? '',
          name: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim(),
          assessmentType: d.assessmentType,
        }
      })
    }

    const patientIds = Object.keys(patientMap)

    // ── Latest screening type (fallback for patients without patient.assessmentType) ──
    const screeningTypeMap: Record<string, string> = {}
    const screeningTimeMap: Record<string, number> = {}

    if (patientIds.length > 0) {
      const updateScreeningMap = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
        docs.forEach(doc => {
          const d = doc.data()
          const pid: string = d.patientId
          const t: number = d.assessedAt?.toDate?.()?.getTime?.() ?? 0
          if (t > (screeningTimeMap[pid] ?? -1)) {
            screeningTimeMap[pid] = t
            screeningTypeMap[pid] = d.assessmentType ?? 'Standard'
          }
        })
      }

      if (mode === 'single') {
        const snap = await db.collection('screenings').where('patientId', '==', patientId!).get()
        updateScreeningMap(snap.docs)
      } else {
        for (let i = 0; i < patientIds.length; i += 30) {
          const batch = patientIds.slice(i, i + 30)
          const snap = await db.collection('screenings').where('patientId', 'in', batch).get()
          updateScreeningMap(snap.docs)
        }
      }
    }

    // ── Fetch outcomes ────────────────────────────────────────────────────────
    const outcomeSnap = mode === 'single'
      ? await db.collection('outcomes').where('patientId', '==', patientId!).get()
      : await db.collection('outcomes').get()

    // ── Build rows ────────────────────────────────────────────────────────────
    const rows: string[][] = []
    outcomeSnap.docs.forEach(doc => {
      const d = doc.data()
      const pid: string = d.patientId
      const pat = patientMap[pid]
      if (!pat) return

      const type = pat.assessmentType ?? screeningTypeMap[pid] ?? 'Standard'
      const session: string = d.session ?? ''
      const recordedDate = (d.assessmentDate as string | undefined) || toISODate(d.recordedAt)
      const items = (d.items ?? {}) as Record<string, { value: number }>

      Object.entries(items).forEach(([key, entry]) => {
        const meta = ITEM_META[key]
        if (!meta) return
        const displayValue = INBODY_BALANCE_KEYS.includes(key)
          ? (INBODY_BALANCE_OPTIONS[entry.value] ?? String(entry.value))
          : String(entry.value)
        rows.push([
          makeRecordId(pat.hn, meta.label, session),
          pat.hn,
          pat.name,
          type,
          session,
          meta.label,
          displayValue,
          meta.unit,
          recordedDate,
        ])
      })
    })

    // ── Google Sheets auth ────────────────────────────────────────────────────
    const sa = JSON.parse(saJson)
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: sa.client_email, private_key: sa.private_key },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })

    // ── Ensure "Outcomes" tab exists ──────────────────────────────────────────
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
    const tabExists = spreadsheet.data.sheets?.some(s => s.properties?.title === SHEET_TAB)
    if (!tabExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET_TAB } } }] },
      })
    }

    // ── Ensure header row ─────────────────────────────────────────────────────
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_TAB}!A1:I1`,
    })
    if (headerRes.data.values?.[0]?.[0] !== 'record_id') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_TAB}!A1:I1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] },
      })
    }

    // ── Read existing record_ids from column A (row 2 onwards) ────────────────
    const colARes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_TAB}!A2:A`,
    })
    const idToRow: Record<string, number> = {}
    ;(colARes.data.values ?? []).forEach((row, i) => {
      if (row[0]) idToRow[row[0] as string] = i + 2  // +2: row 1 is header, array is 0-indexed
    })

    // ── Upsert ────────────────────────────────────────────────────────────────
    const updateRanges: { range: string; values: string[][] }[] = []
    const appendRows: string[][] = []
    const appendedIds = new Set<string>()

    rows.forEach(row => {
      const id = row[0]
      if (id in idToRow) {
        updateRanges.push({
          range: `${SHEET_TAB}!A${idToRow[id]}:I${idToRow[id]}`,
          values: [row],
        })
      } else if (!appendedIds.has(id)) {
        appendRows.push(row)
        appendedIds.add(id)
      }
    })

    // Batch update existing rows (100 ranges per request)
    for (let i = 0; i < updateRanges.length; i += 100) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updateRanges.slice(i, i + 100),
        },
      })
    }

    // Append new rows
    if (appendRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET_TAB}!A:I`,
        valueInputOption: 'RAW',
        requestBody: { values: appendRows },
      })
    }

    // ── Location History tab ──────────────────────────────────────────────────
    const locSnap = mode === 'single'
      ? await db.collection('locationHistory').where('patientId', '==', patientId!).get()
      : await db.collection('locationHistory').get()

    const locRows: string[][] = []
    locSnap.docs.forEach(d => {
      const entry = d.data()
      const pid: string = entry.patientId
      const pat = patientMap[pid]
      if (!pat) return
      const changedAtVal = entry.changedAt
      const changedAtDate: Date | null = changedAtVal?.toDate?.() ?? null
      const changedAtIso = changedAtDate ? changedAtDate.toISOString() : ''
      const recordId = `${slug(pat.hn)}__${d.id}`
      locRows.push([
        recordId,
        pat.hn,
        pat.name,
        entry.from ?? '',
        entry.to ?? '',
        changedAtIso,
        entry.changedBy ?? '',
      ])
    })

    // Ensure Location History tab
    const locTabExists = spreadsheet.data.sheets?.some(s => s.properties?.title === LOC_TAB)
    if (!locTabExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: LOC_TAB } } }] },
      })
    }

    // Ensure header
    const locHeaderRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${LOC_TAB}!A1:G1`,
    })
    if (locHeaderRes.data.values?.[0]?.[0] !== 'record_id') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${LOC_TAB}!A1:G1`,
        valueInputOption: 'RAW',
        requestBody: { values: [LOC_HEADER] },
      })
    }

    // Read existing record_ids
    const locColARes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${LOC_TAB}!A2:A`,
    })
    const locIdToRow: Record<string, number> = {}
    ;(locColARes.data.values ?? []).forEach((row, i) => {
      if (row[0]) locIdToRow[row[0] as string] = i + 2
    })

    // Upsert location history rows
    const locUpdateRanges: { range: string; values: string[][] }[] = []
    const locAppendRows: string[][] = []
    const locAppendedIds = new Set<string>()

    locRows.forEach(row => {
      const rid = row[0]
      if (rid in locIdToRow) {
        locUpdateRanges.push({ range: `${LOC_TAB}!A${locIdToRow[rid]}:G${locIdToRow[rid]}`, values: [row] })
      } else if (!locAppendedIds.has(rid)) {
        locAppendRows.push(row)
        locAppendedIds.add(rid)
      }
    })

    for (let i = 0; i < locUpdateRanges.length; i += 100) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: 'RAW', data: locUpdateRanges.slice(i, i + 100) },
      })
    }
    if (locAppendRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${LOC_TAB}!A:G`,
        valueInputOption: 'RAW',
        requestBody: { values: locAppendRows },
      })
    }

    return NextResponse.json({ ok: true, synced: rows.length + locRows.length, mode })

  } catch (err) {
    console.error('[sync-sheets]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
