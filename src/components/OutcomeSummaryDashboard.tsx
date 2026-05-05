'use client'
import { useMemo, useState, useRef } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
  type ChartData, type ChartOptions, type Plugin,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { OutcomeMeasurement, OverallLevel } from '@/types'
import { OUTCOME_SESSIONS, SESSION_SHORT } from '@/lib/outcomeItems'

// ── Custom top-of-bar label plugin ────────────────────────────────────────────
const barTopLabelPlugin: Plugin<'bar'> = {
  id: 'barTopLabel',
  afterDraw(chart) {
    const pluginOpts = (chart.options.plugins as Record<string, { topLabels?: string[] } | undefined>)?.barTopLabel
    const topLabels = pluginOpts?.topLabels
    if (!topLabels?.length) return
    const { ctx } = chart
    const nCols = chart.data.labels?.length ?? 0
    for (let ci = 0; ci < nCols; ci++) {
      const text = topLabels[ci]
      if (!text) continue
      let minY = Infinity
      let barX: number | null = null
      for (let di = 0; di < chart.data.datasets.length; di++) {
        const meta = chart.getDatasetMeta(di)
        if (!meta.visible) continue
        const el = meta.data[ci]
        if (!el) continue
        const props = el.getProps(['x', 'y'], true) as { x: number; y: number }
        if (props.y < minY) { minY = props.y; barX = props.x }
      }
      if (barX === null || minY === Infinity) continue
      ctx.save()
      ctx.font = 'bold 10px system-ui, sans-serif'
      ctx.fillStyle = '#1e293b'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(text, barX, minY - 3)
      ctx.restore()
    }
  },
}

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, barTopLabelPlugin)

// ── Metric definitions ────────────────────────────────────────────────────────

const BRFA_PARTS = [
  { key: 'brfa_part1', label: 'Part 1 Functional',  color: '#085041' },
  { key: 'brfa_part2', label: 'Part 2 Confidence',  color: '#1D9E75' },
  { key: 'brfa_q20',   label: 'Q20 Environment',    color: '#5DCAA5' },
  { key: 'brfa_q21',   label: 'Q21 Satisfaction',   color: '#9FE1CB' },
] as const

const AMPAC_PARTS = [
  { key: 'ampac_part1', label: 'P1 Basic Mobility',    color: '#3C3489' },
  { key: 'ampac_part2', label: 'P2 Daily Activity',    color: '#7F77DD' },
  { key: 'ampac_part3', label: 'P3 Applied Cognitive', color: '#AFA9EC' },
] as const

interface OtherDef {
  key: string; label: string; unit: string
  color: string; maxRef: number; inverted?: boolean
}
const OTHER_DEFS: OtherDef[] = [
  { key: 'dyspneaScale',      label: 'Dyspnea',    unit: '/10',     color: '#E85D04', maxRef: 10,  inverted: true },
  { key: 'peakCoughFlow',     label: 'Cough Flow', unit: 'L/min',   color: '#378ADD', maxRef: 600 },
  { key: 'wrightSpirometer',  label: 'Wright',     unit: 'mL',      color: '#0F6E56', maxRef: 600 },
  { key: 'gripStrength_left', label: 'Grip L',     unit: 'kg',      color: '#BA7517', maxRef: 60  },
  { key: 'gripStrength_right',label: 'Grip R',     unit: 'kg',      color: '#EF9F27', maxRef: 60  },
  { key: 'cs30',              label: 'CS-30',      unit: 'ครั้ง',   color: '#639922', maxRef: 30  },
  { key: 'twoMeterWalk',      label: '2mWT',       unit: 'seconds', color: '#0891B2', maxRef: 60, inverted: true },
  { key: 'sixMWT',            label: '6MWT',       unit: 'm',       color: '#C77DFF', maxRef: 500 },
  { key: 'twoMinMarching',    label: '2-min March',unit: 'ครั้ง',   color: '#E63946', maxRef: 120 },
]

const COMPARE_PALETTE = ['#3b82f6','#10b981','#f97316','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f59e0b','#ef4444','#64748b','#14b8a6','#6366f1']

function normPct(raw: number, maxRef: number, inverted?: boolean): number {
  const p = inverted ? ((maxRef - raw) / maxRef) * 100 : (raw / maxRef) * 100
  return Math.min(100, Math.max(0, p))
}

function getFilledSessions(outcomes: OutcomeMeasurement[]): string[] {
  const set = new Set(outcomes.map(o => o.session))
  return OUTCOME_SESSIONS.filter(s => set.has(s))
}

