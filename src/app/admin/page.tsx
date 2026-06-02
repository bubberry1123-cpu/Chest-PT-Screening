'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { getAllPatients, getAllScreenings, getAllOutcomes } from '@/lib/localstore'
import { SESSION_SHORT } from '@/lib/outcomeItems'
import { useAuth } from '@/lib/auth-context'
import { getAllUsers, approveUser, rejectUser, changeUserRole, deactivateUser, getActivityLogs } from '@/lib/authStore'
import type { Patient, Screening, OutcomeMeasurement, OverallLevel, OutcomeSession } from '@/types'
import type { UserProfile, ActivityLog } from '@/types'
import { exportPatientList, exportOutcomeData, exportMonthlySummary, exportChartsPDF } from '@/lib/exportUtils'
import { WARDS } from '@/lib/wards'
import { OutcomeSummarySection } from '@/components/OutcomeSummarySection'
import ConfirmDialog from '@/components/ConfirmDialog'

// ── Constants ────────────────────────────────────────────────────────────────
const REASSESS_DAYS = 14
const OUTCOME_REAS_DAYS = 15  // Outcome Reassessment interval
const LEVEL_COLOR: Record<number, string> = { 1: '#22c55e', 2: '#3b82f6', 3: '#f97316', 4: '#ef4444' }
const LEVEL_BG: Record<number, string> = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-orange-100 text-orange-700',
  4: 'bg-red-100 text-red-700',
}
const ALL_SESSIONS: OutcomeSession[] = ['Initial','Reassessment 1','Reassessment 2','Reassessment 3','Reassessment 4','Reassessment 5','Reassessment 6','Reassessment 7','Reassessment 8','Reassessment 9','Reassessment 10','Discharge']

// ── Outcome schedule config ──────────────────────────────────────────────────
// initDcOnly: true  = BRFA schedule (Initial + Discharge only, alert when no Discharge yet)
// initDcOnly: false = every-15-days schedule (Initial + RA 1..N + Discharge)
interface SchedGroup {
  groupKey: string
  label: string
  checkKeys: string[]
  initDcOnly: boolean
  levels: number[]
}

const SCHED: SchedGroup[] = [
  { groupKey: 'ampac',            label: 'AMPAC',            checkKeys: ['ampac_part1'],                           initDcOnly: false, levels: [1,2,3,4] },
  { groupKey: 'brfa',             label: 'BRFA',             checkKeys: ['brfa_part1'],                            initDcOnly: true,  levels: [1,2,3,4] },
  { groupKey: 'peakCoughFlow',    label: 'Peak Cough Flow',  checkKeys: ['peakCoughFlow'],                         initDcOnly: false, levels: [1,2,3] },
  { groupKey: 'wrightSpirometer', label: 'Wright Spirometry',checkKeys: ['wrightSpirometer'],                      initDcOnly: false, levels: [1,2,3] },
  { groupKey: 'gripStrength',     label: 'Grip Strength',    checkKeys: ['gripStrength_left','gripStrength_right'], initDcOnly: false, levels: [1,2] },
  { groupKey: 'cs30',             label: 'CS-30',            checkKeys: ['cs30'],                                  initDcOnly: false, levels: [1,2] },
  { groupKey: 'walkTest',         label: '6MWT or 2MST',     checkKeys: ['sixMWT','twoMinMarching'],                initDcOnly: false, levels: [1] },
  { groupKey: 'twoMeterWalk',     label: '2MWT',             checkKeys: ['twoMeterWalk'],                           initDcOnly: false, levels: [2] },
]

