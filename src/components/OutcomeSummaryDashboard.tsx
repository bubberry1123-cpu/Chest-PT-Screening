'use client'
import { useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { Bar } from 'react-chartjs-2'
import type { OutcomeMeasurement, OverallLevel } from '@/types'
import { OUTCOME_SESSIONS, SESSION_SHORT } from '@/lib/outcomeItems'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, annotationPlugin)

// ── Normalisation config ───────────────────────────────────────────────────────

interface NormDef {
  key: string
  label: string
  maxRef: number          // denominator for % (use negative to signal inversion)
  inverted?: boolean      // true → (max - value) / max * 100
  threshold: number       // % threshold for pass/fail badge
  unit: string
  rawMax?: number         // for display only
  group: 'brfa' | 'ampac' | 'other'
  stackGroup?: string     // chart.js stack id
  color: string
}

const NORM_DEFS: NormDef[] = [
  // BRFA — stacked, green shades
  { key: 'brfa_part1',  label: 'BRFA P1',   maxRef: 100, threshold: 60, unit: '%',    group: 'brfa', stackGroup: 'brfa', color: 'rgba(34,197,94,0.85)'  },
  { key: 'brfa_part2',  label: 'BRFA P2',   maxRef: 100, threshold: 60, unit: '%',    group: 'brfa', stackGroup: 'brfa', color: 'rgba(21,128,61,0.85)'   },
  { key: 'brfa_q20',    label: 'BRFA Q20',  maxRef: 100, threshold: 60, unit: '%',    group: 'brfa', stackGroup: 'brfa', color: 'rgba(74,222,128,0.85)'  },
  { key: 'brfa_q21',    label: 'BRFA Q21',  maxRef: 100, threshold: 60, unit: '%',    group: 'brfa', stackGroup: 'brfa', color: 'rgba(134,239,172,0.85)' },
  // AMPAC — stacked, purple shades
  { key: 'ampac_part1', label: 'AMPAC P1',  maxRef: 24,  threshold: 60, unit: '/24',  group: 'ampac', stackGroup: 'ampac', color: 'rgba(139,92,246,0.85)'  },
  { key: 'ampac_part2', label: 'AMPAC P2',  maxRef: 24,  threshold: 60, unit: '/24',  group: 'ampac', stackGroup: 'ampac', color: 'rgba(109,40,217,0.85)'   },
  { key: 'ampac_part3', label: 'AMPAC P3',  maxRef: 24,  threshold: 60, unit: '/24',  group: 'ampac', stackGroup: 'ampac', color: 'rgba(196,181,253,0.85)' },
  // Single bars — other
  { key: 'dyspneaScale',     label: 'Dyspnea',    maxRef: 10,  inverted: true, threshold: 60, unit: '/10',   group: 'other', color: 'rgba(249,115,22,0.85)' },
  { key: 'peakCoughFlow',    label: 'Cough Flow', maxRef: 600, threshold: 60, unit: 'L/min', group: 'other', color: 'rgba(59,130,246,0.85)'  },
  { key: 'wrightSpirometer', label: 'Wright',     maxRef: 600, threshold: 60, unit: 'mL',    group: 'other', color: 'rgba(14,165,233,0.85)'  },
  { key: 'gripStrength_left',  label: 'Grip L',   maxRef: 60,  threshold: 60, unit: 'kg',    group: 'other', color: 'rgba(168,85,247,0.85)'  },
  { key: 'gripStrength_right', label: 'Grip R',   maxRef: 60,  threshold: 60, unit: 'kg',    group: 'other', color: 'rgba(217,70,239,0.85)'  },
  { key: 'cs30',        label: 'CS-30',     maxRef: 30,  threshold: 60, unit: 'stands', group: 'other', color: 'rgba(234,179,8,0.85)'   },
  { key: 'sixMWT',      label: '6MWT',      maxRef: 500, threshold: 60, unit: 'm',      group: 'other', color: 'rgba(239,68,68,0.85)'   },
  { key: 'twoMinMarching', label: '2-min',  maxRef: 120, threshold: 60, unit: 'steps',  group: 'other', color: 'rgba(236,72,153,0.85)'  },
]

function normPct(def: NormDef, raw: number): number {
  const pct = def.inverted
    ? ((def.maxRef - raw) / def.maxRef) * 100
    : (raw / def.maxRef) * 100
  return Math.min(100, Math.max(0, pct))
}

// ── Available items for a given level ─────────────────────────────────────────

function defsForLevel(level: OverallLevel): NormDef[] {
  const allowed: Record<OverallLevel, string[]> = {
    1: ['brfa_part1','brfa_part2','brfa_q20','brfa_q21','ampac_part1','ampac_part2','ampac_part3','dyspneaScale','peakCoughFlow','wrightSpirometer','gripStrength_left','gripStrength_right','sixMWT','twoMinMarching'],
    2: ['brfa_part1','brfa_part2','brfa_q20','brfa_q21','ampac_part1','ampac_part2','ampac_part3','dyspneaScale','peakCoughFlow','wrightSpirometer','gripStrength_left','gripStrength_right','cs30'],
    3: ['brfa_part1','brfa_part2','brfa_q20','brfa_q21','ampac_part1','ampac_part2','ampac_part3','dyspneaScale','peakCoughFlow','wrightSpirometer'],
    4: ['brfa_part1','brfa_part2','brfa_q20','brfa_q21','ampac_part1','ampac_part2','ampac_part3','dyspneaScale'],
  }
  return NORM_DEFS.filter(d => allowed[level].includes(d.key))
}