// ── Custom BRFA segmented bar ─────────────────────────────────────────────────
// Segments top→bottom: Q21, Q20, Part2, Part1 (each represents one BRFA part, 0–100%)

const BRFA_SVG_SEGS = [
  { key: 'brfa_q21',   short: 'Q21', fullLabel: 'Q21 Satisfaction',  color: '#9FE1CB' },
  { key: 'brfa_q20',   short: 'Q20', fullLabel: 'Q20 Environment',   color: '#5DCAA5' },
  { key: 'brfa_part2', short: 'P2',  fullLabel: 'Part 2 Confidence', color: '#1D9E75' },
  { key: 'brfa_part1', short: 'P1',  fullLabel: 'Part 1 Functional', color: '#085041' },
] as const

type SegTooltip = { text: string; segMidY: number }

function BrfaSegmentBar({ o }: { o: OutcomeMeasurement | undefined }) {
  const W = 72, H = 280
  const BAR_L = 8, BAR_W = 56
  const TOP_PAD = 10, BOT_PAD = 22
  const CHART_H = H - TOP_PAD - BOT_PAD
  const N = BRFA_SVG_SEGS.length
  const SEG_H = CHART_H / N
  const LABEL_H = 11
  const FILL_H = SEG_H - LABEL_H
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<SegTooltip | null>(null)

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0, width: W, height: H }}>
      <svg width={W} height={H} onMouseLeave={() => setTooltip(null)}>
        {BRFA_SVG_SEGS.map((p, i) => {
          const val = o?.items[p.key]?.value
          const hasVal = val !== undefined
          const v = val ?? 0
          const segTop = TOP_PAD + i * SEG_H
          const fillAreaBot = segTop + FILL_H
          const fillH = (v / 100) * FILL_H
          const dashY = fillAreaBot - fillH
          const segMidY = segTop + FILL_H / 2

          return (
            <g key={p.key}
              style={{ cursor: hasVal ? 'default' : undefined }}
              onMouseEnter={() => hasVal && setTooltip({ text: `${p.fullLabel}: ${v.toFixed(0)}%`, segMidY })}
            >
              {/* Background (light gray = 100% reference) */}
              <rect x={BAR_L} y={segTop} width={BAR_W} height={FILL_H} fill="#f5f5f5" />

              {/* Dashed line at score level */}
              {hasVal && (
                <line x1={BAR_L} y1={dashY} x2={BAR_L + BAR_W} y2={dashY}
                  stroke={p.color} strokeWidth={2.5} strokeDasharray="4,3" />
              )}

              {/* Score text above dashed line */}
              {hasVal && (
                <text x={BAR_L + BAR_W / 2} y={Math.max(segTop + 2, dashY - 3)}
                  textAnchor="middle" fontSize="9.5" fill="#1a1a1a" fontWeight="600">
                  {v.toFixed(0)}%
                </text>
              )}

              {/* Segment separator */}
              {i < N - 1 && (
                <line x1={BAR_L} y1={segTop + SEG_H} x2={BAR_L + BAR_W} y2={segTop + SEG_H}
                  stroke="white" strokeWidth={2} />
              )}

              {/* Part label */}
              <text x={BAR_L + BAR_W / 2} y={segTop + SEG_H - 2}
                textAnchor="middle" fontSize="7.5" fill="#64748b">
                {p.short}
              </text>
            </g>
          )
        })}

        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#475569">BRFA</text>
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute', top: tooltip.segMidY - 14, left: W + 6,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '3px 8px', fontSize: 11, color: '#1e293b',
          whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

// ── Custom AMPAC segmented bar ────────────────────────────────────────────────
// Segments top→bottom: P3, P2, P1 (each represents one AMPAC part, 0–24)

const AMPAC_SVG_SEGS = [
  { key: 'ampac_part3', short: 'P3', fullLabel: 'P3 Applied Cognitive', color: '#AFA9EC' },
  { key: 'ampac_part2', short: 'P2', fullLabel: 'P2 Daily Activity',    color: '#7F77DD' },
  { key: 'ampac_part1', short: 'P1', fullLabel: 'P1 Basic Mobility',    color: '#3C3489' },
] as const

