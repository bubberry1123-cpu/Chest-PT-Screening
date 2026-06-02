import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { google } from 'googleapis'
import { getFlatItems, getErasFlatItems } from '@/lib/outcomeItems'
import type { OverallLevel } from '@/types'

// ── Item metadata: key → { label, unit } ─────────────────────────────────────
const ITEM_META: Record<string, { label: string; unit: string }> = {}
for (const level of [1, 2, 3, 4] as OverallLevel[]) {
  getFlatItems(level).forEach(i => { ITEM_META[i.key] = { label: i.label, unit: i.unit } })
}
getErasFlatItems().forEach(i => { ITEM_META[i.key] = { label: i.label, unit: i.unit } })

const HEADER = ['record_id', 'HN', 'patient_name', 'type', 'session_or_phase', 'outcome_name', 'value', 'unit', 'recorded_date']
const SHEET_TAB = 'Outcomes'

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
        rows.push([
          makeRecordId(pat.hn, meta.label, session),
          pat.hn,
          pat.name,
          type,
          session,
          meta.label,
          String(entry.value),
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

    return NextResponse.json({ ok: true, synced: rows.length, mode })

  } catch (err) {
    console.error('[sync-sheets]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