// ── Session helpers ────────────────────────────────────────────────────────────

function getFilledSessions(outcomes: OutcomeMeasurement[]): string[] {
  const set = new Set(outcomes.map(o => o.session))
  return OUTCOME_SESSIONS.filter(s => set.has(s))
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function SummaryBarChart({
  outcomes,
  defs,
  selectedSessions,
  compareMode,
}: {
  outcomes: OutcomeMeasurement[]
  defs: NormDef[]
  selectedSessions: string[]
  compareMode: boolean
}) {
  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })

  // X-axis labels: group labels with section separators
  // We show BRFA | AMPAC | other as separate stacked columns in the chart
  // Each "column" is actually one entry in labels

  const brfaDefs  = defs.filter(d => d.group === 'brfa')
  const ampacDefs = defs.filter(d => d.group === 'ampac')
  const otherDefs = defs.filter(d => d.group === 'other')

  // Build flat label list: group stacks collapse to single label
  const colDefs: NormDef[] = [
    ...(brfaDefs.length  ? [brfaDefs[0]]  : []),   // BRFA → one stacked column
    ...(ampacDefs.length ? [ampacDefs[0]] : []),   // AMPAC → one stacked column
    ...otherDefs,                                   // each is its own column
  ]
  const labels = colDefs.map(d => {
    if (d.key === 'brfa_part1')  return 'BRFA'
    if (d.key === 'ampac_part1') return 'AMPAC'
    return d.label
  })

  const sessions = compareMode ? selectedSessions : [selectedSessions[selectedSessions.length - 1]]

  // Each session → one dataset per NormDef (for stacked) or combined
  // Strategy: one dataset per NormDef, stacked by stackGroup
  const datasetMap: Map<string, { def: NormDef; data: (number | null)[][] }> = new Map()

  for (const def of defs) {
    datasetMap.set(def.key, { def, data: sessions.map(() => Array(colDefs.length).fill(null)) })
  }

  for (let si = 0; si < sessions.length; si++) {
    const sess = sessions[si]
    const o = bySession[sess]
    if (!o) continue
    for (const def of defs) {
      const raw = o.items[def.key]?.value
      if (raw === undefined) continue
      const pct = normPct(def, raw)
      const ci = colDefs.findIndex(c => {
        if (def.group === 'brfa') return c.key === 'brfa_part1'
        if (def.group === 'ampac') return c.key === 'ampac_part1'
        return c.key === def.key
      })
      if (ci >= 0) {
        const entry = datasetMap.get(def.key)!
        entry.data[si][ci] = pct
      }
    }
  }

  // Build Chart.js datasets
  const datasets = []
  for (const [, { def, data }] of datasetMap) {
    // In compare mode each session is a separate visual group via offset
    // Simpler: one dataset per def, one bar per column, stacked within group
    for (let si = 0; si < sessions.length; si++) {
      const label = compareMode
        ? `${def.label} (${SESSION_SHORT[sessions[si]] ?? sessions[si]})`
        : def.label
      datasets.push({
        label,
        data: data[si],
        backgroundColor: def.color,
        borderColor: def.color.replace('0.85', '1'),
        borderWidth: 1,
        stack: compareMode ? `${def.stackGroup ?? def.key}_${si}` : (def.stackGroup ?? def.key),
        barPercentage: compareMode ? 0.4 : 0.6,
        categoryPercentage: 0.8,
      })
    }
  }

  // Threshold annotation lines — one per column at 60%
  const annotations: Record<string, object> = {}
  colDefs.forEach((_, ci) => {
    annotations[`th_${ci}`] = {
      type: 'line' as const,
      scaleID: 'y',
      value: 60,
      borderColor: 'rgba(239,68,68,0.6)',
      borderWidth: 1.5,
      borderDash: [4, 4],
    }
  })

  const chartData = { labels, datasets }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: compareMode, position: 'bottom' as const, labels: { font: { size: 10 }, boxWidth: 12, padding: 8 } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label: string }; raw: unknown }) => {
            const pct = typeof ctx.raw === 'number' ? ctx.raw.toFixed(1) : '–'
            return ` ${ctx.dataset.label}: ${pct}%`
          },
        },
      },
      annotation: { annotations },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { font: { size: 10 }, color: '#64748b' },
        grid: { display: false },
      },
      y: {
        stacked: true,
        min: 0,
        max: 100,
        ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v: string | number) => `${v}%` },
        grid: { color: '#f1f5f9' },
      },
    },
  }

  return (
    <div style={{ height: 260 }}>
      <Bar data={chartData} options={options as Parameters<typeof Bar>[0]['options']} />
    </div>
  )
}

