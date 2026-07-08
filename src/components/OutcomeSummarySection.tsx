'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession } from '@/types'
import { SESSION_SHORT, ERAS_PHASES, ERAS_PHASE_SHORT, OUTCOME_SESSIONS, GRIP_KEYS, peakCoughFlowInterpretation, gripFirstLast, gripInterpretationSingle, gripInterpretationAverage, type GripInterp } from '@/lib/outcomeItems'
import type { OtherDef, SessionDatum } from './OutcomeSummaryDashboard'
import { OutcomeSummaryChartCore } from './OutcomeSummaryDashboard'
import { formatHn, normalizeHn } from '@/lib/hn'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Metric       { key: string; label: string; unit: string }
interface PInfo        { id: string; firstName: string; lastName: string; hn: string; nationality: string; sex: string; outcomes: OutcomeMeasurement[] }
interface LineSeries   { id: string; label: string; color: string; points: (number | null)[] }
interface MiniSeries   { label: string; points: (number | null)[]; color: string }
type ViewMode          = 'average' | 'single' | 'compare'
type SingleCardDef     = { type: 'single'; key: string }
type GroupCardDef      = { type: 'group'; label: string; unit: string; keys: string[]; subLabels: string[] }
type CardDef           = SingleCardDef | GroupCardDef

// ── Metrics ───────────────────────────────────────────────────────────────────

const STD_METRICS: Metric[] = [
  { key: 'ampac_part1',        label: 'AMPAC Part 1',      unit: '/24'    },
  { key: 'ampac_part2',        label: 'AMPAC Part 2',      unit: '/24'    },
  { key: 'ampac_part3',        label: 'AMPAC Part 3',      unit: '/24'    },
  { key: 'brfa_part1',         label: 'BRFA Part 1',       unit: '%'      },
  { key: 'brfa_part2',         label: 'BRFA Part 2',       unit: '%'      },
  { key: 'brfa_q20',           label: 'BRFA Q20',          unit: '%'      },
  { key: 'brfa_q21',           label: 'BRFA Q21',          unit: '%'      },
  { key: 'dyspneaScale',       label: 'mMRC Dyspnea',      unit: '/4'     },
  { key: 'peakCoughFlow',      label: 'Peak Cough Flow',   unit: 'L/min'  },
  { key: 'wrightSpirometer',   label: 'Wright Spirometry', unit: 'mL'     },
  { key: 'cs30',               label: 'CS-30',             unit: 'stands' },
  { key: 'gripStrength_left',  label: 'Grip Left',         unit: 'kg'     },
  { key: 'gripStrength_right', label: 'Grip Right',        unit: 'kg'     },
  { key: 'sixMWT',             label: '6MWT',              unit: 'm'      },
  { key: 'twoMinMarching',     label: '2MST',              unit: 'steps'  },
  { key: 'twoMeterWalk',       label: '2MWT',              unit: 'm'      },
]

const ERAS_METRICS: Metric[] = [
  { key: 'peakCoughFlow',      label: 'Peak Cough Flow',   unit: 'L/min'  },
  { key: 'wrightSpirometer',   label: 'Wright Spirometry', unit: 'mL'     },
  { key: 'gripStrength_left',  label: 'Grip Left',         unit: 'kg'     },
  { key: 'gripStrength_right', label: 'Grip Right',        unit: 'kg'     },
  { key: 'cs30',               label: 'CS-30',             unit: 'stands' },
  { key: 'erasTwoMWalk',       label: '2-Meter Walk',      unit: 'sec'    },
]

// ── Colors ────────────────────────────────────────────────────────────────────

const COLORS         = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']
const CARD_COLORS    = ['#3b82f6', '#10b981', '#f97316', '#ef4444', '#8b5cf6']
const SESSION_COLORS = ['#3b82f6', '#10b981', '#f97316', '#ef4444', '#8b5cf6']

// ERAS InBody defs — appended to the ERAS Outcome Trends chart after 2-Meter.
// Prehabilitation-only, all rendered in the Pre-hab color (#378ADD).
const ERAS_INBODY_OTHER_DEFS: OtherDef[] = [
  { key: 'inbody_bmi',            label: 'BMI',                  unit: 'kg/m²', color: '#378ADD', maxRef: 40 },
  { key: 'inbody_skeletalMuscle', label: 'Skeletal Muscle Mass', unit: 'kg',    color: '#378ADD', maxRef: 50 },
  { key: 'inbody_bodyFatPct',     label: 'Body Fat %',           unit: '%',     color: '#378ADD', maxRef: 50 },
]

// ── Session timelines (5 key points for Standard, 4 for ERAS) ─────────────────

const STD_SUMMARY_SESSIONS  = ['Initial', 'Reassessment 1', 'Reassessment 2', 'Reassessment 3', 'Discharge'] as const
const STD_SUMMARY_LABELS    = ['Initial', 'RA 1', 'RA 2', 'RA 3', 'D/C']
const STD_DEFAULT_SESSIONS  = ['Initial', 'Discharge']

const ERAS_SUMMARY_SESSIONS = ERAS_PHASES as readonly string[]
const ERAS_SUMMARY_LABELS   = ERAS_SUMMARY_SESSIONS.map(p => ERAS_PHASE_SHORT[p] ?? p)
const ERAS_DEFAULT_SESSIONS = ['Prehabilitation', 'DC']

