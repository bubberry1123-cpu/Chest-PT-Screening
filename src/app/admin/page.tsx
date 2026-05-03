'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getAllPatients, getAllScreenings, getAllOutcomes } from '@/lib/localstore'
import { SESSION_SHORT } from '@/lib/outcomeItems'
import type { Patient, Screening, OutcomeMeasurement, OverallLevel, OutcomeSession } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────
const REASSESS_DAYS = 14
const LEVEL_COLOR: Record<number, string> = { 1: '#22c55e', 2: '#3b82f6', 3: '#f97316', 4: '#ef4444' }
const LEVEL_BG: Record<number, string> = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-orange-100 text-orange-700',
  4: 'bg-red-100 text-red-700',
}
const ALL_SESSIONS: OutcomeSession[] = ['Initial', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Discharge']

// ── Outcome schedule config ──────────────────────────────────────────────────
interface SchedGroup {
  groupKey: string
  label: string
  checkKeys: string[]
  initDcOnly: boolean
  levels: number[]
}

const SCHED: SchedGroup[] = [
  { groupKey: 'ampac',             label: 'AMPAC',                    checkKeys: ['ampac_part1'],                          initDcOnly: false, levels: [1,2,3,4] },
  { groupKey: 'brfa',              label: 'BRFA',                     checkKeys: ['brfa_part1'],                           initDcOnly: true,  levels: [1,2,3,4] },
  { groupKey: 'dyspneaScale',      label: 'Dyspnea scale',            checkKeys: ['dyspneaScale'],                         initDcOnly: false, levels: [1,2,3,4] },
  { groupKey: 'peakCoughFlow',     label: 'Peak Cough Flow',          checkKeys: ['peakCoughFlow'],                        initDcOnly: false, levels: [1,2,3] },
  { groupKey: 'wrightSpirometer',  label: 'Wright Spirometry',        checkKeys: ['wrightSpirometer'],                     initDcOnly: false, levels: [1,2,3] },
  { groupKey: 'gripStrength',      label: 'Grip Strength',            checkKeys: ['gripStrength_left','gripStrength_right'], initDcOnly: false, levels: [1,2] },
  { groupKey: 'cs30',              label: 'CS-30',                    checkKeys: ['cs30'],                                 initDcOnly: false, levels: [2] },
  { groupKey: 'walkTest',          label: '6MWT / 2-min Marching',    checkKeys: ['sixMWT','twoMinMarching'],               initDcOnly: false, levels: [1] },
]

// ── Types ────────────────────────────────────────────────────────────────────
type DueStatus = 'overdue' | 'due-soon' | 'ok' | 'none'

interface MissingItem { groupLabel: string; session: OutcomeSession }

interface PatientRow {
  patient: Patient
  screenings: Screening[]
  outcomes: OutcomeMeasurement[]
  latestScreening: Screening | null
  daysUntilDue: number
  dueStatus: DueStatus
  missingItems: MissingItem[]
  outcomeStatus: 'none' | 'partial' | 'complete'
}

// ── Data helpers ─────────────────────────────────────────────────────────────
function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

function buildRow(p: Patient, allS: Screening[], allO: OutcomeMeasurement[]): PatientRow {
  const screenings = allS
    .filter(s => s.patientId === p.id)
    .sort((a, b) => new Date(b.assessedAt!).getTime() - new Date(a.assessedAt!).getTime())
  const outcomes = allO.filter(o => o.patientId === p.id)
  const latest = screenings[0] ?? null
  const level = latest?.overallLevel as OverallLevel | undefined

  let daysUntilDue = 0
  let dueStatus: DueStatus = 'none'
  if (latest?.assessedAt) {
    const dueDate = new Date(latest.assessedAt)
    dueDate.setDate(dueDate.getDate() + REASSESS_DAYS)
    daysUntilDue = daysBetween(new Date(), dueDate)
    dueStatus = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 3 ? 'due-soon' : 'ok'
  }

  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })
  const startedSessions = Object.keys(bySession) as OutcomeSession[]

  const missingItems: MissingItem[] = []
  if (level) {
    for (const grp of SCHED) {
      if (!grp.levels.includes(level)) continue
      const required: OutcomeSession[] = grp.initDcOnly ? ['Initial', 'Discharge'] : ALL_SESSIONS
      for (const sess of required) {
        if (!startedSessions.includes(sess)) continue
        const items = bySession[sess]?.items ?? {}
        if (!grp.checkKeys.some(k => items[k] !== undefined)) {
          missingItems.push({ groupLabel: grp.label, session: sess })
        }
      }
    }
  }

  const outcomeStatus = outcomes.length === 0 ? 'none' : missingItems.length > 0 ? 'partial' : 'complete'
  return { patient: p, screenings, outcomes, latestScreening: latest, daysUntilDue, dueStatus, missingItems, outcomeStatus }
}

