'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient, getOutcomesByPatient, updatePatient, deletePatient, deleteScreening } from '@/lib/localstore'
import { OUTCOME_GROUPS, OUTCOME_SESSIONS, SESSION_SHORT, ERAS_PHASES, ERAS_PHASE_SHORT, ERAS_OUTCOME_GROUPS } from '@/lib/outcomeItems'
import { useIsAdmin } from '@/lib/useIsAdmin'
import type { Patient, Screening, OutcomeMeasurement, OverallLevel } from '@/types'
import { WARDS } from '@/lib/wards'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/Toast'
import ConfirmDialog from '@/components/ConfirmDialog'
import SeverityBadge from '@/components/SeverityBadge'
import OutcomeCharts, { OutcomeChartsAll } from '@/components/OutcomeCharts'
import OutcomeSummaryDashboard from '@/components/OutcomeSummaryDashboard'
import ErasOutcomeCharts from '@/components/ErasOutcomeCharts'

function trendSymbol(diff: number, lowerIsBetter?: boolean) {
  if (diff === 0) return { symbol: '→', color: 'text-slate-400' }
  const isGood = lowerIsBetter ? diff < 0 : diff > 0
  if (diff > 0) return { symbol: '↑', color: isGood ? 'text-green-600' : 'text-red-500' }
  return { symbol: '↓', color: isGood ? 'text-green-600' : 'text-red-500' }
}