function AmpacSegmentBar({ o }: { o: OutcomeMeasurement | undefined }) {
  const W = 72, H = 280
  const BAR_L = 8, BAR_W = 56
  const TOP_PAD = 10, BOT_PAD = 22
  const CHART_H = H - TOP_PAD - BOT_PAD
  const N = AMPAC_SVG_SEGS.length
  const SEG_H = CHART_H / N
  const LABEL_H = 11
  const FILL_H = SEG_H - LABEL_H
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<SegTooltip | null>(null)

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0, width: W, height: H }}>
      <svg width={W} height={H} onMouseLeave={() => setTooltip(null)}>
        {AMPAC_SVG_SEGS.map((p, i) => {
          const val = o?.items[p.key]?.value
          const hasVal = val !== undefined
          const v = val ?? 0
          const segTop = TOP_PAD + i * SEG_H
          const fillAreaBot = segTop + FILL_H
          const fillH = (v / 24) * FILL_H
          const dashY = fillAreaBot - fillH
          const segMidY = segTop + FILL_H / 2

          return (
            <g key={p.key}
              style={{ cursor: hasVal ? 'default' : undefined }}
              onMouseEnter={() => hasVal && setTooltip({ text: `${p.fullLabel}: ${v.toFixed(0)}/24`, segMidY })}
            >
              {/* Background (light gray = 24/24 reference) */}
              <rect x={BAR_L} y={segTop} width={BAR_W} height={FILL_H} fill="#f5f5f5" />

              {/* Dashed line at score level */}
              {hasVal && (
                <line x1={BAR_L} y1={dashY} x2={BAR_L + BAR_W} y2={dashY}
                  stroke={p.color} strokeWidth={2.5} strokeDasharray="4,3" />
              )}

              {/* Score text above dashed line */}
              {hasVal && (
                <text x={BAR_L + BAR_W / 2} y={Math.max(segTop + 2, dashY - 3)}
                  textAnchor="middle" fontSize="9.5" fill="#1a1a1a" fontWeight="600">
                  {v.toFixed(0)}/24
                </text>
              )}

              {/* Segment separator */}
              {i < N - 1 && (
                <line x1={BAR_L} y1={segTop + SEG_H} x2={BAR_L + BAR_W} y2={segTop + SEG_H}
                  stroke="white" strokeWidth={2} />
              )}

              {/* Part label */}
              <text x={BAR_L + BAR_W / 2} y={segTop + SEG_H - 2}
                textAnchor="middle" fontSize="7.5" fill="#64748b">
                {p.short}
              </text>
            </g>
          )
        })}

        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#475569">AMPAC</text>
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute', top: tooltip.segMidY - 14, left: W + 6,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '3px 8px', fontSize: 11, color: '#1e293b',
          whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OutcomeSummaryDashboard({
  outcomes,
  level: _level,
}: {
  outcomes: OutcomeMeasurement[]
  level: OverallLevel
}) {
  const filledSessions = useMemo(() => getFilledSessions(outcomes), [outcomes])
  const [compareMode, setCompareMode] = useState(false)
  const [selectedSession, setSelectedSession] = useState<string>(() => filledSessions[filledSessions.length - 1] ?? 'Initial')

  const bySession = useMemo(() => {
    const m: Record<string, OutcomeMeasurement> = {}
    outcomes.forEach(o => { m[o.session] = o })
    return m
  }, [outcomes])

  if (filledSessions.length === 0) return null

  // Cross-session presence flags (used by compare mode and legend)
  const hasBrfa  = outcomes.some(o => BRFA_PARTS.some(p => o.items[p.key]?.value !== undefined))
  const hasAmpac = outcomes.some(o => AMPAC_PARTS.some(p => o.items[p.key]?.value !== undefined))
  const presentOthers = OTHER_DEFS.filter(d => outcomes.some(o => o.items[d.key]?.value !== undefined))

  // Selected session outcome (for custom SVG bars)
  const selectedO = bySession[selectedSession]
  const showBrfaSvg  = !compareMode && BRFA_PARTS.some(p  => selectedO?.items[p.key]?.value !== undefined)
  const showAmpacSvg = !compareMode && AMPAC_PARTS.some(p => selectedO?.items[p.key]?.value !== undefined)

  // ── Chart data ──────────────────────────────────────────────────────────────

  const { chartLabels, chartDatasets, topLabels } = useMemo(() => {
    if (compareMode) {
      // X = metric names, datasets = sessions (BRFA/AMPAC shown as avg %)
      const colLabels: string[] = []
      if (hasBrfa)  colLabels.push('BRFA')
      if (hasAmpac) colLabels.push('AMPAC')
      presentOthers.forEach(d => colLabels.push(d.label))

      const datasets: ChartData<'bar'>['datasets'] = filledSessions.map((sess, si) => {
        const o = bySession[sess]
        const data: (number | null)[] = []
        if (hasBrfa) {
          const vals = BRFA_PARTS.map(p => o?.items[p.key]?.value).filter((v): v is number => v !== undefined)
          data.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null)
        }
        if (hasAmpac) {
          const vals = AMPAC_PARTS.map(p => {
            const r = o?.items[p.key]?.value
            return r !== undefined ? normPct(r, 24) : undefined
          }).filter((v): v is number => v !== undefined)
          data.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null)
        }
        presentOthers.forEach(d => {
          const r = o?.items[d.key]?.value
          data.push(r !== undefined ? normPct(r, d.maxRef, d.inverted) : null)
        })
        return {
          label: SESSION_SHORT[sess] ?? sess,
          data,
          backgroundColor: COMPARE_PALETTE[si % COMPARE_PALETTE.length],
          barPercentage: 0.95,
          categoryPercentage: 0.85,
        }
      })

      return { chartLabels: colLabels, chartDatasets: datasets, topLabels: colLabels.map(() => '') }
    }

    // Single-session mode — BRFA/AMPAC rendered as custom SVG; only "others" in Chart.js
    const o = bySession[selectedSession]
    type Col = { id: string; label: string }
    const cols: Col[] = []
    OTHER_DEFS.forEach(d => {
      if (o?.items[d.key]?.value !== undefined) cols.push({ id: d.key, label: d.label })
    })
    const n = cols.length

    const tl: string[] = cols.map(col => (o ? `${o.items[col.id]?.value ?? ''}` : ''))

    const datasets: ChartData<'bar'>['datasets'] = []
    OTHER_DEFS.forEach(d => {
      const ci = cols.findIndex(c => c.id === d.key)
      if (ci < 0) return
      const raw = o?.items[d.key]?.value
      if (raw === undefined) return
      const data: (number | null)[] = Array(n).fill(null)
      data[ci] = normPct(raw, d.maxRef, d.inverted)
      datasets.push({ label: d.label, data, backgroundColor: d.color, stack: d.key, barPercentage: 0.95, categoryPercentage: 0.85 })
    })

    return { chartLabels: cols.map(c => c.label), chartDatasets: datasets, topLabels: tl }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, selectedSession, outcomes])

  const options = useMemo((): ChartOptions<'bar'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = typeof ctx.raw === 'number' ? ctx.raw.toFixed(1) : '–'
            return ` ${ctx.dataset.label}: ${val}%`
          },
        },
      },
      barTopLabel: { topLabels },
    } as ChartOptions<'bar'>['plugins'],
    scales: {
      x: {
        stacked: !compareMode,
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10 }, color: '#475569' },
      },
      y: {
        stacked: !compareMode,
        display: false,
        beginAtZero: true,
        max: compareMode ? 100 : undefined,
      },
    },
  }), [compareMode, topLabels])

  // ── Legend ──────────────────────────────────────────────────────────────────

  const latestO = bySession[filledSessions[filledSessions.length - 1]]

  interface LegendItem { key: string; label: string; color: string }
  const legendItems: LegendItem[] = compareMode
    ? filledSessions.map((s, i) => ({ key: s, label: SESSION_SHORT[s] ?? s, color: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }))
    : presentOthers.filter(d => latestO?.items[d.key]?.value !== undefined)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mt-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-slate-700">Outcome Summary</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {!compareMode && (
            <select
              value={selectedSession}
              onChange={e => setSelectedSession(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-blue-400">
              {filledSessions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
            {(['ล่าสุด', 'เปรียบทุก session'] as const).map((label, i) => (
              <button key={label} onClick={() => setCompareMode(i === 1)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  compareMode === (i === 1) ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        {/* Legend — others only in single-session; sessions in compare */}
        {legendItems.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3 pb-3 border-b border-slate-100">
            {legendItems.map(item => (
              <div key={item.key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: item.color }} />
                <span className="text-[11px] text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {compareMode ? (
          // Compare mode: full-width Chart.js
          <div style={{ height: 280 }}>
            <Bar
              key="compare"
              data={{ labels: chartLabels, datasets: chartDatasets }}
              options={options}
            />
          </div>
        ) : (
          // Single-session: custom SVG bars + Chart.js for others, same height row
          <div className="flex items-stretch gap-1" style={{ height: 280 }}>
            {showBrfaSvg  && <BrfaSegmentBar  o={selectedO} />}
            {showAmpacSvg && <AmpacSegmentBar o={selectedO} />}
            {chartDatasets.length > 0 && (
              <div className="flex-1 min-w-0">
                <Bar
                  key={selectedSession}
                  data={{ labels: chartLabels, datasets: chartDatasets }}
                  options={options}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
