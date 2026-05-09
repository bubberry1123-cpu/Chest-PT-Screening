'use client'
import { useMemo, useState } from 'react'
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
  { key: 'dyspneaScale',      label: 'mMRC',       unit: '/4',      color: '#E85D04', maxRef: 4,   inverted: true },
  { key: 'peakCoughFlow',     label: 'Cough Flow', unit: 'L/min',   color: '#378ADD', maxRef: 600 },
  { key: 'wrightSpirometer',  label: 'Wright',     unit: 'mL',      color: '#0F6E56', maxRef: 600 },
  { key: 'gripStrength_left', label: 'Grip L',     unit: 'kg',      color: '#BA7517', maxRef: 60  },
  { key: 'gripStrength_right',label: 'Grip R',     unit: 'kg',      color: '#EF9F27', maxRef: 60  },
  { key: 'cs30',              label: 'CS-30',      unit: 'ครั้ง',   color: '#639922', maxRef: 30  },
  { key: 'twoMeterWalk',      label: '2MWT',       unit: 'meters',  color: '#0891B2', maxRef: 500 },
  { key: 'sixMWT',            label: '6MWT',       unit: 'm',       color: '#C77DFF', maxRef: 600 },
  { key: 'twoMinMarching',    label: '2MST',       unit: 'steps',   color: '#E63946', maxRef: 120 },
]

const SESSION_PALETTE = [
  '#3b82f6','#10b981','#f97316','#8b5cf6','#ec4899',
  '#06b6d4','#84cc16','#f59e0b','#ef4444','#64748b','#14b8a6','#6366f1',
]

function normPct(raw: number, maxRef: number, inverted?: boolean): number {
  const p = inverted ? ((maxRef - raw) / maxRef) * 100 : (raw / maxRef) * 100
  return Math.min(100, Math.max(0, p))
}

function getFilledSessions(outcomes: OutcomeMeasurement[]): string[] {
  const set = new Set(outcomes.map(o => o.session))
  return OUTCOME_SESSIONS.filter(s => set.has(s))
}

// ── Session datum ─────────────────────────────────────────────────────────────

interface SessionDatum {
  session: string
  label: string
  color: string
  o: OutcomeMeasurement | undefined
}

// ── BRFA segmented bar ────────────────────────────────────────────────────────

const BRFA_SVG_SEGS = [
  { key: 'brfa_q21',   short: 'Q21', fullLabel: 'Q21 Satisfaction',  segColor: '#9FE1CB', maxVal: 100, unit: '%' },
  { key: 'brfa_q20',   short: 'Q20', fullLabel: 'Q20 Environment',   segColor: '#5DCAA5', maxVal: 100, unit: '%' },
  { key: 'brfa_part2', short: 'P2',  fullLabel: 'Part 2 Confidence', segColor: '#1D9E75', maxVal: 100, unit: '%' },
  { key: 'brfa_part1', short: 'P1',  fullLabel: 'Part 1 Functional', segColor: '#085041', maxVal: 100, unit: '%' },
] as const

type SegTooltip = {
  fullLabel: string
  entries: { label: string; value: string; color: string }[]
  segMidY: number
}