function getWeeklyData(screenings: Screening[]): { label: string; value: number }[] {
  return Array.from({ length: 8 }, (_, i) => {
    const weekIdx = 7 - i
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - start.getDay() - weekIdx * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    const count = screenings.filter(s => {
      if (!s.assessedAt) return false
      const d = new Date(s.assessedAt)
      return d >= start && d <= end
    }).length
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, value: count }
  })
}

function dueDate(s: Screening): Date {
  const d = new Date(s.assessedAt!)
  d.setDate(d.getDate() + REASSESS_DAYS)
  return d
}

// ── Chart components ─────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-3 h-36 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-xs font-semibold text-slate-600">{d.value}</span>
          <div className="w-full rounded-t" style={{
            height: `${Math.max((d.value / max) * 96, d.value > 0 ? 3 : 0)}px`,
            backgroundColor: d.color,
          }} />
          <span className="text-[10px] text-slate-500 text-center leading-none">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function LineChart({ data }: { data: { label: string; value: number }[] }) {
  const hasData = data.some(d => d.value > 0)
  if (!hasData) return (
    <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No assessment data</div>
  )
  const W = 520, H = 130, PL = 28, PR = 12, PT = 18, PB = 28
  const chartW = W - PL - PR
  const chartH = H - PT - PB
  const max = Math.max(...data.map(d => d.value), 1)
  const pts = data.map((d, i) => ({
    x: PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * chartW,
    y: PT + (1 - d.value / max) * chartH,
    ...d,
  }))
  const line = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = `M ${pts[0].x},${PT + chartH} ${pts.map(p => `L ${p.x},${p.y}`).join(' ')} L ${pts[pts.length - 1].x},${PT + chartH} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 144 }}>
      {[0, Math.ceil(max / 2), max].map((v, i) => {
        const y = PT + (1 - v / max) * chartH
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PL - 3} y={y + 4} fontSize="9" fill="#94a3b8" textAnchor="end">{v}</text>
          </g>
        )
      })}
      <path d={area} fill="#3b82f620" />
      <polyline points={line} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
          {p.value > 0 && (
            <text x={p.x} y={p.y - 7} fontSize="9" fill="#3b82f6" textAnchor="middle" fontWeight="600">{p.value}</text>
          )}
          <text x={p.x} y={H - 1} fontSize="9" fill="#94a3b8" textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No data</div>
  )
  const cx = 60, cy = 60, R = 45, ri = 28
  let angle = -Math.PI / 2
  const arcs = segments.map(seg => {
    const a = (seg.value / total) * 2 * Math.PI
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle)
    angle += a
    const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle)
    const xi1 = cx + ri * Math.cos(angle - a), yi1 = cy + ri * Math.sin(angle - a)
    const xi2 = cx + ri * Math.cos(angle), yi2 = cy + ri * Math.sin(angle)
    const largeArc = a > Math.PI ? 1 : 0
    return {
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${xi2.toFixed(2)} ${yi2.toFixed(2)} A ${ri} ${ri} 0 ${largeArc} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)} Z`,
      color: seg.color,
      pct: Math.round((seg.value / total) * 100),
      label: seg.label,
      value: seg.value,
    }
  })
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
        {arcs.map((arc, i) => <path key={i} d={arc.d} fill={arc.color} />)}
        <text x="60" y="56" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1e293b">{total}</text>
        <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#64748b">total</text>
      </svg>
      <div className="space-y-2">
        {arcs.map((arc, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: arc.color }} />
            <span className="text-slate-600">{arc.label}</span>
            <span className="font-bold text-slate-800">{arc.pct}%</span>
            <span className="text-slate-400 text-xs">({arc.value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendChart({ data }: { data: { label: string; initial: number | null; discharge: number | null }[] }) {
  const vals = data.flatMap(d => [d.initial, d.discharge]).filter((v): v is number => v !== null && v > 0)
  if (vals.length === 0) return (
    <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No discharge data yet</div>
  )
  const max = Math.max(...vals, 1)
  const BAR_H = 84

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-5 min-w-max px-2" style={{ height: BAR_H + 40 }}>
          {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="flex items-end gap-1" style={{ height: BAR_H }}>
                <div className="flex flex-col items-center justify-end" style={{ height: BAR_H }}>
                  {d.initial !== null && (
                    <span className="text-[10px] font-semibold text-blue-500 mb-0.5">{Math.round(d.initial)}</span>
                  )}
                  <div className="w-5 rounded-t bg-blue-400" style={{
                    height: d.initial !== null && d.initial > 0 ? `${(d.initial / max) * (BAR_H - 18)}px` : '0',
                    minHeight: d.initial !== null && d.initial > 0 ? '2px' : '0',
                  }} />
                </div>
                <div className="flex flex-col items-center justify-end" style={{ height: BAR_H }}>
                  {d.discharge !== null && (
                    <span className="text-[10px] font-semibold text-emerald-500 mb-0.5">{Math.round(d.discharge)}</span>
                  )}
                  <div className="w-5 rounded-t bg-emerald-400" style={{
                    height: d.discharge !== null && d.discharge > 0 ? `${(d.discharge / max) * (BAR_H - 18)}px` : '0',
                    minHeight: d.discharge !== null && d.discharge > 0 ? '2px' : '0',
                  }} />
                </div>
              </div>
              <span className="text-[10px] text-slate-500 text-center leading-tight max-w-[64px]">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2 px-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-400" />
          <span className="text-xs text-slate-500">Initial (avg)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-400" />
          <span className="text-xs text-slate-500">Discharge (avg)</span>
        </div>
      </div>
    </div>
  )
}

// ── Patient Detail Modal ──────────────────────────────────────────────────────
function PatientModal({ row, onClose }: { row: PatientRow; onClose: () => void }) {
  const { patient, latestScreening, outcomes, missingItems } = row
  const level = latestScreening?.overallLevel as OverallLevel | undefined

  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })

  const applicableGroups = level ? SCHED.filter(g => g.levels.includes(level)) : []

  function cellStatus(grp: SchedGroup, sess: OutcomeSession): 'has' | 'missing' | 'skip' {
    const required: OutcomeSession[] = grp.initDcOnly ? ['Initial', 'Discharge'] : ALL_SESSIONS
    if (!required.includes(sess)) return 'skip'
    if (!bySession[sess]) return 'skip'
    const items = bySession[sess]?.items ?? {}
    return grp.checkKeys.some(k => items[k] !== undefined) ? 'has' : 'missing'
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">{patient.firstName} {patient.lastName}</h3>
            <p className="text-slate-500 text-sm font-mono">HN: {patient.hn}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>

        {/* Patient Info Grid */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100">
          {[
            { label: 'อายุ', value: `${patient.age} ปี` },
            { label: 'เพศ', value: patient.sex },
            { label: 'Location', value: patient.location },
            { label: 'สัญชาติ', value: patient.nationality },
          ].map((item, i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="font-semibold text-slate-800 text-sm">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Level + Program badges */}
        {latestScreening && (
          <div className="px-5 py-3 border-b border-slate-100 flex gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${LEVEL_BG[latestScreening.overallLevel]}`}>
              Level {latestScreening.overallLevel} — {latestScreening.levelName}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${latestScreening.programType === 'Standard' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              {latestScreening.programType}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-600">
              Last: {latestScreening.assessedAt ? new Date(latestScreening.assessedAt).toLocaleDateString('th-TH') : '–'}
            </span>
          </div>
        )}

        {/* Outcome Schedule Table */}
        <div className="p-5">
          <h4 className="font-semibold text-slate-700 mb-3 text-sm">Outcome Schedule</h4>
          {applicableGroups.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[130px]">Item</th>
                    {ALL_SESSIONS.map(s => (
                      <th key={s} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[48px]">{SESSION_SHORT[s]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {applicableGroups.map(grp => (
                    <tr key={grp.groupKey}>
                      <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white">{grp.label}</td>
                      {ALL_SESSIONS.map(sess => {
                        const status = cellStatus(grp, sess)
                        return (
                          <td key={sess} className="px-2 py-2 text-center">
                            {status === 'has'     && <span className="text-emerald-500 font-bold">✓</span>}
                            {status === 'missing' && <span className="text-red-500 font-bold">✗</span>}
                            {status === 'skip'    && <span className="text-slate-200 text-xs">–</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No screening data available</p>
          )}

          {missingItems.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-red-700 text-xs font-semibold mb-1.5">Missing — {missingItems.length} items:</p>
              <div className="flex flex-wrap gap-1">
                {missingItems.map((m, i) => (
                  <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    {m.groupLabel} / {SESSION_SHORT[m.session]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-5 pb-5 flex gap-3">
          <Link href={`/patients/${patient.id}/screening/new`}
            className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            onClick={onClose}>
            Go to Assessment
          </Link>
          <Link href={`/patients/${patient.id}/outcome`}
            className="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            onClick={onClose}>
            Record Outcome
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Password Gate ─────────────────────────────────────────────────────────────
const AUTH_KEY = 'cpt_admin_auth'
const ADMIN_PASSWORD = '2813'

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1')
      onAuth()
    } else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-slate-800">Admin Access</h2>
          <p className="text-slate-500 text-sm mt-1">กรอก password เพื่อเข้าใช้งาน</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            placeholder="Password"
            autoFocus
            className={`w-full border rounded-lg px-4 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 ${
              error
                ? 'border-red-400 focus:ring-red-200 bg-red-50'
                : 'border-slate-300 focus:ring-blue-200 focus:border-blue-500'
            }`}
          />
          {error && (
            <p className="text-red-600 text-sm text-center font-medium">Incorrect password</p>
          )}
          <button type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors">
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<PatientRow | null>(null)
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'due-soon' | 'ok'>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    setAuthed(sessionStorage.getItem(AUTH_KEY) === '1')
  }, [])

  useEffect(() => {
    if (!authed) return
    Promise.all([getAllPatients(), getAllScreenings(), getAllOutcomes()])
      .then(([p, s, o]) => {
        setPatients(p)
        setScreenings(s)
        setOutcomes(o)
        setLoading(false)
      })
  }, [authed])

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
  }

  const rows = useMemo(
    () => patients.map(p => buildRow(p, screenings, outcomes)),
    [patients, screenings, outcomes]
  )

  // ── Overview stats ─────────────────────────────────────────────────────────
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const weekAssessments  = screenings.filter(s => s.assessedAt && new Date(s.assessedAt) >= weekStart).length
  const monthAssessments = screenings.filter(s => s.assessedAt && new Date(s.assessedAt) >= monthStart).length

  const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  rows.forEach(r => { if (r.latestScreening) levelCounts[r.latestScreening.overallLevel]++ })

  // ── Chart data ─────────────────────────────────────────────────────────────
  const weeklyData = useMemo(() => getWeeklyData(screenings), [screenings])

  const programCounts = useMemo(() => {
    const c = { Standard: 0, Intensive: 0 }
    rows.forEach(r => { if (r.latestScreening) c[r.latestScreening.programType]++ })
    return c
  }, [rows])

  const trendData = useMemo(() => {
    const METRICS = [
      { label: 'AMPAC',    keys: ['ampac_part1','ampac_part2','ampac_part3'] },
      { label: 'BRFA',     keys: ['brfa_part1','brfa_part2','brfa_q20','brfa_q21'] },
      { label: 'Dyspnea',  keys: ['dyspneaScale'] },
      { label: 'Peak CF',  keys: ['peakCoughFlow'] },
      { label: 'Wright',   keys: ['wrightSpirometer'] },
      { label: 'Grip (R)', keys: ['gripStrength_right'] },
      { label: 'CS-30',    keys: ['cs30'] },
    ]
    return METRICS.map(m => {
      const initVals: number[] = [], dcVals: number[] = []
      rows.forEach(r => {
        const byS: Record<string, OutcomeMeasurement> = {}
        r.outcomes.forEach(o => { byS[o.session] = o })
        const avg = (sess?: OutcomeMeasurement) => {
          if (!sess) return null
          const vs = m.keys.map(k => sess.items[k]?.value).filter((v): v is number => v !== undefined)
          return vs.length > 0 ? vs.reduce((a, b) => a + b) / vs.length : null
        }
        const iv = avg(byS['Initial']), dv = avg(byS['Discharge'])
        if (iv !== null) initVals.push(iv)
        if (dv !== null) dcVals.push(dv)
      })
      const mean = (a: number[]) => a.length > 0 ? a.reduce((x, y) => x + y) / a.length : null
      return { label: m.label, initial: mean(initVals), discharge: mean(dcVals) }
    })
  }, [rows])

  // ── Filtered table rows ────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let r = [...rows]
    if (levelFilter !== 'all') r = r.filter(row => row.latestScreening?.overallLevel === levelFilter)
    if (statusFilter !== 'all') r = r.filter(row => row.dueStatus === statusFilter)
    r.sort((a, b) => {
      const aV = a.latestScreening ? a.daysUntilDue : 9999
      const bV = b.latestScreening ? b.daysUntilDue : 9999
      return sortDir === 'asc' ? aV - bV : bV - aV
    })
    return r
  }, [rows, levelFilter, statusFilter, sortDir])

  const dueRows   = rows.filter(r => r.dueStatus === 'overdue' || r.dueStatus === 'due-soon')
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  const alertRows = rows.filter(r => r.missingItems.length > 0)

  if (authed === null) return null
  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />
  if (loading) return <div className="text-center py-16 text-slate-400">Loading...</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Admin Dashboard</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{now.toLocaleDateString('th-TH', { dateStyle: 'long' })}</span>
          <button onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors">
            Logout
          </button>
        </div>
      </div>

      {/* ── Overview Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Total Patients</div>
          <div className="text-3xl font-bold text-slate-800">{patients.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Assessments this week</div>
          <div className="text-3xl font-bold text-blue-600">{weekAssessments}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Assessments this month</div>
          <div className="text-3xl font-bold text-blue-600">{monthAssessments}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-2">Level Distribution</div>
          <div className="space-y-1.5">
            {([1, 2, 3, 4] as const).map(l => (
              <div key={l} className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${LEVEL_BG[l]}`}>L{l}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{
                    width: `${patients.length > 0 ? (levelCounts[l] / patients.length) * 100 : 0}%`,
                    backgroundColor: LEVEL_COLOR[l],
                  }} />
                </div>
                <span className="text-xs text-slate-600 w-5 text-right font-semibold">{levelCounts[l]}</span>
                <span className="text-xs text-slate-400 w-8">
                  {patients.length > 0 ? `${Math.round((levelCounts[l] / patients.length) * 100)}%` : '0%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Level Distribution</h3>
          <BarChart data={[
            { label: 'L1 Mild',        value: levelCounts[1], color: LEVEL_COLOR[1] },
            { label: 'L2 Moderate',    value: levelCounts[2], color: LEVEL_COLOR[2] },
            { label: 'L3 Mild Severe', value: levelCounts[3], color: LEVEL_COLOR[3] },
            { label: 'L4 Severe',      value: levelCounts[4], color: LEVEL_COLOR[4] },
          ]} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Program Type</h3>
          <DonutChart segments={[
            { label: 'Standard',  value: programCounts.Standard,  color: '#22c55e' },
            { label: 'Intensive', value: programCounts.Intensive, color: '#f97316' },
          ]} />
        </div>
      </div>

      {/* ── Weekly Line Chart ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Weekly Assessments — last 8 weeks</h3>
        <LineChart data={weeklyData} />
      </div>

      {/* ── Outcome Trend ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Outcome Trend — Initial vs Discharge (avg across all patients)</h3>
        <TrendChart data={trendData} />
      </div>

      {/* ── Reassessment Due Alert ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
          <h3 className="font-semibold text-amber-800 text-sm">Reassessment Due (every {REASSESS_DAYS} days)</h3>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${dueRows.length > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
            {dueRows.length} patients
          </span>
        </div>
        {dueRows.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No patients due for reassessment</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dueRows.map(row => {
              const isOverdue = row.dueStatus === 'overdue'
              const dd = row.latestScreening ? dueDate(row.latestScreening) : null
              return (
                <div key={row.patient.id}
                  className={`flex items-center px-5 py-3 gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${isOverdue ? 'border-l-4 border-red-400' : 'border-l-4 border-yellow-400'}`}
                  onClick={() => setSelectedRow(row)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">
                      {row.patient.firstName} {row.patient.lastName}
                    </div>
                    <div className="text-xs text-slate-500 flex gap-2 mt-0.5 flex-wrap">
                      <span className="font-mono">{row.patient.hn}</span>
                      <span>{row.patient.location}</span>
                      {row.latestScreening && (
                        <span className={`px-1.5 rounded font-semibold ${LEVEL_BG[row.latestScreening.overallLevel]}`}>
                          L{row.latestScreening.overallLevel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-500">
                      Last: {row.latestScreening?.assessedAt
                        ? new Date(row.latestScreening.assessedAt).toLocaleDateString('th-TH')
                        : '–'}
                    </div>
                    <div className={`text-xs font-bold mt-0.5 ${isOverdue ? 'text-red-600' : 'text-yellow-600'}`}>
                      {isOverdue
                        ? `เกินกำหนด ${Math.abs(row.daysUntilDue)} วัน`
                        : `ครบใน ${row.daysUntilDue} วัน`}
                    </div>
                    <div className="text-xs text-slate-400">
                      Due: {dd ? dd.toLocaleDateString('th-TH') : '–'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Outcome Alert ── */}
      {alertRows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-red-100 bg-red-50 flex items-center justify-between">
            <h3 className="font-semibold text-red-800 text-sm">Outcome Alert — Missing Items</h3>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
              {alertRows.length} patients
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {alertRows.map(row => (
              <div key={row.patient.id}
                className="flex items-center px-5 py-3 gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setSelectedRow(row)}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm">{row.patient.firstName} {row.patient.lastName}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="font-mono">{row.patient.hn}</span>
                    {row.latestScreening && (
                      <span className={`px-1.5 rounded font-semibold ${LEVEL_BG[row.latestScreening.overallLevel]}`}>
                        L{row.latestScreening.overallLevel}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {row.missingItems.slice(0, 6).map((m, i) => (
                      <span key={i} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                        {m.groupLabel} / {SESSION_SHORT[m.session]}
                      </span>
                    ))}
                    {row.missingItems.length > 6 && (
                      <span className="text-xs text-slate-400">+{row.missingItems.length - 6} more</span>
                    )}
                  </div>
                </div>
                <span className="text-slate-300 text-xl shrink-0">›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Patient List Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-700 text-sm flex-1 min-w-0">
            All Patients <span className="text-slate-400 font-normal">({filteredRows.length})</span>
          </h3>
          <select value={levelFilter}
            onChange={e => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-blue-400">
            <option value="all">All Levels</option>
            <option value={1}>L1 Mild</option>
            <option value={2}>L2 Moderate</option>
            <option value={3}>L3 Mild Severe</option>
            <option value={4}>L4 Severe</option>
          </select>
          <select value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-blue-400">
            <option value="all">All Status</option>
            <option value="overdue">Overdue</option>
            <option value="due-soon">Due Soon</option>
            <option value="ok">OK</option>
          </select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            Next Due {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['HN', 'Name', 'Location', 'Level', 'Program', 'Last Assessment', 'Next Due', 'Outcomes'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">No patients found</td></tr>
              ) : filteredRows.map(row => {
                const dd = row.latestScreening ? dueDate(row.latestScreening) : null
                const dueColor = row.dueStatus === 'overdue' ? 'text-red-600 font-semibold'
                  : row.dueStatus === 'due-soon' ? 'text-yellow-600 font-semibold'
                  : 'text-slate-600'
                return (
                  <tr key={row.patient.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedRow(row)}>
                    <td className="px-4 py-2.5 font-mono text-slate-600 text-xs">{row.patient.hn}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {row.patient.firstName} {row.patient.lastName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{row.patient.location}</td>
                    <td className="px-4 py-2.5">
                      {row.latestScreening
                        ? <span className={`px-2 py-0.5 rounded text-xs font-semibold ${LEVEL_BG[row.latestScreening.overallLevel]}`}>L{row.latestScreening.overallLevel}</span>
                        : <span className="text-slate-300 text-xs">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{row.latestScreening?.programType ?? '–'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {row.latestScreening?.assessedAt
                        ? new Date(row.latestScreening.assessedAt).toLocaleDateString('th-TH')
                        : '–'}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${dueColor}`}>
                      {dd ? dd.toLocaleDateString('th-TH') : '–'}
                      {row.dueStatus === 'overdue'   && ` (${Math.abs(row.daysUntilDue)}d late)`}
                      {row.dueStatus === 'due-soon'  && ` (${row.daysUntilDue}d)`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        row.outcomeStatus === 'complete' ? 'bg-emerald-100 text-emerald-700'
                          : row.outcomeStatus === 'partial' ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {row.outcomeStatus === 'complete' ? 'Complete'
                          : row.outcomeStatus === 'partial' ? 'Partial'
                          : 'None'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Patient Detail Modal ── */}
      {selectedRow && <PatientModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  )
}