// ── Card-grid definitions ─────────────────────────────────────────────────────

const STD_CARD_DEFS: CardDef[] = [
  { type: 'group', label: 'AMPAC',     unit: '/24', keys: ['ampac_part1', 'ampac_part2', 'ampac_part3'],         subLabels: ['Pt 1', 'Pt 2', 'Pt 3']       },
  { type: 'group', label: 'BRFA',      unit: '%',   keys: ['brfa_part1', 'brfa_part2', 'brfa_q20', 'brfa_q21'], subLabels: ['Pt 1', 'Pt 2', 'Q20', 'Q21'] },
  { type: 'single', key: 'dyspneaScale'      },
  { type: 'single', key: 'peakCoughFlow'     },
  { type: 'single', key: 'wrightSpirometer'  },
  { type: 'group', label: 'Hand Grip', unit: 'kg',  keys: ['gripStrength_left', 'gripStrength_right'],           subLabels: ['Left', 'Right']               },
  { type: 'single', key: 'cs30'              },
  { type: 'single', key: 'sixMWT'            },
  { type: 'single', key: 'twoMinMarching'    },
  { type: 'single', key: 'twoMeterWalk'      },
]

const ERAS_CARD_DEFS: CardDef[] = [
  { type: 'single', key: 'peakCoughFlow'    },
  { type: 'single', key: 'wrightSpirometer' },
  { type: 'group', label: 'Hand Grip', unit: 'kg', keys: ['gripStrength_left', 'gripStrength_right'], subLabels: ['Left', 'Right'] },
  { type: 'single', key: 'cs30'            },
  { type: 'single', key: 'erasTwoMWalk'    },
]

// ── Admin-specific OtherDef arrays (real-value chart, English units) ──────────

const ADMIN_STD_OTHER_DEFS: OtherDef[] = [
  { key: 'dyspneaScale',       label: 'mMRC',       unit: '/4',     color: '#E85D04', maxRef: 4   },
  { key: 'peakCoughFlow',      label: 'Cough Flow', unit: 'L/min',  color: '#378ADD', maxRef: 600 },
  { key: 'wrightSpirometer',   label: 'Wright',     unit: 'mL',     color: '#0F6E56', maxRef: 600 },
  { key: 'gripStrength_left',  label: 'Grip L',     unit: 'kg',     color: '#BA7517', maxRef: 60  },
  { key: 'gripStrength_right', label: 'Grip R',     unit: 'kg',     color: '#EF9F27', maxRef: 60  },
  { key: 'cs30',               label: 'CS-30',      unit: 'stands', color: '#639922', maxRef: 30  },
  { key: 'twoMeterWalk',       label: '2MWT',       unit: 'm',      color: '#0891B2', maxRef: 500 },
  { key: 'sixMWT',             label: '6MWT',       unit: 'm',      color: '#C77DFF', maxRef: 600 },
  { key: 'twoMinMarching',     label: '2MST',       unit: 'steps',  color: '#E63946', maxRef: 120 },
]

const ADMIN_ERAS_OTHER_DEFS: OtherDef[] = [
  { key: 'peakCoughFlow',      label: 'Cough Flow', unit: 'L/min',  color: '#378ADD', maxRef: 600 },
  { key: 'wrightSpirometer',   label: 'Wright',     unit: 'mL',     color: '#0F6E56', maxRef: 600 },
  { key: 'gripStrength_left',  label: 'Grip L',     unit: 'kg',     color: '#BA7517', maxRef: 60  },
  { key: 'gripStrength_right', label: 'Grip R',     unit: 'kg',     color: '#EF9F27', maxRef: 60  },
  { key: 'cs30',               label: 'CS-30',      unit: 'stands', color: '#639922', maxRef: 30  },
  { key: 'erasTwoMWalk',       label: '2-Meter',    unit: 'sec',    color: '#0891B2', maxRef: 30  },
]

// ── PatientPicker ─────────────────────────────────────────────────────────────