function BrfaSegmentBar({ sessions }: { sessions: SessionDatum[] }) {
  const W = 72, H = 320, BAR_L = 8, BAR_W = 56
  const TOP_PAD = 10, BOT_PAD = 22
  const CHART_H = H - TOP_PAD - BOT_PAD
  const N = BRFA_SVG_SEGS.length
  const SEG_H = CHART_H / N
  const TEXT_ZONE = 16, LABEL_ZONE = 16
  const FILL_H = SEG_H - TEXT_ZONE - LABEL_ZONE
  const isSingle = sessions.length === 1
  const [tooltip, setTooltip] = useState<SegTooltip | null>(null)

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: W, height: H }}>
      <svg width={W} height={H} onMouseLeave={() => setTooltip(null)}>
        {BRFA_SVG_SEGS.map((p, i) => {
          const segTop = TOP_PAD + i * SEG_H
          const fillAreaTop = segTop + TEXT_ZONE
          const fillAreaBot = fillAreaTop + FILL_H
          const segMidY = segTop + SEG_H / 2

          const sessionVals = sessions.map(s => ({
            color: isSingle ? p.segColor : s.color,
            label: s.label,
            val: s.o?.items[p.key]?.value,
          }))
          const anyVal = sessionVals.some(sv => sv.val !== undefined)
          const tooltipEntries = sessionVals
            .filter(sv => sv.val !== undefined)
            .map(sv => ({ label: sv.label, value: `${sv.val!.toFixed(0)}${p.unit}`, color: sv.color }))

          return (
            <g key={p.key} onMouseEnter={() => anyVal && setTooltip({ fullLabel: p.fullLabel, entries: tooltipEntries, segMidY })}>
              <rect x={BAR_L} y={fillAreaTop} width={BAR_W} height={FILL_H} fill="#f5f5f5" />

              {isSingle && sessionVals[0].val !== undefined && (
                <text x={BAR_L + BAR_W / 2} y={segTop + 12}
                  textAnchor="middle" fontSize="9.5" fill="#1a1a1a" fontWeight="600">
                  {sessionVals[0].val.toFixed(0)}%
                </text>
              )}

              {sessionVals.map((sv, si) => sv.val !== undefined ? (
                <line key={si}
                  x1={BAR_L} y1={fillAreaBot - (sv.val / 100) * FILL_H}
                  x2={BAR_L + BAR_W} y2={fillAreaBot - (sv.val / 100) * FILL_H}
                  stroke={sv.color} strokeWidth={2.5} strokeDasharray="4,3" />
              ) : null)}

              {i < N - 1 && (
                <line x1={BAR_L} y1={segTop + SEG_H} x2={BAR_L + BAR_W} y2={segTop + SEG_H}
                  stroke="white" strokeWidth={2} />
              )}
              <text x={BAR_L + BAR_W / 2} y={segTop + SEG_H - 4}
                textAnchor="middle" fontSize="7.5" fill="#64748b">{p.short}</text>
            </g>
          )
        })}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#475569">BRFA</text>
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute', top: tooltip.segMidY - 14, left: W + 6,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '4px 8px', fontSize: 11, color: '#1e293b',
          whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 10, color: '#64748b' }}>{tooltip.fullLabel}</div>
          {tooltip.entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
              <span style={{ color: '#64748b' }}>{e.label}:</span>
              <span style={{ fontWeight: 700 }}>{e.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AMPAC segmented bar ───────────────────────────────────────────────────────

const AMPAC_SVG_SEGS = [
  { key: 'ampac_part3', short: 'P3', fullLabel: 'P3 Applied Cognitive', segColor: '#AFA9EC' },
  { key: 'ampac_part2', short: 'P2', fullLabel: 'P2 Daily Activity',    segColor: '#7F77DD' },
  { key: 'ampac_part1', short: 'P1', fullLabel: 'P1 Basic Mobility',    segColor: '#3C3489' },
] as const

function AmpacSegmentBar({ sessions }: { sessions: SessionDatum[] }) {
  const W = 72, H = 320, BAR_L = 8, BAR_W = 56
  const TOP_PAD = 10, BOT_PAD = 22
  const CHART_H = H - TOP_PAD - BOT_PAD
  const N = AMPAC_SVG_SEGS.length
  const SEG_H = CHART_H / N
  const TEXT_ZONE = 16, LABEL_ZONE = 16
  const FILL_H = SEG_H - TEXT_ZONE - LABEL_ZONE
  const isSingle = sessions.length === 1
  const [tooltip, setTooltip] = useState<SegTooltip | null>(null)

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: W, height: H }}>
      <svg width={W} height={H} onMouseLeave={() => setTooltip(null)}>
        {AMPAC_SVG_SEGS.map((p, i) => {
          const segTop = TOP_PAD + i * SEG_H
          const fillAreaTop = segTop + TEXT_ZONE
          const fillAreaBot = fillAreaTop + FILL_H
          const segMidY = segTop + SEG_H / 2

          const sessionVals = sessions.map(s => ({
            color: isSingle ? p.segColor : s.color,
            label: s.label,
            val: s.o?.items[p.key]?.value,
          }))
          const anyVal = sessionVals.some(sv => sv.val !== undefined)
          const tooltipEntries = sessionVals
            .filter(sv => sv.val !== undefined)
            .map(sv => ({ label: sv.label, value: `${sv.val!.toFixed(0)}/24`, color: sv.color }))

          return (
            <g key={p.key} onMouseEnter={() => anyVal && setTooltip({ fullLabel: p.fullLabel, entries: tooltipEntries, segMidY })}>
              <rect x={BAR_L} y={fillAreaTop} width={BAR_W} height={FILL_H} fill="#f5f5f5" />

              {isSingle && sessionVals[0].val !== undefined && (
                <text x={BAR_L + BAR_W / 2} y={segTop + 12}
                  textAnchor="middle" fontSize="9.5" fill="#1a1a1a" fontWeight="600">
                  {sessionVals[0].val.toFixed(0)}/24
                </text>
              )}

              {sessionVals.map((sv, si) => sv.val !== undefined ? (
                <line key={si}
                  x1={BAR_L} y1={fillAreaBot - (sv.val / 24) * FILL_H}
                  x2={BAR_L + BAR_W} y2={fillAreaBot - (sv.val / 24) * FILL_H}
                  stroke={sv.color} strokeWidth={2.5} strokeDasharray="4,3" />
              ) : null)}

              {i < N - 1 && (
                <line x1={BAR_L} y1={segTop + SEG_H} x2={BAR_L + BAR_W} y2={segTop + SEG_H}
                  stroke="white" strokeWidth={2} />
              )}
              <text x={BAR_L + BAR_W / 2} y={segTop + SEG_H - 4}
                textAnchor="middle" fontSize="7.5" fill="#64748b">{p.short}</text>
            </g>
          )
        })}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#475569">AMPAC</text>
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute', top: tooltip.segMidY - 14, left: W + 6,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '4px 8px', fontSize: 11, color: '#1e293b',
          whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 10, color: '#64748b' }}>{tooltip.fullLabel}</div>
          {tooltip.entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
              <span style={{ color: '#64748b' }}>{e.label}:</span>
              <span style={{ fontWeight: 700 }}>{e.value}</span>
            </div>
          ))}
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
  const [selectedSessions, setSelectedSessions] = useState<string[]>(() => filledSessions.slice())

  const bySession = useMemo(() => {
    const m: Record<string, OutcomeMeasurement> = {}
    outcomes.forEach(o => { m[o.session] = o })
    return m
  }, [outcomes])

  const sessionColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    filledSessions.forEach((s, i) => { m[s] = SESSION_PALETTE[i % SESSION_PALETTE.length] })
    return m
  }, [filledSessions])

  const hasBrfa  = useMemo(() => outcomes.some(o => BRFA_PARTS.some(p => o.items[p.key]?.value !== undefined)), [outcomes])
  const hasAmpac = useMemo(() => outcomes.some(o => AMPAC_PARTS.some(p => o.items[p.key]?.value !== undefined)), [outcomes])
  const presentOthers = useMemo(() => OTHER_DEFS.filter(d => outcomes.some(o => o.items[d.key]?.value !== undefined)), [outcomes])

  const isSingle = selectedSessions.length === 1

  const selectedSessionData: SessionDatum[] = useMemo(() =>
    selectedSessions.map(s => ({
      session: s,
      label: SESSION_SHORT[s] ?? s,
      color: sessionColorMap[s] ?? '#94a3b8',
      o: bySession[s],
    }))
  , [selectedSessions, sessionColorMap, bySession])

  const { chartLabels, chartDatasets, topLabels } = useMemo(() => {
    if (!isSingle) {
      const colLabels: string[] = []
      presentOthers.forEach(d => colLabels.push(d.label))

      const datasets: ChartData<'bar'>['datasets'] = selectedSessions.map(sess => {
        const o = bySession[sess]
        const color = sessionColorMap[sess] ?? '#94a3b8'
        const data: (number | null)[] = []
        const rawVals: (number | null)[] = []
        const units: string[] = []
        presentOthers.forEach(d => {
          const r = o?.items[d.key]?.value
          data.push(r !== undefined ? normPct(r, d.maxRef, d.inverted) : null)
          rawVals.push(r !== undefined ? r : null); units.push(d.unit)
        })
        return {
          label: SESSION_SHORT[sess] ?? sess,
          data,
          backgroundColor: color,
          barPercentage: 0.8,
          categoryPercentage: 0.85,
          _rawVals: rawVals,
          _units: units,
        } as unknown as ChartData<'bar'>['datasets'][number]
      })

      return { chartLabels: colLabels, chartDatasets: datasets, topLabels: [] as string[] }
    }

    // Single session
    const sess = selectedSessions[0]
    const o = bySession[sess]
    type Col = { id: string; label: string }
    const cols: Col[] = []
    OTHER_DEFS.forEach(d => {
      if (o?.items[d.key]?.value !== undefined) cols.push({ id: d.key, label: d.label })
    })
    const n = cols.length

    const tl: string[] = cols.map(col => {
      if (!o) return ''
      const val = o.items[col.id]?.value
      if (val === undefined) return ''
      const def = OTHER_DEFS.find(d => d.key === col.id)
      const unit = def?.unit ?? ''
      return unit.startsWith('/') ? `${val}${unit}` : `${val} ${unit}`
    })

    const datasets: ChartData<'bar'>['datasets'] = []
    OTHER_DEFS.forEach(d => {
      const ci = cols.findIndex(c => c.id === d.key)
      if (ci < 0) return
      const raw = o?.items[d.key]?.value
      if (raw === undefined) return
      const data: (number | null)[] = Array(n).fill(null)
      data[ci] = normPct(raw, d.maxRef, d.inverted)
      datasets.push({ label: d.label, data, backgroundColor: d.color, stack: d.key, barPercentage: 0.95, categoryPercentage: 0.85, _rawVal: raw, _unit: d.unit } as unknown as ChartData<'bar'>['datasets'][number])
    })

    return { chartLabels: cols.map(c => c.label), chartDatasets: datasets, topLabels: tl }
  }, [selectedSessions, isSingle, bySession, hasBrfa, hasAmpac, presentOthers, sessionColorMap])

  const los = useMemo(() => {
    if (selectedSessions.length < 2) return null
    const dates = selectedSessions
      .map(s => bySession[s]?.assessmentDate)
      .filter((d): d is string => !!d)
      .map(d => new Date(d).getTime())
    if (dates.length < 2) return null
    return Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000)
  }, [selectedSessions, bySession])

  const options = useMemo((): ChartOptions<'bar'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const ds = ctx.dataset as unknown as Record<string, unknown>
            if (!isSingle) {
              const rawVals = ds._rawVals as (number | null)[] | undefined
              const units = ds._units as string[] | undefined
              const raw = rawVals?.[ctx.dataIndex]
              const unit = units?.[ctx.dataIndex]
              if (raw !== null && raw !== undefined && unit && unit !== '%') {
                return ` ${ctx.dataset.label}: ${raw} ${unit}`
              }
              const pct = typeof ctx.raw === 'number' ? ctx.raw.toFixed(1) : '–'
              return ` ${ctx.dataset.label}: ${pct}%`
            }
            const raw = ds._rawVal as number | undefined
            const unit = ds._unit as string | undefined
            if (raw !== undefined && unit !== undefined) {
              return ` ${ctx.dataset.label}: ${raw} ${unit}`
            }
            const pct = typeof ctx.raw === 'number' ? ctx.raw.toFixed(1) : '–'
            return ` ${ctx.dataset.label}: ${pct}%`
          },
        },
      },
      barTopLabel: { topLabels },
    } as ChartOptions<'bar'>['plugins'],
    scales: {
      x: {
        stacked: isSingle,
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10 }, color: '#475569' },
      },
      y: {
        stacked: isSingle,
        display: false,
        beginAtZero: true,
        max: 100,
      },
    },
  }), [isSingle, topLabels])

  if (filledSessions.length === 0) return null

  // Derived display values (non-hooks)
  const toggleSession = (s: string) => {
    setSelectedSessions(prev => {
      if (prev.includes(s)) {
        if (prev.length <= 1) return prev
        return prev.filter(x => x !== s)
      }
      return filledSessions.filter(fs => prev.includes(fs) || fs === s)
    })
  }

  const showBrfaSvg  = selectedSessionData.some(sd => BRFA_PARTS.some(p => sd.o?.items[p.key]?.value !== undefined))
  const showAmpacSvg = selectedSessionData.some(sd => AMPAC_PARTS.some(p => sd.o?.items[p.key]?.value !== undefined))

  const legendItems = isSingle
    ? presentOthers
        .filter(d => bySession[selectedSessions[0]]?.items[d.key]?.value !== undefined)
        .map(d => ({ key: d.key, label: d.label, color: d.color }))
    : selectedSessions.map(s => ({
        key: s,
        label: SESSION_SHORT[s] ?? s,
        color: sessionColorMap[s] ?? '#94a3b8',
      }))

  return (
    <div className="mt-5 space-y-4">
      {/* Header + checkbox row */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-slate-700 pt-0.5">Outcome Summary</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {filledSessions.map(s => {
            const checked = selectedSessions.includes(s)
            const isLast = checked && selectedSessions.length === 1
            return (
              <label
                key={s}
                className={`flex items-center gap-1.5 select-none ${isLast ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isLast}
                  onChange={() => toggleSession(s)}
                  className="w-3.5 h-3.5 rounded accent-blue-500 shrink-0"
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: checked ? (sessionColorMap[s] ?? '#475569') : '#94a3b8' }}
                >
                  {SESSION_SHORT[s] ?? s}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* LOS badge */}
      {los !== null && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            LOS: {los} day{los !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Chart card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        {/* Legend */}
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

        <div className="flex items-stretch gap-1" style={{ height: 320 }}>
          {showBrfaSvg  && <BrfaSegmentBar  sessions={selectedSessionData} />}
          {showAmpacSvg && <AmpacSegmentBar sessions={selectedSessionData} />}
          {chartDatasets.length > 0 && (
            <div className="flex-1 min-w-0">
              <Bar
                key={selectedSessions.join(',')}
                data={{ labels: chartLabels, datasets: chartDatasets }}
                options={options}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