function OutcomeTable({ outcomes, level }: { outcomes: OutcomeMeasurement[]; level: OverallLevel }) {
  const groups = OUTCOME_GROUPS[level]
  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })
  const initial = bySession['Initial']

  const filledSessions = OUTCOME_SESSIONS.filter(s => bySession[s])
  if (filledSessions.length === 0) return null

  // Build flat row list with group headers
  type Row =
    | { type: 'header'; key: string; label: string }
    | { type: 'item'; key: string; itemKey: string; label: string; unit: string; lowerIsBetter?: boolean; indent: boolean }

  const rows: Row[] = []
  for (const group of groups) {
    if (group.items.length > 1) {
      rows.push({ type: 'header', key: `h-${group.groupKey}`, label: group.label })
      group.items.forEach(item => rows.push({
        type: 'item', key: item.key, itemKey: item.key,
        label: item.label, unit: item.unit, lowerIsBetter: item.lowerIsBetter, indent: true,
      }))
    } else {
      const item = group.items[0]
      rows.push({
        type: 'item', key: item.key, itemKey: item.key,
        label: group.label, unit: item.unit, lowerIsBetter: item.lowerIsBetter, indent: false,
      })
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm min-w-max">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[190px]">
              Outcome
            </th>
            {filledSessions.map(s => (
              <th key={s} className="px-3 py-2.5 font-semibold text-center min-w-[80px] text-slate-700">
                <div>{SESSION_SHORT[s]}</div>
                {bySession[s]?.assessmentDate && (
                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                    {new Date(bySession[s].assessmentDate!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.map(row => {
            if (row.type === 'header') {
              return (
                <tr key={row.key} className="border-t border-slate-100">
                  <td colSpan={filledSessions.length + 1} className="px-4 pt-3 pb-1 text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-white">
                    {row.label}
                  </td>
                </tr>
              )
            }
            const { itemKey, label, unit, lowerIsBetter, indent } = row
            return (
              <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td className={`py-2 sticky left-0 bg-white ${indent ? 'pl-8 pr-4' : 'px-4'}`}>
                  <div className={indent ? 'text-slate-600 text-sm' : 'font-medium text-slate-700 text-sm'}>{label}</div>
                  <div className="text-xs text-slate-400">{unit}</div>
                </td>
                {filledSessions.map(s => {
                  const entry = bySession[s]?.items[itemKey]
                  if (!entry) return <td key={s} className="px-3 py-2 text-center text-slate-300 text-sm">–</td>
                  const isInitial = s === 'Initial'
                  const initVal = initial?.items[itemKey]?.value
                  const trend = !isInitial && initVal !== undefined && itemKey !== 'dyspneaScale'
                    ? trendSymbol(entry.value - initVal, lowerIsBetter)
                    : null
                  return (
                    <td key={s} className="px-3 py-2 text-center">
                      <span className="font-semibold text-slate-800">{entry.value}</span>
                      {trend && <span className={`text-xs font-bold ml-1 ${trend.color}`}>{trend.symbol}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── ERAS Outcome Table ────────────────────────────────────────────────────────
function ErasOutcomeTable({ outcomes }: { outcomes: OutcomeMeasurement[] }) {
  const byPhase: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { byPhase[o.session] = o })

  const filledPhases = ERAS_PHASES.filter(p => byPhase[p])
  if (filledPhases.length === 0) return null

  const firstPhase = filledPhases[0]

  type Row =
    | { type: 'header'; key: string; label: string }
    | { type: 'item'; key: string; itemKey: string; label: string; unit: string; lowerIsBetter?: boolean; indent: boolean }

  const rows: Row[] = []
  for (const group of ERAS_OUTCOME_GROUPS) {
    if (group.items.length > 1) {
      rows.push({ type: 'header', key: `h-${group.groupKey}`, label: group.label })
      group.items.forEach(item => rows.push({
        type: 'item', key: item.key, itemKey: item.key,
        label: item.label, unit: item.unit, lowerIsBetter: item.lowerIsBetter, indent: true,
      }))
    } else {
      const item = group.items[0]
      rows.push({
        type: 'item', key: item.key, itemKey: item.key,
        label: group.label, unit: item.unit, lowerIsBetter: item.lowerIsBetter, indent: false,
      })
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm min-w-max">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[200px]">
              Outcome
            </th>
            {filledPhases.map(p => (
              <th key={p} className="px-3 py-2.5 font-semibold text-center min-w-[90px] text-slate-700">
                <div>{ERAS_PHASE_SHORT[p]}</div>
                {byPhase[p]?.assessmentDate && (
                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                    {new Date(byPhase[p].assessmentDate!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.map(row => {
            if (row.type === 'header') {
              return (
                <tr key={row.key} className="border-t border-slate-100">
                  <td colSpan={filledPhases.length + 1} className="px-4 pt-3 pb-1 text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-white">
                    {row.label}
                  </td>
                </tr>
              )
            }
            const { itemKey, label, unit, lowerIsBetter, indent } = row
            return (
              <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td className={`py-2 sticky left-0 bg-white ${indent ? 'pl-8 pr-4' : 'px-4'}`}>
                  <div className={indent ? 'text-slate-600 text-sm' : 'font-medium text-slate-700 text-sm'}>{label}</div>
                  <div className="text-xs text-slate-400">{unit}</div>
                </td>
                {filledPhases.map(p => {
                  const entry = byPhase[p]?.items[itemKey]
                  if (!entry) return <td key={p} className="px-3 py-2 text-center text-slate-300 text-sm">–</td>
                  const isFirst = p === firstPhase
                  const baseVal = byPhase[firstPhase]?.items[itemKey]?.value
                  const trend = !isFirst && baseVal !== undefined
                    ? trendSymbol(entry.value - baseVal, lowerIsBetter)
                    : null
                  return (
                    <td key={p} className="px-3 py-2 text-center">
                      <span className="font-semibold text-slate-800">{entry.value}</span>
                      {trend && <span className={`text-xs font-bold ml-1 ${trend.color}`}>{trend.symbol}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Edit Patient Modal ────────────────────────────────────────────────────────
interface EditModalProps { patient: Patient; onSave: (p: Patient) => void; onClose: () => void }

function EditPatientModal({ patient, onSave, onClose }: EditModalProps) {
  const [form, setForm] = useState({ ...patient })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof Patient, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updatePatient(patient.id!, {
        firstName: form.firstName,
        lastName: form.lastName,
        age: Number(form.age),
        sex: form.sex,
        nationality: form.nationality,
        location: form.location,
      })
      onSave({ ...patient, ...form, age: Number(form.age) })
    } catch {
      alert('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">แก้ไขข้อมูลผู้ป่วย</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">ชื่อ</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">นามสกุล</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">อายุ</label>
              <input type="number" min={0} max={150} value={form.age} onChange={e => set('age', e.target.value)} required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">เพศ</label>
              <select value={form.sex} onChange={e => set('sex', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">สัญชาติ</label>
            <select value={form.nationality} onChange={e => set('nationality', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
              {['Thai', 'Arab', 'Inter', 'CLMV (Cambodia, Laos, Myanmar, Vietnam)', 'Asia'].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Location</label>
            <select value={form.location} onChange={e => set('location', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
              <option value="">Select Ward</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-600 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2 rounded-xl text-sm font-semibold transition-colors">
              {saving && (
                <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PatientPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(false)
  const [confirmDeleteScreening, setConfirmDeleteScreening] = useState<Screening | null>(null)
  const pdfChartsRef = useRef<HTMLDivElement>(null)
  const pdfSummaryRef = useRef<HTMLDivElement>(null)
  const { toast, showToast } = useToast()

  useEffect(() => {
    Promise.all([
      getPatientById(id),
      getScreeningsByPatient(id),
      getOutcomesByPatient(id),
    ])
      .then(([p, s, o]) => { setPatient(p); setScreenings(s); setOutcomes(o); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const handleDeletePatient = async () => {
    if (!patient) return
    try {
      await deletePatient(id)
      router.push('/')
    } catch {
      showToast('ลบไม่สำเร็จ กรุณาลองใหม่', 'error')
    }
  }

  const handleDeleteScreening = async (s: Screening) => {
    try {
      await deleteScreening(s.id!)
      setScreenings(prev => prev.filter(x => x.id !== s.id))
    } catch {
      showToast('ลบไม่สำเร็จ กรุณาลองใหม่', 'error')
    }
  }

  if (loading) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
  if (!patient) return <div className="text-center py-16 text-slate-400">ไม่พบผู้ป่วย</div>

  const latestLevel = screenings[0]?.overallLevel as OverallLevel | undefined
  const isEras = screenings[0]?.assessmentType === 'ERAS'

  const handleDownloadPDF = async () => {
    if (!patient) return
    setPdfExporting(true)
    setPdfError(null)
    try {
      const [{ toPng }, jspdfMod, autoTableMod] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const { jsPDF } = jspdfMod
      const autoTable = autoTableMod.default

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const mg = 12
      let curY = 0

      // ── Header bar ──────────────────────────────────────────────────────────
      pdf.setFillColor(27, 58, 107)
      pdf.rect(0, 0, pw, 24, 'F')
      pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255, 255, 255)
      pdf.text('Chest PT Screening — Patient Report', mg, 11)
      pdf.setFont('helvetica', 'normal').setFontSize(8)
      pdf.text(
        `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        mg, 19
      )
      curY = 30

      // ── Patient info box ────────────────────────────────────────────────────
      pdf.setFillColor(241, 245, 249)
      pdf.roundedRect(mg, curY, pw - mg * 2, 32, 3, 3, 'F')
      pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(15, 23, 42)
      pdf.text(`${patient.firstName} ${patient.lastName}`, mg + 5, curY + 9)
      pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(71, 85, 105)
      pdf.text(`HN: ${patient.hn}`, mg + 5, curY + 17)
      pdf.text(
        `Age: ${patient.age}  ·  Sex: ${patient.sex}  ·  Nationality: ${patient.nationality}  ·  Location: ${patient.location || '—'}`,
        mg + 5, curY + 25
      )
      curY += 38

      // ── Outcome Measurements Table ──────────────────────────────────────────
      if (outcomes.length > 0 && latestLevel) {
        if (curY + 20 > ph - mg) { pdf.addPage(); curY = mg }
        pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30, 41, 59)
        pdf.text('Outcome Measurements', mg, curY)
        curY += 3

        if (isEras) {
          const erasByPhase: Record<string, OutcomeMeasurement> = {}
          outcomes.forEach(o => { erasByPhase[o.session] = o })
          const filledPhases = ERAS_PHASES.filter(p => erasByPhase[p])
          const head = [['Outcome (unit)', ...filledPhases.map(p => ERAS_PHASE_SHORT[p] ?? p)]]
          const body: any[][] = []
          for (const group of ERAS_OUTCOME_GROUPS) {
            if (group.items.length > 1) {
              body.push([{
                content: group.label, colSpan: filledPhases.length + 1,
                styles: { fontStyle: 'bold', fillColor: [237, 233, 254], textColor: [91, 33, 182] },
              }])
              group.items.forEach(item => {
                if (!filledPhases.some(p => erasByPhase[p]?.items[item.key]?.value !== undefined)) return
                body.push([
                  `  ${item.label} (${item.unit})`,
                  ...filledPhases.map(p => {
                    const v = erasByPhase[p]?.items[item.key]?.value
                    return v !== undefined ? String(v) : '—'
                  }),
                ])
              })
            } else {
              const item = group.items[0]
              if (!filledPhases.some(p => erasByPhase[p]?.items[item.key]?.value !== undefined)) continue
              body.push([
                `${group.label} (${item.unit})`,
                ...filledPhases.map(p => {
                  const v = erasByPhase[p]?.items[item.key]?.value
                  return v !== undefined ? String(v) : '—'
                }),
              ])
            }
          }
          autoTable(pdf, {
            startY: curY, head, body,
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 245, 255] },
            columnStyles: { 0: { fontStyle: 'italic', cellWidth: 52 } },
            margin: { left: mg, right: mg },
          })
        } else {
          const bySession: Record<string, OutcomeMeasurement> = {}
          outcomes.forEach(o => { bySession[o.session] = o })
          const filledSessions = OUTCOME_SESSIONS.filter(s => bySession[s])
          const groups = OUTCOME_GROUPS[latestLevel]
          const head = [['Outcome (unit)', ...filledSessions.map(s => SESSION_SHORT[s] ?? s)]]
          const body: any[][] = []
          for (const group of groups) {
            if (group.items.length > 1) {
              body.push([{
                content: group.label, colSpan: filledSessions.length + 1,
                styles: { fontStyle: 'bold', fillColor: [215, 224, 240], textColor: [27, 58, 107] },
              }])
              group.items.forEach(item => {
                if (!filledSessions.some(s => bySession[s]?.items[item.key]?.value !== undefined)) return
                body.push([
                  `  ${item.label} (${item.unit})`,
                  ...filledSessions.map(s => {
                    const v = bySession[s]?.items[item.key]?.value
                    return v !== undefined ? String(v) : '—'
                  }),
                ])
              })
            } else {
              const item = group.items[0]
              if (!filledSessions.some(s => bySession[s]?.items[item.key]?.value !== undefined)) continue
              body.push([
                `${group.label} (${item.unit})`,
                ...filledSessions.map(s => {
                  const v = bySession[s]?.items[item.key]?.value
                  return v !== undefined ? String(v) : '—'
                }),
              ])
            }
          }
          autoTable(pdf, {
            startY: curY, head, body,
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 0: { fontStyle: 'italic', cellWidth: 52 } },
            margin: { left: mg, right: mg },
          })
        }
        curY = (pdf as any).lastAutoTable.finalY + 8
      }

      // ── Chart images ────────────────────────────────────────────────────────
      const captureAndPlace = async (el: HTMLElement | null, title: string, bg = '#f8fafc') => {
        if (!el) return
        const imgData = await toPng(el, { pixelRatio: 2, backgroundColor: bg, cacheBust: true })
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = imgData
        })
        const avail = pw - mg * 2
        const ratio = img.height / img.width
        let drawW = avail
        let drawH = drawW * ratio
        const maxH = ph - mg * 2 - 20
        if (drawH > maxH) { drawH = maxH; drawW = drawH / ratio }
        if (curY + drawH + 18 > ph - mg) { pdf.addPage(); curY = mg }
        pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30, 41, 59)
        pdf.text(title, mg, curY)
        curY += 4
        pdf.addImage(imgData, 'PNG', mg + (avail - drawW) / 2, curY, drawW, drawH)
        curY += drawH + 8
      }

      if (outcomes.length > 0) {
        await captureAndPlace(pdfChartsRef.current, isEras ? 'ERAS Outcome Trend Charts' : 'Outcome Trend Charts')
        if (!isEras) {
          await captureAndPlace(pdfSummaryRef.current, 'Outcome Summary', '#ffffff')
        }
      }

      // ── Save ────────────────────────────────────────────────────────────────
      const safeName = `${patient.firstName}_HN${patient.hn}`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toUpperCase()
      const dateStr = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit',
      }).replace(/\//g, '')
      pdf.save(`${safeName}_report_${dateStr}.pdf`)

    } catch (err) {
      console.error('[Download PDF]', err)
      setPdfError(err instanceof Error ? err.message : 'PDF generation failed. Check the browser console.')
    } finally {
      setPdfExporting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {confirmDeletePatient && patient && (
        <ConfirmDialog
          title="ลบผู้ป่วย"
          message={`ลบผู้ป่วย "${patient.firstName} ${patient.lastName}" และข้อมูลทั้งหมด?\nการกระทำนี้ไม่สามารถกู้คืนได้`}
          confirmLabel="ลบ"
          onConfirm={() => { setConfirmDeletePatient(false); handleDeletePatient() }}
          onCancel={() => setConfirmDeletePatient(false)}
        />
      )}
      {confirmDeleteScreening && (
        <ConfirmDialog
          title="ลบการประเมิน"
          message={`ลบการประเมินวันที่ ${confirmDeleteScreening.assessedAt instanceof Date ? confirmDeleteScreening.assessedAt.toLocaleDateString('th-TH') : '?'}?\nการกระทำนี้ไม่สามารถกู้คืนได้`}
          confirmLabel="ลบ"
          onConfirm={() => { const s = confirmDeleteScreening; setConfirmDeleteScreening(null); handleDeleteScreening(s) }}
          onCancel={() => setConfirmDeleteScreening(null)}
        />
      )}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      </div>

      {/* Patient Info Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">{patient.firstName} {patient.lastName}</h2>
              {isAdmin && (
                <button onClick={() => setEditOpen(true)}
                  className="text-xs text-slate-400 hover:text-[#185FA5] border border-slate-200 hover:border-[#185FA5] px-2 py-0.5 rounded transition-colors">
                  Edit
                </button>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-0.5 font-mono">HN: {patient.hn}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Link href={`/patients/${id}/screening/new`}
              className="bg-[#0C447C] hover:bg-[#185FA5] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors text-center whitespace-nowrap">
              + ประเมินใหม่
            </Link>
            <Link href={`/patients/${id}/outcome`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors text-center whitespace-nowrap">
              + Outcome
            </Link>
            {isAdmin && (
              <button onClick={() => setConfirmDeletePatient(true)}
                className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl text-sm font-semibold transition-colors text-center whitespace-nowrap">
                ลบผู้ป่วย
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <div className="bg-[#F8FAFC] rounded-[10px] p-2.5">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide">อายุ</div>
            <div className="text-sm font-medium text-slate-700">{patient.age} ปี</div>
          </div>
          <div className="bg-[#F8FAFC] rounded-[10px] p-2.5">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide">เพศ</div>
            <div className="text-sm font-medium text-slate-700">{patient.sex}</div>
          </div>
          <div className="bg-[#F8FAFC] rounded-[10px] p-2.5">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide">สัญชาติ</div>
            <div className="text-sm font-medium text-slate-700">{patient.nationality}</div>
          </div>
          <div className="bg-[#F8FAFC] rounded-[10px] p-2.5">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide">Location</div>
            <div className="text-sm font-medium text-slate-700">{patient.location}</div>
          </div>
        </div>
      </div>

      {/* Screening History */}
      <h3 className="font-semibold text-slate-700 mb-3">ประวัติการประเมิน ({screenings.length} ครั้ง)</h3>
      {screenings.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200 mb-4">
          ยังไม่มีประวัติการประเมิน
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {screenings.map(s => (
            <div key={s.id} className="relative">
              <Link href={`/screenings/${s.id}`}
                className="block bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:border-[#185FA5] transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-500 mb-1">
                      {s.assessedAt instanceof Date
                        ? s.assessedAt.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'ไม่ทราบวันที่'}
                      {s.assessedBy && <span className="ml-2">โดย {s.assessedBy}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span>CFS: {s.cfsScore}</span>
                      <span>F{s.fLevel} / R{s.rLevel}</span>
                      <span className={s.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}>
                        {s.programType}
                      </span>
                      <span className="text-slate-400">{s.driver}</span>
                    </div>
                  </div>
                  <SeverityBadge level={s.overallLevel} />
                </div>
              </Link>
              {isAdmin && (
                <button
                  onClick={e => { e.preventDefault(); setConfirmDeleteScreening(s) }}
                  className="absolute top-2 right-2 text-xs text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-colors bg-white border border-transparent hover:border-red-200">
                  ลบ
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outcome Comparison Table */}
      {latestLevel && outcomes.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-700">
              Outcome Measurements ({outcomes.length} {isEras ? 'phase' : 'session'}{outcomes.length !== 1 ? 's' : ''})
            </h3>
            <Link href={`/patients/${id}/outcome`}
              className="text-xs text-[#0C447C] hover:text-[#185FA5] font-medium">
              + Add / Edit →
            </Link>
          </div>
          {isEras ? (
            <>
              <ErasOutcomeTable outcomes={outcomes} />
              <ErasOutcomeCharts outcomes={outcomes} />
            </>
          ) : (
            <>
              <OutcomeTable outcomes={outcomes} level={latestLevel} />
              <OutcomeCharts outcomes={outcomes} level={latestLevel} isAdmin={isAdmin} />
              <OutcomeSummaryDashboard outcomes={outcomes} level={latestLevel} />
            </>
          )}
        </div>
      )}

      {latestLevel && outcomes.length === 0 && (
        <div className="text-center py-8 bg-white rounded-2xl border border-slate-200 border-dashed">
          <p className="text-slate-400 text-sm mb-2">No outcome data recorded yet</p>
          <Link href={`/patients/${id}/outcome`}
            className="text-sm text-[#0C447C] hover:text-[#185FA5] font-medium underline">
            {isEras ? 'Record Prehabilitation →' : 'Record Initial →'}
          </Link>
        </div>
      )}

      {/* ── Download PDF button ───────────────────────────────────────────── */}
      <div className="mt-6 mb-2">
        <button
          onClick={handleDownloadPDF}
          disabled={pdfExporting}
          className="w-full flex items-center justify-center gap-2.5 bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          {pdfExporting ? (
            <>
              <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Generating PDF…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PDF
            </>
          )}
        </button>
        {pdfError && (
          <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-600">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span className="flex-1">{pdfError}</span>
            <button onClick={() => setPdfError(null)} className="shrink-0 text-red-400 hover:text-red-600 leading-none">×</button>
          </div>
        )}
      </div>

      {/* ── Hidden divs for PDF chart capture ─────────────────────────────── */}
      {latestLevel && outcomes.length > 0 && !isEras && (
        <>
          <div
            aria-hidden="true"
            style={{ position: 'fixed', left: '-9999px', top: 0, width: '680px', zIndex: -1 }}
          >
            <div ref={pdfChartsRef} style={{ backgroundColor: '#f8fafc', padding: '16px' }}>
              <OutcomeChartsAll outcomes={outcomes} level={latestLevel} />
            </div>
          </div>
          <div
            aria-hidden="true"
            style={{ position: 'fixed', left: '-9999px', top: 0, width: '680px', zIndex: -1 }}
          >
            <div ref={pdfSummaryRef} style={{ backgroundColor: '#ffffff', padding: '16px' }}>
              <OutcomeSummaryDashboard outcomes={outcomes} level={latestLevel} />
            </div>
          </div>
        </>
      )}
      {isEras && outcomes.length > 0 && (
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: '-9999px', top: 0, width: '680px', zIndex: -1 }}
        >
          <div ref={pdfChartsRef} style={{ backgroundColor: '#f8fafc', padding: '16px' }}>
            <ErasOutcomeCharts outcomes={outcomes} />
          </div>
        </div>
      )}

      {toast && <Toast {...toast} />}

      {editOpen && patient && (
        <EditPatientModal
          patient={patient}
          onSave={updated => {
            setPatient(updated)
            setEditOpen(false)
            showToast('Patient updated successfully!', 'success')
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}
