'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient, getOutcomesByPatient, updatePatient, deletePatient, deleteScreening } from '@/lib/localstore'
import { OUTCOME_GROUPS, OUTCOME_SESSIONS, SESSION_SHORT } from '@/lib/outcomeItems'
import { useIsAdmin } from '@/lib/useIsAdmin'
import type { Patient, Screening, OutcomeMeasurement, OverallLevel } from '@/types'
import { WARDS } from '@/lib/wards'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/Toast'
import SeverityBadge from '@/components/SeverityBadge'
import OutcomeCharts from '@/components/OutcomeCharts'
import OutcomeSummaryDashboard from '@/components/OutcomeSummaryDashboard'

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
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm min-w-max">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[190px]">
              Outcome
            </th>
            {filledSessions.map(s => (
              <th key={s} className="px-3 py-2.5 font-semibold text-center min-w-[72px] text-slate-700">
                {SESSION_SHORT[s]}
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
    await updatePatient(patient.id!, {
      firstName: form.firstName,
      lastName: form.lastName,
      age: Number(form.age),
      sex: form.sex,
      nationality: form.nationality,
      location: form.location,
    })
    onSave({ ...patient, ...form, age: Number(form.age) })
    setSaving(false)
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
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-semibold transition-colors">
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
  const { toast, showToast } = useToast()

  useEffect(() => {
    Promise.all([
      getPatientById(id),
      getScreeningsByPatient(id),
      getOutcomesByPatient(id),
    ]).then(([p, s, o]) => {
      setPatient(p)
      setScreenings(s)
      setOutcomes(o)
      setLoading(false)
    })
  }, [id])

  const handleDeletePatient = async () => {
    if (!patient) return
    if (!window.confirm(`ลบผู้ป่วย "${patient.firstName} ${patient.lastName}" และข้อมูลทั้งหมด?\nการกระทำนี้ไม่สามารถกู้คืนได้`)) return
    await deletePatient(id)
    router.push('/')
  }

  const handleDeleteScreening = async (s: Screening) => {
    if (!window.confirm(`ลบการประเมินวันที่ ${s.assessedAt instanceof Date ? s.assessedAt.toLocaleDateString('th-TH') : '?'} ?`)) return
    await deleteScreening(s.id!)
    setScreenings(prev => prev.filter(x => x.id !== s.id))
  }

  if (loading) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
  if (!patient) return <div className="text-center py-16 text-slate-400">ไม่พบผู้ป่วย</div>

  const latestLevel = screenings[0]?.overallLevel as OverallLevel | undefined

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      </div>

      {/* Patient Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">{patient.firstName} {patient.lastName}</h2>
              {isAdmin && (
                <button onClick={() => setEditOpen(true)}
                  className="text-xs text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-400 px-2 py-0.5 rounded transition-colors">
                  Edit
                </button>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-0.5 font-mono">HN: {patient.hn}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Link href={`/patients/${id}/screening/new`}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors text-center whitespace-nowrap">
              + ประเมินใหม่
            </Link>
            <Link href={`/patients/${id}/outcome`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors text-center whitespace-nowrap">
              + Outcome
            </Link>
            {isAdmin && (
              <button onClick={handleDeletePatient}
                className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors text-center whitespace-nowrap">
                ลบผู้ป่วย
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">อายุ</div>
            <div className="font-semibold text-slate-800">{patient.age} ปี</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">เพศ</div>
            <div className="font-semibold text-slate-800">{patient.sex}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">สัญชาติ</div>
            <div className="font-semibold text-slate-800">{patient.nationality}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">Location</div>
            <div className="font-semibold text-slate-800">{patient.location}</div>
          </div>
        </div>
      </div>

      {/* Screening History */}
      <h3 className="font-semibold text-slate-700 mb-3">ประวัติการประเมิน ({screenings.length} ครั้ง)</h3>
      {screenings.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200 mb-4">
          ยังไม่มีประวัติการประเมิน
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {screenings.map(s => (
            <div key={s.id} className="relative">
              <Link href={`/screenings/${s.id}`}
                className="block bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-blue-300 transition-colors">
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
                  onClick={e => { e.preventDefault(); handleDeleteScreening(s) }}
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
              Outcome Measurements ({outcomes.length} session)
            </h3>
            <Link href={`/patients/${id}/outcome`}
              className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">
              + เพิ่ม / แก้ไข →
            </Link>
          </div>
          <OutcomeTable outcomes={outcomes} level={latestLevel} />
          <OutcomeCharts outcomes={outcomes} level={latestLevel} isAdmin={isAdmin} />
          <OutcomeSummaryDashboard outcomes={outcomes} level={latestLevel} />
        </div>
      )}

      {latestLevel && outcomes.length === 0 && (
        <div className="text-center py-8 bg-white rounded-xl border border-slate-200 border-dashed">
          <p className="text-slate-400 text-sm mb-2">ยังไม่มีข้อมูล Outcome Measurement</p>
          <Link href={`/patients/${id}/outcome`}
            className="text-sm text-emerald-600 hover:text-emerald-800 font-medium underline">
            บันทึก Initial →
          </Link>
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
