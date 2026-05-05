'use client'
import { useState, useRef } from 'react'
import type { OutcomeMeasurement, OverallLevel } from '@/types'
import { OUTCOME_SESSIONS, SESSION_SHORT } from '@/lib/outcomeItems'

const LEVEL_COLOR: Record<number, string> = {
  1: '#22c55e',
  2: '#3b82f6',
  3: '#f97316',
  4: '#ef4444',
}
const MULTI_PALETTE = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6']

type GroupKey = 'functional' | 'respiratory' | 'physical'

interface SeriesDef {
  key: string
  label: string
  color: string
  unit?: string
}

interface ChartDef {
  title: string
  unit: string
  series: SeriesDef[]
  inverted?: boolean
}

interface SeriesTemplate { key: string; label: string; unit?: string }
interface ChartTemplate { title: string; unit: string; series: SeriesTemplate[]; inverted?: boolean }
interface GroupDef { label: string; charts: ChartTemplate[] }

const CHART_GROUPS: Record<GroupKey, GroupDef> = {
  functional: {
    label: 'Functional',
    charts: [
      {
        title: 'AMPAC',
        unit: '/24',
        series: [
          { key: 'ampac_part1', label: 'Part 1' },
          { key: 'ampac_part2', label: 'Part 2' },
          { key: 'ampac_part3', label: 'Part 3' },
        ],
      },
      {
        title: 'BRFA',
        unit: '%',
        series: [
          { key: 'brfa_part1', label: 'Part 1' },
          { key: 'brfa_part2', label: 'Part 2' },
          { key: 'brfa_q20',   label: 'Q20' },
          { key: 'brfa_q21',   label: 'Q21' },
        ],
      },
    ],
  },
  respiratory: {
    label: 'Respiratory',
    charts: [
      { title: 'Peak Cough Flow',  unit: 'L/min', series: [{ key: 'peakCoughFlow',    label: 'PCF' }] },
      { title: 'Wright Spirometer', unit: 'mL',    series: [{ key: 'wrightSpirometer', label: 'Wright' }] },
      { title: 'Dyspnea Scale',    unit: '/10', inverted: true, series: [{ key: 'dyspneaScale', label: 'Dyspnea' }] },
    ],
  },
  physical: {
    label: 'Physical',
    charts: [
      {
        title: 'Grip Strength',
        unit: 'kg',
        series: [
          { key: 'gripStrength_left',  label: 'Left' },
          { key: 'gripStrength_right', label: 'Right' },
        ],
      },
      { title: 'CS-30', unit: 'stands', series: [{ key: 'cs30', label: 'CS-30' }] },
      { title: '2-Meter Walk Test', unit: 'seconds', inverted: true, series: [{ key: 'twoMeterWalk', label: '2mWT' }] },
      {
        title: '6MWT / 2-min Marching',
        unit: '',
        series: [
          { key: 'sixMWT',         label: '6MWT',  unit: 'm' },
          { key: 'twoMinMarching', label: '2-min', unit: 'steps' },
        ],
      },
    ],
  },
}

function resolveColors(series: SeriesTemplate[], level: OverallLevel): SeriesDef[] {
  if (series.length === 1) return [{ ...series[0], color: LEVEL_COLOR[level] }]
  return series.map((s, i) => ({ ...s, color: MULTI_PALETTE[i % MULTI_PALETTE.length] }))
}

// ── SVG Chart ────────────────────────────────────────────────────────────────

interface TooltipState {
  mouseX: number
  mouseY: number
  sessionLabel: string
  dateStr: string | null
  items: { label: string; val: number; color: string; unit: string }[]
}