// ── Types ────────────────────────────────────────────────────────────────────
type DueStatus = 'overdue' | 'due-soon' | 'ok' | 'none'
type OutcomeAlertStatus = 'none' | 'overdue' | 'due-soon'

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
  expectedReassCount: number
  daysUntilNextReas: number | null
  outcomeAlertStatus: OutcomeAlertStatus
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

  // ── Screening reassessment due (every 14 days from latest screening) ──────
  let daysUntilDue = 0
  let dueStatus: DueStatus = 'none'
  if (latest?.assessedAt) {
    const dd = new Date(latest.assessedAt)
    dd.setDate(dd.getDate() + REASSESS_DAYS)
    daysUntilDue = daysBetween(new Date(), dd)
    dueStatus = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 3 ? 'due-soon' : 'ok'
  }

  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })
  const hasDischarge = !!bySession['Discharge']

  // ── Expected Reassessment count (15-day intervals from Initial outcome or screening) ──
  const refDate: Date | null = bySession['Initial']?.recordedAt
    ? new Date(bySession['Initial'].recordedAt as Date)
    : latest?.assessedAt ? new Date(latest.assessedAt) : null

  const today = new Date()
  let expectedReassCount = 0
  let daysUntilNextReas: number | null = null

  if (refDate) {
    const daysSince = Math.floor((today.getTime() - refDate.getTime()) / 86400000)
    expectedReassCount = Math.min(Math.max(0, Math.floor(daysSince / OUTCOME_REAS_DAYS)), 10)
    if (expectedReassCount < 10) {
      daysUntilNextReas = OUTCOME_REAS_DAYS - (daysSince % OUTCOME_REAS_DAYS)
    }
  }

  // ── Missing items ─────────────────────────────────────────────────────────
  const missingItems: MissingItem[] = []
  if (level) {
    for (const grp of SCHED) {
      if (!grp.levels.includes(level)) continue

      if (grp.initDcOnly) {
        // BRFA: check Initial; alert Discharge only if Initial BRFA recorded but no Discharge yet
        const initO = bySession['Initial']
        if (initO && !grp.checkKeys.some(k => initO.items[k] !== undefined)) {
          missingItems.push({ groupLabel: grp.label, session: 'Initial' })
        }
        if (hasDischarge) {
          const dcO = bySession['Discharge']!
          if (!grp.checkKeys.some(k => dcO.items[k] !== undefined)) {
            missingItems.push({ groupLabel: grp.label, session: 'Discharge' })
          }
        } else if (initO && grp.checkKeys.some(k => initO.items[k] !== undefined)) {
          // Initial BRFA done but no Discharge yet → flag
          missingItems.push({ groupLabel: grp.label, session: 'Discharge' })
        }
      } else {
        // Every-15-days: check Initial + expected Reassessments + Discharge (if exists)
        const sessToCheck: OutcomeSession[] = ['Initial']
        for (let i = 1; i <= expectedReassCount; i++) {
          sessToCheck.push(`Reassessment ${i}` as OutcomeSession)
        }
        if (hasDischarge) sessToCheck.push('Discharge')

        for (const sess of sessToCheck) {
          const o = bySession[sess]
          if (!o || !grp.checkKeys.some(k => o.items[k] !== undefined)) {
            missingItems.push({ groupLabel: grp.label, session: sess })
          }
        }
      }
    }
  }

  // ── Outcome alert status ──────────────────────────────────────────────────
  let outcomeAlertStatus: OutcomeAlertStatus = 'none'
  if (level) {
    const nonBrfaGroups = SCHED.filter(g => g.levels.includes(level) && !g.initDcOnly)
    const overdueFound = nonBrfaGroups.some(grp => {
      const sessToCheck: OutcomeSession[] = ['Initial']
      for (let i = 1; i <= expectedReassCount; i++) sessToCheck.push(`Reassessment ${i}` as OutcomeSession)
      return sessToCheck.some(sess => {
        const o = bySession[sess]
        return !o || !grp.checkKeys.some(k => o.items[k] !== undefined)
      })
    })
    if (overdueFound) {
      outcomeAlertStatus = 'overdue'
    } else if (daysUntilNextReas !== null && daysUntilNextReas <= 3 && nonBrfaGroups.length > 0) {
      outcomeAlertStatus = 'due-soon'
    }
  }

  const outcomeStatus = outcomes.length === 0 ? 'none' : missingItems.length > 0 ? 'partial' : 'complete'
  return {
    patient: p, screenings, outcomes, latestScreening: latest,
    daysUntilDue, dueStatus, missingItems, outcomeStatus,
    expectedReassCount, daysUntilNextReas, outcomeAlertStatus,
  }
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