// ── Outcome Card ───────────────────────────────────────────────────────────────

function OutcomeCard({ def, latest, initial }: { def: NormDef; latest: OutcomeMeasurement | null; initial: OutcomeMeasurement | null }) {
  const rawLatest = latest?.items[def.key]?.value
  const rawInitial = initial?.items[def.key]?.value

  if (rawLatest === undefined) return null

  const pct = normPct(def, rawLatest)
  const pass = pct >= def.threshold

  let delta: number | null = null
  if (rawInitial !== undefined) {
    delta = normPct(def, rawLatest) - normPct(def, rawInitial)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col gap-1.5 min-w-[120px]">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-slate-600 truncate">{def.label}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {pass ? 'Pass' : 'Low'}
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-xl font-bold text-slate-800 leading-none">{pct.toFixed(0)}<span className="text-xs font-normal text-slate-400">%</span></span>
        {delta !== null && (
          <span className={`text-xs font-semibold mb-0.5 ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-slate-400'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-400">
        Raw: {rawLatest} {def.unit}
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-0.5">
        <div
          className={`h-1.5 rounded-full transition-all ${pass ? 'bg-green-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OutcomeSummaryDashboard({
  outcomes,
  level,
}: {
  outcomes: OutcomeMeasurement[]
  level: OverallLevel
}) {
  const filledSessions = useMemo(() => getFilledSessions(outcomes), [outcomes])
  const defs = useMemo(() => defsForLevel(level), [level])

  const [compareMode, setCompareMode] = useState(false)
  const [sessionCount, setSessionCount] = useState(filledSessions.length)

  if (filledSessions.length === 0) return null

  const selectedSessions = filledSessions.slice(0, Math.min(sessionCount, filledSessions.length))

  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })

  const latestSession = filledSessions[filledSessions.length - 1]
  const latestOutcome = bySession[latestSession] ?? null
  const initialOutcome = bySession['Initial'] ?? null

  // Summary stats
  const latestPcts = defs
    .map(d => {
      const raw = latestOutcome?.items[d.key]?.value
      return raw !== undefined ? normPct(d, raw) : null
    })
    .filter((v): v is number => v !== null)

  const avgPct = latestPcts.length ? latestPcts.reduce((a, b) => a + b, 0) / latestPcts.length : null

  const initPcts = defs
    .map(d => {
      const raw = initialOutcome?.items[d.key]?.value
      return raw !== undefined ? normPct(d, raw) : null
    })
    .filter((v): v is number => v !== null)

  const avgInit = initPcts.length ? initPcts.reduce((a, b) => a + b, 0) / initPcts.length : null
  const avgDelta = avgPct !== null && avgInit !== null ? avgPct - avgInit : null

  const belowThreshold = defs.filter(d => {
    const raw = latestOutcome?.items[d.key]?.value
    return raw !== undefined && normPct(d, raw) < d.threshold
  }).length
  const totalMeasured = defs.filter(d => latestOutcome?.items[d.key]?.value !== undefined).length

  return (
    <div className="mt-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-slate-700">Outcome Summary</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Session count selector */}
          <select
            value={sessionCount}
            onChange={e => setSessionCount(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-blue-400">
            {filledSessions.map((s, i) => (
              <option key={s} value={i + 1}>
                {i + 1 === 1 ? '1 session' : `${i + 1} sessions`}
              </option>
            ))}
          </select>
          {/* Compare toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setCompareMode(false)}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${!compareMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              ล่าสุด
            </button>
            <button
              onClick={() => setCompareMode(true)}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${compareMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              เปรียบทุก visit
            </button>
          </div>
        </div>
      </div>

      {/* Summary stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <div className="text-xs text-blue-500 font-medium mb-0.5">Avg Score (ล่าสุด)</div>
          <div className="text-2xl font-bold text-blue-700">{avgPct !== null ? `${avgPct.toFixed(0)}%` : '–'}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-xs text-emerald-600 font-medium mb-0.5">พัฒนาการ vs Initial</div>
          <div className={`text-2xl font-bold ${avgDelta === null ? 'text-slate-400' : avgDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {avgDelta !== null ? `${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(0)}%` : '–'}
          </div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
          <div className="text-xs text-red-500 font-medium mb-0.5">ต่ำกว่าเกณฑ์</div>
          <div className="text-2xl font-bold text-red-600">{belowThreshold}<span className="text-sm text-red-400">/{totalMeasured}</span></div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-6 h-0.5 border-t-2 border-dashed border-red-400" />
            60% threshold
          </div>
          <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(34,197,94,0.85)' }} /> BRFA</div>
          <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(139,92,246,0.85)' }} /> AMPAC</div>
          <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(59,130,246,0.85)' }} /> Others</div>
        </div>
        <SummaryBarChart
          outcomes={outcomes}
          defs={defs}
          selectedSessions={selectedSessions}
          compareMode={compareMode}
        />
      </div>

      {/* Outcome cards */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">รายละเอียดแต่ละ Outcome</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {defs.map(def => (
            <OutcomeCard
              key={def.key}
              def={def}
              latest={latestOutcome}
              initial={initialOutcome}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