function PatientPicker({
  patients, mode, selected, onSelect, onToggle,
}: {
  patients: PInfo[]
  mode: 'single' | 'compare'
  selected: string[]
  onSelect?: (id: string) => void
  onToggle?: (id: string) => void
}) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    const termHn = normalizeHn(search)
    return patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(term) ||
      (termHn !== '' && normalizeHn(p.hn).includes(termHn))
    )
  }, [patients, search])

  const triggerLabel = mode === 'single'
    ? selected[0]
      ? (() => { const p = patients.find(x => x.id === selected[0]); return p ? `${p.firstName} ${p.lastName}` : 'Select patient' })()
      : 'Select patient'
    : `${selected.length} patient${selected.length !== 1 ? 's' : ''} selected`

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white hover:border-slate-300 transition-colors min-w-[190px]"
      >
        <span className="flex-1 text-left text-sm text-slate-700 truncate">{triggerLabel}</span>
        <span className="text-slate-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl w-72 flex flex-col" style={{ maxHeight: 264 }}>
          <div className="p-2 border-b border-slate-100 shrink-0">
            <input autoFocus type="text" placeholder="Search name or HN…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0
              ? <p className="text-xs text-slate-400 text-center py-4">No patients found</p>
              : filtered.map(p => {
                  const isSel = selected.includes(p.id)
                  return (
                    <div key={p.id}
                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${isSel ? 'bg-blue-50' : ''}`}
                      onClick={() => { if (mode === 'single') { onSelect?.(p.id); setOpen(false) } else onToggle?.(p.id) }}>
                      {mode === 'compare' && (
                        <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isSel ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                          {isSel && <span className="text-white text-[10px] leading-none">✓</span>}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.firstName} {p.lastName}</p>
                        <p className="text-xs text-slate-400 font-mono">{formatHn(p.hn)}</p>
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Full line chart (compare mode) ────────────────────────────────────────────

function OutcomeLineChart({ series, xLabels, metric }: {
  series: LineSeries[]; xLabels: string[]; metric: Metric
}) {
  const [tip, setTip]  = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const boxRef         = useRef<HTMLDivElement>(null)
  const allVals        = useMemo(() => series.flatMap(s => s.points).filter((v): v is number => v !== null), [series])

  if (series.length === 0)
    return <div className="h-44 flex items-center justify-center text-slate-400 text-sm">Select patients above to compare</div>
  if (allVals.length === 0)
    return <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No data recorded for this outcome</div>

  const W = 580, H = 200, PL = 52, PR = 20, PT = 14, PB = 32
  const chartW = W - PL - PR, chartH = H - PT - PB
  const maxY = Math.max(...allVals) * 1.15 || 1
  const n = xLabels.length
  const xp = (i: number) => PL + (n > 1 ? i / (n - 1) : 0.5) * chartW
  const yp = (v: number) => PT + (1 - v / maxY) * chartH
  const fmt = (v: number) => v < 1 && v > 0 ? v.toFixed(2) : Number.isInteger(v) ? String(v) : v.toFixed(1)
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(t => maxY * t)

  return (
    <div ref={boxRef} className="relative w-full select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 210 }}>
        {gridVals.map((v, i) => {
          const y = yp(v)
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PL - 5} y={y + 3.5} fontSize="9" fill="#94a3b8" textAnchor="end">{fmt(v)}</text>
            </g>
          )
        })}
        <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="#e2e8f0" strokeWidth="1" />
        {xLabels.map((lbl, i) => <text key={i} x={xp(i)} y={H - 3} fontSize="9" fill="#94a3b8" textAnchor="middle">{lbl}</text>)}
        <text x={11} y={PT + chartH / 2} fontSize="8" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90,11,${PT + chartH / 2})`}>{metric.unit}</text>
        {series.map(s => {
          let d = '', seg = false
          const dots: { xi: number; cx: number; cy: number; val: number }[] = []
          s.points.forEach((v, i) => {
            if (v === null) { seg = false; return }
            const cx = xp(i), cy = yp(v)
            d += seg ? ` L ${cx},${cy}` : `M ${cx},${cy}`; seg = true
            dots.push({ xi: i, cx, cy, val: v })
          })
          return (
            <g key={s.id}>
              {d && <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
              {dots.map(pt => (
                <circle key={pt.xi} cx={pt.cx} cy={pt.cy} r="4.5" fill={s.color} stroke="white" strokeWidth="2" style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    const bRect = boxRef.current?.getBoundingClientRect()
                    if (!bRect) return
                    const lines = [xLabels[pt.xi], `${s.label}: ${fmt(pt.val)} ${metric.unit}`]
                    if (metric.key === 'peakCoughFlow') lines.push(`→ ${peakCoughFlowInterpretation(pt.val)}`)
                    setTip({ x: e.clientX - bRect.left + 10, y: e.clientY - bRect.top - 52, lines })
                  }}
                  onMouseLeave={() => setTip(null)} />
              ))}
            </g>
          )
        })}
      </svg>
      {tip && (
        <div className="absolute pointer-events-none bg-slate-800 text-white text-xs rounded-lg px-2.5 py-2 shadow-xl z-20 whitespace-nowrap" style={{ left: tip.x, top: tip.y }}>
          {tip.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

// ── Mini line chart (card grid) ───────────────────────────────────────────────

function MiniLineChart({ seriesList, sessionLabels, showLegend }: {
  seriesList: MiniSeries[]; sessionLabels: string[]; showLegend?: boolean
}) {
  const allVals = seriesList.flatMap(s => s.points).filter((v): v is number => v !== null)
  if (allVals.length === 0) return null

  const W = 200, H = 72, PL = 6, PR = 6, PT = 5, PB = 16
  const chartW = W - PL - PR, chartH = H - PT - PB
  const n = sessionLabels.length
  const pad = (Math.max(...allVals) - Math.min(...allVals)) * 0.15 || 1
  const yMin = Math.max(0, Math.min(...allVals) - pad), yMax = Math.max(...allVals) + pad
  const yRange = yMax - yMin
  const xp = (i: number) => PL + (n > 1 ? i / (n - 1) : 0.5) * chartW
  const yp = (v: number) => PT + (1 - (v - yMin) / yRange) * chartH

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 58 }}>
        <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="#e2e8f0" strokeWidth="1" />
        {seriesList.map(s => {
          let d = '', seg = false
          const dots: { cx: number; cy: number }[] = []
          s.points.forEach((v, i) => {
            if (v === null) { seg = false; return }
            const cx = xp(i), cy = yp(v)
            d += seg ? ` L ${cx},${cy}` : `M ${cx},${cy}`; seg = true; dots.push({ cx, cy })
          })
          return (
            <g key={s.label}>
              {d && <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              {dots.map((pt, i) => <circle key={i} cx={pt.cx} cy={pt.cy} r="2.5" fill={s.color} stroke="white" strokeWidth="1.5" />)}
            </g>
          )
        })}
        {sessionLabels.map((lbl, i) => <text key={i} x={xp(i)} y={H - 1} fontSize="7" fill="#94a3b8" textAnchor="middle">{lbl}</text>)}
      </svg>
      {showLegend && seriesList.length > 1 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
          {seriesList.map(s => (
            <div key={s.label} className="flex items-center gap-1">
              <div className="w-3.5 h-[2px] rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[9px] text-slate-500 leading-tight">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Session selector (toggle pills) ──────────────────────────────────────────

function SessionSelector({ sessions, sessionLabels, selected, colorMap, onChange }: {
  sessions: readonly string[]
  sessionLabels: string[]
  selected: string[]
  colorMap: Record<string, string>
  onChange: (next: string[]) => void
}) {
  const toggle = (sess: string) => {
    if (selected.includes(sess)) {
      if (selected.length > 1) onChange(selected.filter(s => s !== sess))
    } else {
      onChange([...selected, sess])
    }
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {(sessions as string[]).map((sess, i) => {
        const active = selected.includes(sess)
        return (
          <button key={sess} onClick={() => toggle(sess)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all border ${
              active ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
            style={active ? { backgroundColor: colorMap[sess] } : {}}>
            {sessionLabels[i]}
          </button>
        )
      })}
    </div>
  )
}


// ── Outcome card grid (avg + single patient modes) ────────────────────────────

function OutcomeCardGrid({ pointsData, sessionLabels, metrics, cardDefs, color }: {
  pointsData: Record<string, (number | null)[]>
  sessionLabels: string[]
  metrics: Metric[]
  cardDefs: CardDef[]
  color: string
}) {
  const metricMap = useMemo(() => {
    const m: Record<string, Metric> = {}
    metrics.forEach(x => { m[x.key] = x })
    return m
  }, [metrics])

  const getPoints = (key: string): (number | null)[] =>
    pointsData[key] ?? Array<null>(sessionLabels.length).fill(null)

  const cards = cardDefs.map(def => {
    if (def.type === 'single') {
      const m = metricMap[def.key]
      if (!m) return null
      const points = getPoints(def.key)
      if (!points.some(v => v !== null)) return null
      return (
        <div key={def.key} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 leading-tight">{m.label}</span>
            <span className="text-[10px] text-slate-400 ml-1 shrink-0">{m.unit}</span>
          </div>
          <MiniLineChart seriesList={[{ label: m.label, points, color }]} sessionLabels={sessionLabels} />
        </div>
      )
    }
    // grouped card
    const seriesList: MiniSeries[] = def.keys
      .map((k, i) => {
        const points = getPoints(k)
        if (!points.some(v => v !== null)) return null
        return { label: def.subLabels[i], points, color: CARD_COLORS[i % CARD_COLORS.length] }
      })
      .filter((s): s is MiniSeries => s !== null)
    if (seriesList.length === 0) return null
    return (
      <div key={def.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-bold text-slate-700 leading-tight">{def.label}</span>
          <span className="text-[10px] text-slate-400 ml-1 shrink-0">{def.unit}</span>
        </div>
        <MiniLineChart seriesList={seriesList} sessionLabels={sessionLabels} showLegend />
      </div>
    )
  }).filter(Boolean)

  if (cards.length === 0)
    return <div className="py-8 text-center text-slate-400 text-sm">No outcome data recorded for the selected sessions</div>

  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{cards}</div>
}

// ── One block (Standard or ERAS) ──────────────────────────────────────────────

function OutcomeBlock({
  title, accent, patients, sessions, sessionLabels, metrics,
  cardDefs, otherDefs, defaultSessions, blockType,
}: {
  title: string
  accent: string
  patients: PInfo[]
  sessions: readonly string[]
  sessionLabels: string[]
  metrics: Metric[]
  cardDefs: CardDef[]
  otherDefs: OtherDef[]
  defaultSessions: string[]
  blockType: 'standard' | 'eras'
}) {
  const [mode, setMode]                   = useState<ViewMode>('average')
  const [singleId, setSingleId]           = useState<string | null>(null)
  const [compareIds, setCompareIds]       = useState<string[]>([])
  const [metricKey, setMetricKey]         = useState(metrics[0].key)
  const [selectedSessions, setSelectedSessions] = useState<string[]>(defaultSessions)
  const [exporting, setExporting]         = useState(false)
  const [exportError, setExportError]     = useState<string | null>(null)

  const barChartRef   = useRef<HTMLDivElement>(null)
  const cardGridRef   = useRef<HTMLDivElement>(null)
  const compareChartRef = useRef<HTMLDivElement>(null)

  const metric        = useMemo(() => metrics.find(m => m.key === metricKey) ?? metrics[0], [metrics, metricKey])
  const singlePatient = useMemo(() => singleId ? patients.find(x => x.id === singleId) ?? null : null, [singleId, patients])

  // Session → stable color map
  const sessColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    ;(sessions as string[]).forEach((s, i) => { map[s] = SESSION_COLORS[i % SESSION_COLORS.length] })
    return map
  }, [sessions])

  // Chart sessions for OutcomeSummaryChartCore
  const chartSessions = useMemo<SessionDatum[]>(() => {
    if (mode === 'compare') return []
    const allItemKeys = [
      'ampac_part1', 'ampac_part2', 'ampac_part3',
      'brfa_part1', 'brfa_part2', 'brfa_q20', 'brfa_q21',
      ...otherDefs.map(d => d.key),
      'inbody_bmi', 'inbody_skeletalMuscle', 'inbody_bodyFatPct',
    ]
    const total = selectedSessions.length
    return selectedSessions.map((sess, sessIdx) => {
      const shadeIdx = total <= 1 ? 5 : Math.round((sessIdx / (total - 1)) * 11)
      const labelIdx = (sessions as string[]).indexOf(sess)
      const label = sessionLabels[labelIdx] ?? sess
      const color = sessColorMap[sess] ?? SESSION_COLORS[0]
      const items: Record<string, { value: number }> = {}
      allItemKeys.forEach(key => {
        if (mode === 'average') {
          const vals = patients
            .map(p => p.outcomes.find(x => x.session === sess)?.items[key]?.value)
            .filter((v): v is number => v !== undefined)
          if (vals.length > 0) items[key] = { value: vals.reduce((a, b) => a + b) / vals.length }
        } else if (mode === 'single' && singlePatient) {
          const v = singlePatient.outcomes.find(x => x.session === sess)?.items[key]?.value
          if (v !== undefined) items[key] = { value: v }
        }
      })
      const o: OutcomeMeasurement = {
        id: `admin_${sess}_${sessIdx}`,
        patientId: mode === 'single' && singlePatient ? singlePatient.id : 'avg',
        patientHn: '',
        session: sess as OutcomeSession,
        level: 1,
        items,
      }
      return { session: sess, label, color, shadeIdx, o }
    })
  }, [mode, selectedSessions, patients, singlePatient, otherDefs, sessions, sessionLabels, sessColorMap])

  // Grip L / Grip R interpretation line for the bar-chart tooltip.
  // Single: compare Discharge/latest vs cut-off (nationality + sex) + trend.
  // Average: trend only (no cut-off across mixed sex/nationality).
  const gripInterp = useMemo<Record<string, GripInterp | null>>(() => {
    const order = blockType === 'eras' ? ERAS_PHASES : OUTCOME_SESSIONS
    const dischargeSession = blockType === 'eras' ? 'DC' : 'Discharge'
    const res: Record<string, GripInterp | null> = {}
    GRIP_KEYS.forEach(key => {
      if (mode === 'single') {
        if (!singlePatient) { res[key] = null; return }
        const { firstVal, lastVal } = gripFirstLast(singlePatient.outcomes, key, order, dischargeSession)
        // eslint-disable-next-line no-console
        console.log('[grip]', key, { mode, sex: singlePatient.sex, nationality: singlePatient.nationality, firstVal, lastVal })
        res[key] = gripInterpretationSingle({ nationality: singlePatient.nationality, sex: singlePatient.sex, firstVal, lastVal })
      } else if (mode === 'average') {
        // Per-patient first/last, keeping only those with data.
        const withData = patients
          .map(p => ({ p, ...gripFirstLast(p.outcomes, key, order, dischargeSession) }))
          .filter(x => x.lastVal !== undefined)
        if (withData.length === 1) {
          // "Average" of a single patient is not really an average — no mixing of
          // sex/nationality — so interpret it fully with the cut-off.
          const { p, firstVal, lastVal } = withData[0]
          // eslint-disable-next-line no-console
          console.log('[grip]', key, { mode: 'average(n=1)', sex: p.sex, nationality: p.nationality, firstVal, lastVal })
          res[key] = gripInterpretationSingle({ nationality: p.nationality, sex: p.sex, firstVal, lastVal })
        } else {
          const firsts = withData.map(x => x.firstVal).filter((v): v is number => v !== undefined)
          const lasts  = withData.map(x => x.lastVal!).filter((v): v is number => v !== undefined)
          res[key] = gripInterpretationAverage({
            firstAvg: firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length : undefined,
            lastAvg:  lasts.length  ? lasts.reduce((a, b) => a + b, 0) / lasts.length   : undefined,
          })
        }
      } else {
        res[key] = null
      }
    })
    return res
  }, [mode, singlePatient, patients, blockType])

  // Card grid points data (avg or single)
  const cardGridData = useMemo<Record<string, (number | null)[]>>(() => {
    if (mode === 'compare') return {}
    const data: Record<string, (number | null)[]> = {}
    metrics.forEach(m => {
      if (mode === 'average') {
        data[m.key] = (sessions as string[]).map(sess => {
          const vals = patients
            .map(p => p.outcomes.find(x => x.session === sess)?.items[m.key]?.value)
            .filter((v): v is number => v !== undefined)
          return vals.length > 0 ? vals.reduce((a, b) => a + b) / vals.length : null
        })
      } else if (mode === 'single' && singlePatient) {
        data[m.key] = (sessions as string[]).map(sess =>
          singlePatient.outcomes.find(x => x.session === sess)?.items[m.key]?.value ?? null
        )
      }
    })
    return data
  }, [mode, patients, singlePatient, metrics, sessions])

  // Compare mode series
  const compareSeries = useMemo<LineSeries[]>(() => {
    if (mode !== 'compare') return []
    const pts = (p: PInfo) => (sessions as string[]).map(sess =>
      p.outcomes.find(x => x.session === sess)?.items[metricKey]?.value ?? null
    )
    return compareIds.slice(0, 10).flatMap((id, i) => {
      const p = patients.find(x => x.id === id)
      return p ? [{ id, label: `${p.firstName} ${p.lastName}`, color: COLORS[i % COLORS.length], points: pts(p) }] : []
    })
  }, [mode, compareIds, metricKey, patients, sessions])

  // Compare mode table rows for PDF
  const compareTableRows = useMemo(() =>
    (sessions as string[]).map((_, i) => ({
      session: sessionLabels[i],
      values: compareSeries.map(s => {
        const v = s.points[i]
        return v === null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1)
      }),
    })),
  [compareSeries, sessions, sessionLabels])

  const toggleCompare = (id: string) =>
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ── PDF export ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true); setExportError(null)
    try {
      const [{ toPng }, { jsPDF }, { default: autoTable }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
        import('jspdf-autotable'),
      ])

      if (mode === 'compare') {
        // ── Compare mode: landscape, chart + table ──────────────────────────
        if (!compareChartRef.current) throw new Error('Chart area not ready.')
        const imgData = await toPng(compareChartRef.current, { pixelRatio: 2, backgroundColor: '#f8fafc', cacheBust: true })
        const img = await new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = imgData })

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), mg = 12

        pdf.setFillColor(29, 78, 216).rect(0, 0, pw, 20, 'F')
        pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255, 255, 255)
        pdf.text(`${title} — ${metric.label} (${metric.unit})`, mg, 13)
        pdf.setFont('helvetica', 'normal').setFontSize(8)
        pdf.text(`Comparing ${compareSeries.length} patient${compareSeries.length !== 1 ? 's' : ''}`, mg, 18)

        const chartY = 24, maxImgH = (ph - chartY - mg) * 0.52
        const ratio = img.height / img.width
        let iW = pw - mg * 2, iH = iW * ratio
        if (iH > maxImgH) { iH = maxImgH; iW = iH / ratio }
        pdf.addImage(imgData, 'PNG', mg + (pw - mg * 2 - iW) / 2, chartY, iW, iH)

        const tY = chartY + iH + 5, cols = compareSeries.length + 1
        const colW = Math.max((pw - mg * 2) / cols, 18)
        pdf.setFillColor(241, 245, 249).rect(mg, tY, pw - mg * 2, 6.5, 'F')
        pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(71, 85, 105)
        pdf.text('Session', mg + 2, tY + 4.5)
        compareSeries.forEach((s, i) => pdf.text(s.label.slice(0, 22), mg + colW * (i + 1) + 1, tY + 4.5))
        pdf.setFont('helvetica', 'normal')
        let ry = tY + 6.5
        compareTableRows.forEach((row, ri) => {
          if (ri % 2 === 1) pdf.setFillColor(248, 250, 252).rect(mg, ry, pw - mg * 2, 5.5, 'F')
          pdf.setTextColor(51, 65, 85)
          pdf.text(row.session, mg + 2, ry + 3.8)
          row.values.forEach((v, i) => pdf.text(v, mg + colW * (i + 1) + 1, ry + 3.8))
          ry += 5.5
        })
        pdf.setDrawColor(226, 232, 240).rect(mg, tY, pw - mg * 2, ry - tY, 'S')
        pdf.save(`OutcomeSummary_${blockType}_compare_${metric.key}.pdf`)
        return
      }

      // ── Avg / single mode: portrait, bar chart + card grid + table ──────────
      if (mode === 'single' && !singlePatient) throw new Error('Please select a patient first.')
      if (!barChartRef.current || !cardGridRef.current) throw new Error('Content not ready — ensure the section is visible.')

      const [barImgData, gridImgData] = await Promise.all([
        toPng(barChartRef.current,  { pixelRatio: 2, backgroundColor: '#f8fafc', cacheBust: true }),
        toPng(cardGridRef.current,  { pixelRatio: 2, backgroundColor: '#f8fafc', cacheBust: true }),
      ])
      const [barImg, gridImg] = await Promise.all([barImgData, gridImgData].map(src =>
        new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = src })
      ))

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), mg = 12

      // Page 1 header
      pdf.setFillColor(29, 78, 216).rect(0, 0, pw, 22, 'F')
      pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255, 255, 255)
      const headerTitle = mode === 'single' && singlePatient
        ? `${singlePatient.firstName} ${singlePatient.lastName}`
        : title
      pdf.text(headerTitle, mg, 10)
      pdf.setFont('helvetica', 'normal').setFontSize(8.5)
      const headerSub = mode === 'single' && singlePatient
        ? `HN: ${formatHn(singlePatient.hn)}   |   ${title}`
        : `All patients (average)   |   ${selectedSessions.map(s => sessionLabels[(sessions as string[]).indexOf(s)] ?? s).join(', ')}`
      pdf.text(headerSub, mg, 17.5)

      // Bar chart image
      let curY = 26
      const barRatio = barImg.height / barImg.width
      let barW2 = pw - mg * 2, barH2 = barW2 * barRatio
      const maxBarH = (ph - curY - mg) * 0.45
      if (barH2 > maxBarH) { barH2 = maxBarH; barW2 = barH2 / barRatio }
      pdf.addImage(barImgData, 'PNG', mg + (pw - mg * 2 - barW2) / 2, curY, barW2, barH2)
      curY += barH2 + 4

      // Data table on page 1
      const head = [['Outcome (unit)', ...sessionLabels]]
      const body = metrics.map(m => {
        const getVal = (sess: string) => {
          if (mode === 'average') {
            const vals = patients
              .map(p => p.outcomes.find(x => x.session === sess)?.items[m.key]?.value)
              .filter((v): v is number => v !== undefined)
            return vals.length > 0 ? (vals.reduce((a, b) => a + b) / vals.length).toFixed(1) : '–'
          }
          const v = singlePatient?.outcomes.find(x => x.session === sess)?.items[m.key]?.value
          return v !== undefined ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : '–'
        }
        return [`${m.label} (${m.unit})`, ...(sessions as string[]).map(getVal)]
      })

      autoTable(pdf, {
        startY: curY,
        head, body,
        styles: { fontSize: 6.5, cellPadding: 1.8 },
        headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 } },
        margin: { left: mg, right: mg },
      })

      // Page 2: card grid
      pdf.addPage()
      pdf.setFillColor(241, 245, 249).rect(0, 0, pw, 12, 'F')
      pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(71, 85, 105)
      pdf.text('Outcome Trend Cards', mg, 8)

      const gridRatio = gridImg.height / gridImg.width
      const maxGridH = ph - 16 - mg
      let gW = pw - mg * 2, gH = gW * gridRatio
      if (gH > maxGridH) { gH = maxGridH; gW = gH / gridRatio }
      pdf.addImage(gridImgData, 'PNG', mg + (pw - mg * 2 - gW) / 2, 16, gW, gH)

      pdf.save(`OutcomeSummary_${blockType}_${mode === 'single' && singlePatient ? singlePatient.hn : 'avg'}.pdf`)

    } catch (err) {
      console.error('[OutcomeSummary export] failed:', err)
      setExportError(err instanceof Error ? err.message : 'Export failed — check the browser console.')
    } finally {
      setExporting(false)
    }
  }

  const modeBtns: { id: ViewMode; label: string }[] = [
    { id: 'average', label: 'All patients (avg)' },
    { id: 'single',  label: 'Single patient'     },
    { id: 'compare', label: 'Compare patients'   },
  ]

  const showBarAndGrid = mode === 'average' || (mode === 'single' && !!singlePatient)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-visible" style={{ border: `1px solid ${accent}40` }}>
      {/* Block header */}
      <div className="px-5 py-3.5 flex items-center justify-between"
        style={{ backgroundColor: `${accent}0d`, borderBottom: `1px solid ${accent}33` }}>
        <h4 className="font-bold text-slate-800">{title}</h4>
        <span className="text-xs text-slate-400">{patients.length} patient{patients.length !== 1 ? 's' : ''}</span>
      </div>

      {patients.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">
          No {blockType === 'eras' ? 'ERAS' : 'Standard'} patients yet
        </div>
      ) : (
        <div className="p-5 space-y-4">

          {/* Mode + picker row */}
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">View mode</p>
              <div className="flex gap-1.5">
                {modeBtns.map(b => (
                  <button key={b.id} onClick={() => setMode(b.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      mode === b.id ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    style={mode === b.id ? { backgroundColor: accent } : {}}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'single' && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Patient</p>
                <PatientPicker patients={patients} mode="single"
                  selected={singleId ? [singleId] : []} onSelect={setSingleId} />
              </div>
            )}

            {mode === 'compare' && (
              <>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Patient</p>
                  <PatientPicker patients={patients} mode="compare"
                    selected={compareIds} onToggle={toggleCompare} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Outcome</p>
                  <select value={metricKey} onChange={e => setMetricKey(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400 transition-colors">
                    {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Compare tags */}
          {mode === 'compare' && compareIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {compareIds.map((id, i) => {
                const p = patients.find(x => x.id === id)
                return p ? (
                  <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                    {p.firstName} {p.lastName}
                    <button onClick={() => toggleCompare(id)} className="hover:opacity-75 leading-none ml-0.5">×</button>
                  </span>
                ) : null
              })}
              {compareIds.length > 1 && (
                <button onClick={() => setCompareIds([])} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Clear all</button>
              )}
            </div>
          )}

          {/* ── Average / Single mode content ── */}
          {mode !== 'compare' && (
            <>
              {/* Session selector */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Sessions to compare</p>
                <SessionSelector
                  sessions={sessions}
                  sessionLabels={sessionLabels}
                  selected={selectedSessions}
                  colorMap={sessColorMap}
                  onChange={setSelectedSessions}
                />
              </div>

              {/* Single mode: prompt if no patient yet */}
              {mode === 'single' && !singlePatient && (
                <div className="py-8 text-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-slate-100">
                  Select a patient above to view their outcomes
                </div>
              )}

              {/* Bar chart */}
              {(mode === 'average' || showBarAndGrid) && (
                <div ref={barChartRef} className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3">Outcome Summary — {mode === 'average' ? 'All patients (average)' : singlePatient ? `${singlePatient.firstName} ${singlePatient.lastName}` : ''}</p>
                  {/* Standard and ERAS share the same chart core. For ERAS, InBody
                      items are appended after 2-Meter (Pre-hab session only). */}
                  <OutcomeSummaryChartCore
                    sessions={chartSessions}
                    otherDefs={otherDefs}
                    inbodyDefs={blockType === 'eras' ? ERAS_INBODY_OTHER_DEFS : undefined}
                    gripInterp={gripInterp}
                  />
                </div>
              )}

              {/* Trend card grid */}
              {showBarAndGrid && (
                <div ref={cardGridRef} className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3">Outcome Trends — all sessions</p>
                  <OutcomeCardGrid
                    pointsData={cardGridData}
                    sessionLabels={sessionLabels}
                    metrics={metrics}
                    cardDefs={cardDefs}
                    color={accent}
                  />
                </div>
              )}
            </>
          )}

          {/* ── Compare mode content ── */}
          {mode === 'compare' && (
            <div ref={compareChartRef} className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              {compareSeries.length > 1 && (
                <div className="flex flex-wrap gap-4 mb-2">
                  {compareSeries.map(s => (
                    <div key={s.id} className="flex items-center gap-1.5">
                      <div className="w-6 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-slate-600">{s.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <OutcomeLineChart series={compareSeries} xLabels={sessionLabels} metric={metric} />
            </div>
          )}

          {/* Export */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 transition-colors"
              style={{ backgroundColor: accent }}>
              {exporting ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Generating PDF…
                </>
              ) : <>⬇ Download PDF</>}
            </button>
            {exportError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-600">
                <span>⚠ {exportError}</span>
                <button onClick={() => setExportError(null)} className="text-red-400 hover:text-red-600">×</button>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Exported section ──────────────────────────────────────────────────────────

export function OutcomeSummarySection({ patients, screenings, outcomes }: {
  patients: Patient[]
  screenings: Screening[]
  outcomes: OutcomeMeasurement[]
}) {
  const latestScreening = useMemo(() => {
    const map: Record<string, Screening> = {}
    screenings.forEach(s => {
      if (!s.patientId || !s.assessedAt) return
      const cur = map[s.patientId]
      if (!cur || new Date(s.assessedAt).getTime() > new Date(cur.assessedAt!).getTime()) map[s.patientId] = s
    })
    return map
  }, [screenings])

  const outcomesByPat = useMemo(() => {
    const map: Record<string, OutcomeMeasurement[]> = {}
    outcomes.forEach(o => {
      if (!map[o.patientId]) map[o.patientId] = []
      map[o.patientId].push(o)
    })
    return map
  }, [outcomes])

  const { std, eras } = useMemo(() => {
    const std: PInfo[] = [], eras: PInfo[] = []
    patients.forEach(p => {
      if (!p.id) return
      const info: PInfo = { id: p.id, firstName: p.firstName, lastName: p.lastName, hn: p.hn, nationality: p.nationality, sex: p.sex, outcomes: outcomesByPat[p.id] ?? [] }
      if ((p.assessmentType ?? latestScreening[p.id]?.assessmentType) === 'ERAS') eras.push(info)
      else std.push(info)
    })
    return { std, eras }
  }, [patients, latestScreening, outcomesByPat])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 pt-1">
        <h3 className="text-base font-bold text-slate-800">Outcome Summary</h3>
        <span className="text-xs text-slate-400">— bar chart + trend cards by session</span>
      </div>

      <OutcomeBlock
        title="Standard — Outcome Trends"
        accent="#3b82f6"
        patients={std}
        sessions={STD_SUMMARY_SESSIONS}
        sessionLabels={STD_SUMMARY_LABELS}
        metrics={STD_METRICS}
        cardDefs={STD_CARD_DEFS}
        otherDefs={ADMIN_STD_OTHER_DEFS}
        defaultSessions={STD_DEFAULT_SESSIONS}
        blockType="standard"
      />

      <OutcomeBlock
        title="ERAS — Outcome Trends"
        accent="#7c3aed"
        patients={eras}
        sessions={ERAS_SUMMARY_SESSIONS}
        sessionLabels={ERAS_SUMMARY_LABELS}
        metrics={ERAS_METRICS}
        cardDefs={ERAS_CARD_DEFS}
        otherDefs={ADMIN_ERAS_OTHER_DEFS}
        defaultSessions={ERAS_DEFAULT_SESSIONS}
        blockType="eras"
      />
    </div>
  )
}