// ── ERAS Grouped Bar Chart ────────────────────────────────────────────────────
function ErasGroupedChart({ data }: {
  data: { label: string; unit: string; phaseAvgs: (number | null)[] }[]
}) {
  const PHASE_COLORS = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6']
  const PHASE_LABELS = ['Pre-hab', 'Pre-op', 'D/C', 'F/U']
  const BAR_H = 84

  const hasAnyData = data.some(m => m.phaseAvgs.some(v => v !== null))
  if (!hasAnyData) return (
    <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No ERAS outcome data yet</div>
  )

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-6 min-w-max px-2" style={{ height: BAR_H + 52 }}>
          {data.map((metric, mi) => {
            const vals = metric.phaseAvgs.filter((v): v is number => v !== null)
            const maxV = vals.length > 0 ? Math.max(...vals, 1) : 1
            return (
              <div key={mi} className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-1" style={{ height: BAR_H }}>
                  {metric.phaseAvgs.map((v, pi) => (
                    <div key={pi} className="flex flex-col items-center justify-end" style={{ height: BAR_H }}>
                      {v !== null && (
                        <span className="text-[9px] font-semibold mb-0.5" style={{ color: PHASE_COLORS[pi] }}>
                          {v % 1 === 0 ? v : v.toFixed(1)}
                        </span>
                      )}
                      <div
                        className="w-5 rounded-t"
                        style={{
                          backgroundColor: PHASE_COLORS[pi],
                          height: v !== null && v > 0 ? `${Math.max((v / maxV) * (BAR_H - 20), 3)}px` : '0',
                          opacity: v !== null ? 1 : 0.15,
                          minHeight: v !== null ? '2px' : '0',
                        }}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-slate-700 font-semibold text-center leading-tight">{metric.label}</span>
                <span className="text-[9px] text-slate-400 text-center leading-none">{metric.unit}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2 px-2 flex-wrap">
        {PHASE_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PHASE_COLORS[i] }} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
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

  function cellStatus(grp: SchedGroup, sess: OutcomeSession): 'has' | 'missing' | 'pending' | 'skip' {
    if (grp.initDcOnly) {
      // BRFA: only Initial + Discharge columns active
      if (sess !== 'Initial' && sess !== 'Discharge') return 'skip'
      if (sess === 'Discharge' && !bySession['Discharge']) return 'skip'
    } else {
      if (sess === 'Discharge' && !bySession['Discharge']) return 'skip'
      if (sess !== 'Initial' && sess !== 'Discharge') {
        const n = parseInt(sess.replace('Reassessment ', ''))
        if (isNaN(n)) return 'skip'
        if (n > row.expectedReassCount) return 'pending'
      }
    }
    const o = bySession[sess]
    if (!o) return 'missing'
    return grp.checkKeys.some(k => o.items[k] !== undefined) ? 'has' : 'missing'
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
            <div key={i} className="bg-[#F8FAFC] rounded-[10px] p-2.5">
              <div className="text-[10px] uppercase text-slate-400 tracking-wide">{item.label}</div>
              <div className="text-sm font-medium text-slate-700">{item.value}</div>
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
                            {status === 'pending' && <span className="text-slate-300 text-xs">·</span>}
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
            className="flex-1 text-center bg-[#0C447C] hover:bg-[#185FA5] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            onClick={onClose}>
            Go to Assessment
          </Link>
          <Link href={`/patients/${patient.id}/outcome`}
            className="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            onClick={onClose}>
            Record Outcome
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── User Management Sub-component ─────────────────────────────────────────────
function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  const load = async () => {
    setLoading(true)
    try { setUsers(await getAllUsers()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const STATUS_COLOR: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-600',
  }

  if (loading) return <div className="text-center py-16 text-slate-400">Loading users...</div>

  return (
    <div>
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel="Confirm"
          onConfirm={() => { const fn = confirmAction.onConfirm; setConfirmAction(null); fn() }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800">User Management</h3>
        <span className="text-xs text-slate-500">{users.length} users</span>
      </div>
      <div className="space-y-3">
        {users.map(u => (
          <div key={u.uid} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800 text-sm">{u.displayName}</div>
                <div className="text-xs text-slate-500 mt-0.5">{u.email}{u.employeeId ? ` · ID: ${u.employeeId}` : ''}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[u.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {u.status.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {u.role.toUpperCase()}
                  </span>
                  {u.createdAt && (
                    <span className="text-xs text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString('th-TH')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {u.status === 'pending' && (
                  <>
                    <button onClick={async () => { await approveUser(u.uid); load() }}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg transition-colors">
                      Approve
                    </button>
                    <button onClick={() => setConfirmAction({
                        title: 'Reject User',
                        message: `Reject "${u.displayName || u.email}"?\nThey will not be able to log in.`,
                        onConfirm: async () => { await rejectUser(u.uid); load() },
                      })}
                      className="text-xs border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors">
                      Reject
                    </button>
                  </>
                )}
                {u.status === 'active' && (
                  <>
                    <button onClick={async () => { await changeUserRole(u.uid, u.role === 'admin' ? 'staff' : 'admin'); load() }}
                      className="text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-1 rounded-lg transition-colors">
                      {`→ ${u.role === 'admin' ? 'Staff' : 'Admin'}`}
                    </button>
                    <button onClick={() => setConfirmAction({
                        title: 'Deactivate User',
                        message: `Deactivate "${u.displayName || u.email}"?\nThey will lose access until re-activated.`,
                        onConfirm: async () => { await deactivateUser(u.uid); load() },
                      })}
                      className="text-xs border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors">
                      Deactivate
                    </button>
                  </>
                )}
                {u.status === 'rejected' && (
                  <button onClick={async () => { await approveUser(u.uid); load() }}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg transition-colors">
                    Re-activate
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity Log Sub-component ────────────────────────────────────────────────
function ActivityLogTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActivityLogs(100).then(setLogs).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-16 text-slate-400">Loading logs...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800">Activity Log</h3>
        <span className="text-xs text-slate-500">{logs.length} recent events</span>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{log.userName}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{log.action}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{log.entityLabel}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-sm">No activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const { isAdmin } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<PatientRow | null>(null)
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'due-soon' | 'ok'>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportDateFrom, setExportDateFrom] = useState('')
  const [exportDateTo, setExportDateTo] = useState('')
  const [exportMonth, setExportMonth] = useState(new Date().getMonth())
  const [exportYear, setExportYear] = useState(new Date().getFullYear())
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [syncAllConfirm, setSyncAllConfirm] = useState(false)
  const [syncAllLoading, setSyncAllLoading] = useState(false)
  const [syncAllError, setSyncAllError] = useState<string | null>(null)
  const [syncAllResult, setSyncAllResult] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs'>('dashboard')
  const chartsRef = useRef<HTMLDivElement>(null)

  if (!isAdmin) return <div className="text-center py-16 text-slate-400">Access denied.</div>

  useEffect(() => {
    Promise.all([getAllPatients(), getAllScreenings(), getAllOutcomes()])
      .then(([p, s, o]) => { setPatients(p); setScreenings(s); setOutcomes(o); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleExport = async (type: 'patients' | 'outcomes' | 'monthly' | 'pdf') => {
    setExportLoading(true)
    setExportOpen(false)
    setExportError(null)
    try {
      const from = exportDateFrom ? new Date(exportDateFrom) : null
      const to = exportDateTo ? new Date(exportDateTo) : null
      if (type === 'patients') await exportPatientList(patients, screenings, from, to)
      else if (type === 'outcomes') await exportOutcomeData(patients, outcomes, from, to)
      else if (type === 'monthly') await exportMonthlySummary(patients, screenings, exportYear, exportMonth)
      else if (type === 'pdf') {
        if (!chartsRef.current) throw new Error('Switch to the Dashboard tab first, then retry.')
        await exportChartsPDF(chartsRef.current, { totalPatients: patients.length, weekAssessments, monthAssessments, levelCounts }, from, to)
      }
    } catch (err) {
      console.error('[Export PDF] failed:', err)
      setExportError(err instanceof Error ? err.message : 'Export failed — check the browser console for details.')
    } finally {
      setExportLoading(false)
    }
  }

  const handleSyncAll = async () => {
    setSyncAllLoading(true)
    setSyncAllError(null)
    setSyncAllResult(null)
    try {
      const res = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncAllResult(`Synced ${data.synced} rows from ${patients.length} patient${patients.length !== 1 ? 's' : ''}.`)
    } catch (err) {
      setSyncAllError(err instanceof Error ? err.message : 'Sync failed. Please try again.')
    } finally {
      setSyncAllLoading(false)
    }
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

  const avgLos = useMemo(() => {
    const losList: number[] = []
    rows.forEach(r => {
      const byS: Record<string, OutcomeMeasurement> = {}
      r.outcomes.forEach(o => { byS[o.session] = o })
      const initDate = byS['Initial']?.assessmentDate
      const dcDate = byS['Discharge']?.assessmentDate
      if (initDate && dcDate) {
        const days = Math.round((new Date(dcDate).getTime() - new Date(initDate).getTime()) / 86_400_000)
        if (days >= 0) losList.push(days)
      }
    })
    return losList.length > 0
      ? Math.round(losList.reduce((a, b) => a + b, 0) / losList.length)
      : null
  }, [rows])

  // ── Chart data ─────────────────────────────────────────────────────────────
  const weeklyData = useMemo(() => getWeeklyData(screenings), [screenings])

  const trendData = useMemo(() => {
    const METRICS = [
      { label: 'AMPAC',    keys: ['ampac_part1','ampac_part2','ampac_part3'] },
      { label: 'BRFA',     keys: ['brfa_part1','brfa_part2','brfa_q20','brfa_q21'] },
      { label: 'mMRC',     keys: ['dyspneaScale'] },
      { label: 'Peak CF',  keys: ['peakCoughFlow'] },
      { label: 'Wright',   keys: ['wrightSpirometer'] },
      { label: 'Grip (R)', keys: ['gripStrength_right'] },
      { label: 'CS-30',    keys: ['cs30'] },
      { label: '6MWT',     keys: ['sixMWT'] },
      { label: '2MST',     keys: ['twoMinMarching'] },
      { label: '2MWT',     keys: ['twoMeterWalk'] },
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

  // ── ERAS stats ─────────────────────────────────────────────────────────────
  const erasRows = useMemo(
    () => rows.filter(r => (r.patient.assessmentType ?? r.latestScreening?.assessmentType) === 'ERAS'),
    [rows]
  )

  const erasPhaseCounts = useMemo(() => {
    const counts = { Prehabilitation: 0, 'Pre-op': 0, DC: 0, 'Follow-up': 0 }
    const phaseOrder = ['Prehabilitation', 'Pre-op', 'DC', 'Follow-up'] as const
    erasRows.forEach(r => {
      const byP: Record<string, OutcomeMeasurement> = {}
      r.outcomes.forEach(o => { byP[o.session] = o })
      // Current phase = last phase with data recorded
      let current: typeof phaseOrder[number] = 'Prehabilitation'
      for (const p of phaseOrder) {
        if (byP[p]) current = p
      }
      counts[current]++
    })
    return counts
  }, [erasRows])

  const erasLevelCounts = useMemo(() => {
    const c: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    erasRows.forEach(r => { if (r.latestScreening) c[r.latestScreening.overallLevel]++ })
    return c
  }, [erasRows])

  const erasAvgLos = useMemo(() => {
    const list: number[] = []
    erasRows.forEach(r => {
      const byP: Record<string, OutcomeMeasurement> = {}
      r.outcomes.forEach(o => { byP[o.session] = o })
      const d0 = byP['Prehabilitation']?.assessmentDate
      const d1 = byP['DC']?.assessmentDate
      if (d0 && d1) {
        const days = Math.round((new Date(d1).getTime() - new Date(d0).getTime()) / 86_400_000)
        if (days >= 0) list.push(days)
      }
    })
    return list.length > 0 ? Math.round(list.reduce((a, b) => a + b) / list.length) : null
  }, [erasRows])

  const ERAS_METRICS = [
    { key: 'peakCoughFlow',      label: 'Peak CF',  unit: 'L/min' },
    { key: 'wrightSpirometer',   label: 'Wright',   unit: 'mL' },
    { key: 'gripStrength_right', label: 'Grip (R)', unit: 'kg' },
    { key: 'cs30',               label: 'CS-30',    unit: 'stands' },
    { key: 'erasTwoMWalk',       label: '2-Meter',  unit: 'sec' },
  ] as const

  const ERAS_PHASES_LIST = ['Prehabilitation', 'Pre-op', 'DC', 'Follow-up'] as const
  const ERAS_PHASE_SHORT_MAP: Record<string, string> = {
    'Prehabilitation': 'Pre-hab', 'Pre-op': 'Pre-op', 'DC': 'D/C', 'Follow-up': 'F/U',
  }

  const erasTrendData = useMemo(() => {
    return ERAS_METRICS.map(m => {
      const phaseAvgs = ERAS_PHASES_LIST.map(phase => {
        const vals: number[] = []
        erasRows.forEach(r => {
          const o = r.outcomes.find(x => x.session === phase)
          const v = o?.items[m.key]?.value
          if (v !== undefined) vals.push(v)
        })
        return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b) / vals.length) * 10) / 10 : null
      })
      return { label: m.label, unit: m.unit, phaseAvgs }
    })
  }, [erasRows])

  // ── Filtered table rows ────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let r = [...rows]
    if (levelFilter !== 'all') r = r.filter(row => row.latestScreening?.overallLevel === levelFilter)
    if (statusFilter !== 'all') r = r.filter(row => row.dueStatus === statusFilter)
    if (locationFilter !== 'all') r = r.filter(row => row.patient.location === locationFilter)
    r.sort((a, b) => {
      const aV = a.latestScreening ? a.daysUntilDue : 9999
      const bV = b.latestScreening ? b.daysUntilDue : 9999
      return sortDir === 'asc' ? aV - bV : bV - aV
    })
    return r
  }, [rows, levelFilter, statusFilter, locationFilter, sortDir])

  const dueRows   = rows.filter(r => r.dueStatus === 'overdue' || r.dueStatus === 'due-soon')
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  const alertRows = rows
    .filter(r => r.missingItems.length > 0 || r.outcomeAlertStatus !== 'none')
    .sort((a, b) => {
      const rank = (s: OutcomeAlertStatus) => s === 'overdue' ? 0 : s === 'due-soon' ? 1 : 2
      return rank(a.outcomeAlertStatus) - rank(b.outcomeAlertStatus)
    })

  if (loading) return <div className="text-center py-16 text-slate-400">Loading...</div>

  return (
    <div className="space-y-5">
      {syncAllConfirm && (
        <ConfirmDialog
          title="Sync ALL to Google Sheets"
          message={`Sync ALL patients' outcomes to Google Sheets?\nThis may take a while if there are many patients.`}
          confirmLabel="Sync All"
          onConfirm={() => { setSyncAllConfirm(false); handleSyncAll() }}
          onCancel={() => setSyncAllConfirm(false)}
        />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Admin Dashboard</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:block">{now.toLocaleDateString('th-TH', { dateStyle: 'long' })}</span>

          {/* Sync ALL to Google Sheets */}
          <button
            onClick={() => setSyncAllConfirm(true)}
            disabled={syncAllLoading}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 shrink-0">
            {syncAllLoading ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Syncing…
              </>
            ) : 'Sync All → Sheets'}
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exportLoading}
              className="text-xs bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white border border-[#0C447C] px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5">
              {exportLoading ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>Export ▾</>
              )}
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-9 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-72">
                {/* Date range */}
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Date Range</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">From</label>
                    <input type="date" value={exportDateFrom}
                      onChange={e => setExportDateFrom(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">To</label>
                    <input type="date" value={exportDateTo}
                      onChange={e => setExportDateTo(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Export</p>
                <div className="space-y-1.5">
                  <button onClick={() => handleExport('patients')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-colors flex items-center gap-2">
                    <span>📋</span><span className="flex-1">Patient List <span className="text-slate-400">(.xlsx)</span></span>
                  </button>
                  <button onClick={() => handleExport('outcomes')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-colors flex items-center gap-2">
                    <span>📊</span><span className="flex-1">Outcome Data <span className="text-slate-400">(.xlsx)</span></span>
                  </button>
                  {/* Monthly summary with month/year picker */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1">
                      <select value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}
                        className="text-xs bg-transparent border-0 focus:outline-none flex-1 text-slate-600">
                        {['January','February','March','April','May','June','July','August','September','October','November','December']
                          .map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                      <select value={exportYear} onChange={e => setExportYear(Number(e.target.value))}
                        className="text-xs bg-transparent border-0 focus:outline-none text-slate-600">
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <button onClick={() => handleExport('monthly')}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2">
                      <span>📅</span><span className="flex-1">Monthly Summary <span className="text-slate-400">(.xlsx)</span></span>
                    </button>
                  </div>
                  <button onClick={() => handleExport('pdf')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-colors flex items-center gap-2">
                    <span>🖨️</span><span className="flex-1">Dashboard Charts <span className="text-slate-400">(.pdf)</span></span>
                  </button>
                </div>
                <button onClick={() => setExportOpen(false)}
                  className="absolute top-2.5 right-3 text-slate-300 hover:text-slate-500 text-lg leading-none">×</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export error banner */}
      {exportError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
          <p className="text-sm text-red-700 flex-1">{exportError}</p>
          <button onClick={() => setExportError(null)} className="text-red-300 hover:text-red-500 text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {syncAllResult && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <p className="text-sm text-emerald-700 flex-1">{syncAllResult}</p>
          <button onClick={() => setSyncAllResult(null)} className="text-emerald-300 hover:text-emerald-500 text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {syncAllError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
          <p className="text-sm text-red-700 flex-1">{syncAllError}</p>
          <button onClick={() => setSyncAllError(null)} className="text-red-300 hover:text-red-500 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        {(['dashboard', 'users', 'logs'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${activeTab === tab ? 'bg-[#0C447C] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-[#185FA5]'}`}>
            {tab === 'dashboard' ? 'Dashboard' : tab === 'users' ? 'Users' : 'Activity Log'}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {activeTab === 'users' && <UserManagement />}

      {/* Logs tab */}
      {activeTab === 'logs' && <ActivityLogTab />}

      {/* Dashboard tab */}
      {activeTab === 'dashboard' && (
        <>
          {/* ── Captured region for PDF export ── */}
          <div ref={chartsRef}>

          {/* ── Overview Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 mb-1">Total Patients</div>
              <div className="text-3xl font-bold text-slate-800">{patients.length}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 mb-1">Assessments this week</div>
              <div className="text-3xl font-bold text-blue-600">{weekAssessments}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 mb-1">Assessments this month</div>
              <div className="text-3xl font-bold text-blue-600">{monthAssessments}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 mb-1">Avg LOS (Init → D/C)</div>
              {avgLos !== null
                ? <><span className="text-3xl font-bold text-violet-600">{avgLos}</span><span className="text-sm text-slate-400 ml-1">days</span></>
                : <div className="text-slate-300 text-sm mt-1">No discharge data</div>
              }
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Level Distribution</h3>
            <BarChart data={[
              { label: 'L1 Mild',        value: levelCounts[1], color: LEVEL_COLOR[1] },
              { label: 'L2 Moderate',    value: levelCounts[2], color: LEVEL_COLOR[2] },
              { label: 'L3 Mild Severe', value: levelCounts[3], color: LEVEL_COLOR[3] },
              { label: 'L4 Severe',      value: levelCounts[4], color: LEVEL_COLOR[4] },
            ]} />
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

          </div>{/* end chartsRef */}

          {/* ── Reassessment Due Alert ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-orange-100 bg-orange-50 flex items-center justify-between">
                <h3 className="font-semibold text-orange-800 text-sm">Outcome Reassessment Alerts</h3>
                <div className="flex items-center gap-2">
                  {alertRows.filter(r => r.outcomeAlertStatus === 'overdue').length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {alertRows.filter(r => r.outcomeAlertStatus === 'overdue').length} overdue
                    </span>
                  )}
                  {alertRows.filter(r => r.outcomeAlertStatus === 'due-soon').length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                      {alertRows.filter(r => r.outcomeAlertStatus === 'due-soon').length} due soon
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {alertRows.map(row => {
                  const isOverdue  = row.outcomeAlertStatus === 'overdue'
                  const isDueSoon  = row.outcomeAlertStatus === 'due-soon'
                  const borderCls  = isOverdue ? 'border-l-4 border-red-400' : isDueSoon ? 'border-l-4 border-yellow-400' : ''
                  // Non-BRFA missing items only for the badges
                  const nonBrfaMissing = row.missingItems.filter(m => m.groupLabel !== 'BRFA')
                  const brfaMissing    = row.missingItems.filter(m => m.groupLabel === 'BRFA')
                  return (
                    <div key={row.patient.id}
                      className={`flex items-start px-5 py-3 gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${borderCls}`}
                      onClick={() => setSelectedRow(row)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{row.patient.firstName} {row.patient.lastName}</span>
                          <span className="font-mono text-xs text-slate-400">{row.patient.hn}</span>
                          {row.latestScreening && (
                            <span className={`px-1.5 rounded text-xs font-semibold ${LEVEL_BG[row.latestScreening.overallLevel]}`}>
                              L{row.latestScreening.overallLevel}
                            </span>
                          )}
                        </div>
                        {/* Status line */}
                        <div className="text-xs mt-0.5">
                          {isOverdue && (
                            <span className="text-red-600 font-medium">
                              Reassessment เกินกำหนด — {row.expectedReassCount > 0 ? `RA ${row.expectedReassCount} ยังไม่ครบ` : 'Initial ยังไม่มีข้อมูล'}
                            </span>
                          )}
                          {isDueSoon && row.daysUntilNextReas !== null && (
                            <span className="text-yellow-600 font-medium">
                              Reassessment ถัดไปอีก {row.daysUntilNextReas} วัน
                            </span>
                          )}
                        </div>
                        {/* Missing item badges */}
                        {nonBrfaMissing.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {nonBrfaMissing.slice(0, 6).map((m, i) => (
                              <span key={i} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                                {m.groupLabel} / {SESSION_SHORT[m.session] ?? m.session}
                              </span>
                            ))}
                            {nonBrfaMissing.length > 6 && (
                              <span className="text-xs text-slate-400">+{nonBrfaMissing.length - 6} more</span>
                            )}
                          </div>
                        )}
                        {brfaMissing.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {brfaMissing.map((m, i) => (
                              <span key={i} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                BRFA {SESSION_SHORT[m.session] ?? m.session} ยังไม่บันทึก
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-slate-300 text-xl shrink-0 mt-0.5">›</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Patient List Table ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
              <select value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-blue-400 max-w-[140px]">
                <option value="all">All Locations</option>
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
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

          {/* ── ERAS Section ── */}
          <div className="bg-white rounded-2xl border border-purple-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-purple-100 bg-purple-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-purple-900">ERAS — Enhanced Recovery After Surgery</h3>
                <p className="text-purple-600 text-xs mt-0.5">Prehabilitation → Pre-op → DC → Follow-up</p>
              </div>
              <span className="text-2xl font-bold text-purple-700">{erasRows.length}</span>
            </div>

            {erasRows.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">No ERAS patients yet</div>
            ) : (
              <div className="p-5 space-y-6">

                {/* a) Phase breakdown */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Patient Phase Distribution</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['Prehabilitation', 'Pre-op', 'DC', 'Follow-up'] as const).map(phase => (
                      <div key={phase} className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                        <div className="text-xs text-purple-600 font-medium mb-1">{ERAS_PHASE_SHORT_MAP[phase]}</div>
                        <div className="text-2xl font-bold text-purple-800">{erasPhaseCounts[phase]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* b) Outcome trend across 4 phases */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">ERAS Outcome Trend — across phases (avg across all patients)</h4>
                  <ErasGroupedChart data={erasTrendData} />
                </div>

                {/* c) Level distribution */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">ERAS Patient Level Distribution</h4>
                  <div className="space-y-1.5">
                    {([1, 2, 3, 4] as const).map(l => (
                      <div key={l} className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${LEVEL_BG[l]}`}>L{l}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all" style={{
                            width: `${erasRows.length > 0 ? (erasLevelCounts[l] / erasRows.length) * 100 : 0}%`,
                            backgroundColor: LEVEL_COLOR[l],
                          }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 w-5 text-right">{erasLevelCounts[l]}</span>
                        <span className="text-xs text-slate-400 w-8">
                          {erasRows.length > 0 ? `${Math.round((erasLevelCounts[l] / erasRows.length) * 100)}%` : '0%'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* d) Average LOS */}
                <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Avg LOS (Prehab → DC)</div>
                    {erasAvgLos !== null
                      ? <><span className="text-2xl font-bold text-violet-600">{erasAvgLos}</span><span className="text-sm text-slate-400 ml-1">days</span></>
                      : <span className="text-slate-300 text-sm">No discharge data yet</span>
                    }
                  </div>
                  <div className="ml-auto text-xs text-slate-400 text-right">
                    Based on patients with both<br />Prehabilitation + DC outcomes
                  </div>
                </div>

              </div>
            )}
          </div>{/* end ERAS section */}

          {/* ── Outcome Summary ── */}
          <OutcomeSummarySection
            patients={patients}
            screenings={screenings}
            outcomes={outcomes}
          />
        </>
      )}
    </div>
  )
}