function LineChartSVG({ chartDef, outcomes }: { chartDef: ChartDef; outcomes: OutcomeMeasurement[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const bySession: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { bySession[o.session] = o })

  const W = 520, H = 160, PL = 52, PR = 12, PT = 18, PB = 30
  const chartW = W - PL - PR
  const chartH = H - PT - PB
  const n = OUTCOME_SESSIONS.length

  const series = chartDef.series.map(s => ({
    ...s,
    points: OUTCOME_SESSIONS.map((sess, i) => {
      const v = bySession[sess]?.items[s.key]?.value
      return { x: PL + (i / (n - 1)) * chartW, i, val: v !== undefined ? v : null }
    }),
  }))

  const allVals = series.flatMap(s => s.points.map(p => p.val)).filter((v): v is number => v !== null)
  if (allVals.length === 0) return null

  let yMin = Math.min(...allVals)
  let yMax = Math.max(...allVals)
  if (yMin === yMax) { yMin = Math.max(0, yMin - 1); yMax = yMax + 1 }
  const yRange = yMax - yMin
  const toY = (v: number) => PT + (1 - (v - yMin) / yRange) * chartH

  const getSegments = (points: (typeof series)[0]['points']) => {
    const segs: { x: number; y: number }[][] = []
    let cur: { x: number; y: number }[] = []
    for (const p of points) {
      if (p.val !== null) {
        cur.push({ x: p.x, y: toY(p.val) })
      } else if (cur.length) { segs.push(cur); cur = [] }
    }
    if (cur.length) segs.push(cur)
    return segs
  }

  const nTicks = 4
  const ticks = Array.from({ length: nTicks }, (_, i) => yMin + (yRange / (nTicks - 1)) * i)
  const hoverX = hoverIdx !== null ? PL + (hoverIdx / (n - 1)) * chartW : null

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    if (svgX < PL - 28 || svgX > W - PR + 28) { clear(); return }
    const xs = OUTCOME_SESSIONS.map((_, i) => PL + (i / (n - 1)) * chartW)
    const idx = xs.reduce((b, x, i) => Math.abs(x - svgX) < Math.abs(xs[b] - svgX) ? i : b, 0)
    setHoverIdx(idx)
    const sess = OUTCOME_SESSIONS[idx]
    const o = bySession[sess]
    const items = series
      .map(s => ({ label: s.label, val: s.points[idx].val, color: s.color, unit: s.unit ?? chartDef.unit }))
      .filter((it): it is { label: string; val: number; color: string; unit: string } => it.val !== null)
    if (!items.length) { setTooltip(null); return }
    const dateStr = o?.recordedAt
      ? new Date(o.recordedAt as Date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : null
    setTooltip({ mouseX: e.clientX, mouseY: e.clientY, sessionLabel: SESSION_SHORT[sess], dateStr, items })
  }

  const clear = () => { setTooltip(null); setHoverIdx(null) }

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ height: 160 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={clear}
      >
        {/* Y grid */}
        {ticks.map((v, i) => {
          const y = toY(v)
          const lbl = Math.abs(v) >= 100 ? Math.round(v).toString() : Number.isInteger(v) ? String(v) : v.toFixed(1)
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PL - 4} y={y + 3.5} fontSize="9" fill="#94a3b8" textAnchor="end">{lbl}</text>
            </g>
          )
        })}

        {/* Hover highlight */}
        {hoverX !== null && (
          <>
            <rect x={hoverX - 20} y={PT} width={40} height={chartH} fill="#f8fafc" rx="3" />
            <line x1={hoverX} y1={PT} x2={hoverX} y2={PT + chartH}
              stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,2" />
          </>
        )}

        {/* Series */}
        {series.map(s => {
          const segs = getSegments(s.points)
          return (
            <g key={s.key}>
              {segs.map((seg, si) =>
                seg.length > 1 ? (
                  <polyline key={si}
                    points={seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                    fill="none" stroke={s.color} strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                ) : null
              )}
              {s.points.filter(p => p.val !== null).map((p, pi) => (
                <circle key={pi}
                  cx={p.x.toFixed(1)} cy={toY(p.val!).toFixed(1)}
                  r="4" fill={s.color} stroke="white" strokeWidth="2"
                />
              ))}
            </g>
          )
        })}

        {/* X labels */}
        {OUTCOME_SESSIONS.map((sess, i) => {
          const x = PL + (i / (n - 1)) * chartW
          const hasData = series.some(s => s.points[i].val !== null)
          return (
            <text key={i} x={x.toFixed(1)} y={H - 2} fontSize="9"
              fill={hasData ? '#64748b' : '#cbd5e1'} textAnchor="middle">
              {SESSION_SHORT[sess]}
            </text>
          )
        })}

        {/* Inverted note */}
        {chartDef.inverted && (
          <text x={W - PR} y={PT - 4} fontSize="8" fill="#94a3b8" textAnchor="end">↓ lower = better</text>
        )}
      </svg>

      {/* Tooltip — fixed so it's never clipped */}
      {tooltip && (
        <div
          className="fixed z-[300] bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2.5 text-xs pointer-events-none"
          style={{
            left: Math.min(tooltip.mouseX + 16, (typeof window !== 'undefined' ? window.innerWidth : 800) - 220),
            top: Math.max(tooltip.mouseY - 72, 8),
          }}>
          <p className="font-semibold text-slate-600 mb-1.5">
            {tooltip.sessionLabel}
            {tooltip.dateStr && <span className="font-normal text-slate-400 ml-1.5">· {tooltip.dateStr}</span>}
          </p>
          {tooltip.items.map((item, ti) => (
            <div key={ti} className="flex items-center gap-2 py-0.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-slate-500">{item.label}</span>
              <span className="font-bold text-slate-800 ml-auto pl-3">{item.val}{item.unit ? ` ${item.unit}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function OutcomeCharts({
  outcomes,
  level,
  isAdmin,
}: {
  outcomes: OutcomeMeasurement[]
  level: OverallLevel
  isAdmin: boolean
}) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>('functional')
  const chartsRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const handleExportPNG = async () => {
    if (!chartsRef.current) return
    setExporting(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(chartsRef.current, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
      })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `ChestPT_Outcome_${activeGroup}.png`
      a.click()
    } finally {
      setExporting(false)
    }
  }

  const groupDef = CHART_GROUPS[activeGroup]
  const visibleCharts = groupDef.charts
    .map((c): ChartDef => ({ title: c.title, unit: c.unit, inverted: c.inverted, series: resolveColors(c.series, level) }))
    .filter(c => c.series.some(s => outcomes.some(o => o.items[s.key] !== undefined)))

  return (
    <div className="mt-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-slate-700">Outcome Charts</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Group tabs */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(Object.keys(CHART_GROUPS) as GroupKey[]).map(key => (
              <button key={key} onClick={() => setActiveGroup(key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeGroup === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {CHART_GROUPS[key].label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={handleExportPNG} disabled={exporting}
              className="text-xs border border-slate-200 px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1">
              {exporting ? 'Exporting...' : '↓ Export PNG'}
            </button>
          )}
        </div>
      </div>

      {/* Chart cards */}
      <div ref={chartsRef} className="space-y-3">
        {visibleCharts.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm bg-white rounded-xl border border-dashed border-slate-200">
            No {groupDef.label.toLowerCase()} outcome data recorded yet
          </div>
        ) : visibleCharts.map(chart => (
          <div key={chart.title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            {/* Card header: title + legend */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs font-bold text-slate-700">{chart.title}</span>
                {chart.series.map(s => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div className="w-5 h-[2.5px] rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-slate-500">
                      {s.label}{s.unit ? ` (${s.unit})` : ''}
                    </span>
                  </div>
                ))}
              </div>
              {chart.unit && !chart.series.some(s => s.unit) && (
                <span className="text-xs text-slate-400">{chart.unit}</span>
              )}
            </div>
            <LineChartSVG chartDef={chart} outcomes={outcomes} />
          </div>
        ))}
      </div>
    </div>
  )
}
