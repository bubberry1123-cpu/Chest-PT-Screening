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

// ── Metric definitions ─────────────────────────────────────────────────────────

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
  { key: 'dyspneaScale',      label: 'Dyspnea',    unit: '/10',   color: '#E85D04', maxRef: 10,  inverted: true },
  { key: 'peakCoughFlow',     label: 'Cough Flow', unit: 'L/min', color: '#378ADD', maxRef: 600 },
  { key: 'wrightSpirometer',  label: 'Wright',     unit: 'mL',    color: '#0F6E56', maxRef: 600 },
  { key: 'gripStrength_left', label: 'Grip L',     unit: 'kg',    color: '#BA7517', maxRef: 60  },
  { key: 'gripStrength_right',label: 'Grip R',     unit: 'kg',    color: '#EF9F27', maxRef: 60  },
  { key: 'cs30',              label: 'CS-30',      unit: 'ครั้ง', color: '#639922', maxRef: 30  },
  { key: 'sixMWT',            label: '6MWT',       unit: 'm',     color: '#C77DFF', maxRef: 500 },
  { key: 'twoMinMarching',    label: '2-min March',unit: 'ครั้ง', color: '#E63946', maxRef: 120 },
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

// ── Component ─────────────────────────────────────────────────────────────────

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

  // Which groups have any data at all
  const hasBrfa  = outcomes.some(o => BRFA_PARTS.some(p => o.items[p.key]?.value !== undefined))
  const hasAmpac = outcomes.some(o => AMPAC_PARTS.some(p => o.items[p.key]?.value !== undefined))
  const presentOthers = OTHER_DEFS.filter(d => outcomes.some(o => o.items[d.key]?.value !== undefined))

  // ── Chart data ─────────────────────────────────────────────────────────────

  const { chartLabels, chartDatasets, topLabels } = useMemo(() => {
    if (compareMode) {
      // X = metric names, datasets = sessions
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

    // Single session mode — build cols from THIS session only (not across all sessions)
    const o = bySession[selectedSession]

    type Col = { id: string; label: string }
    const cols: Col[] = []
    if (BRFA_PARTS.some(p  => o?.items[p.key]?.value !== undefined)) cols.push({ id: 'brfa',  label: 'BRFA'  })
    if (AMPAC_PARTS.some(p => o?.items[p.key]?.value !== undefined)) cols.push({ id: 'ampac', label: 'AMPAC' })
    OTHER_DEFS.forEach(d => {
      if (o?.items[d.key]?.value !== undefined) cols.push({ id: d.key, label: d.label })
    })
    const n = cols.length

    // Top labels — only "others" get a top label; BRFA and AMPAC are silent
    const tl: string[] = cols.map(col => {
      if (!o || col.id === 'brfa' || col.id === 'ampac') return ''
      return `${o.items[col.id]?.value ?? ''}`
    })

    // Datasets
    const datasets: ChartData<'bar'>['datasets'] = []

    {
      const ci = cols.findIndex(c => c.id === 'brfa')
      if (ci >= 0) {
        BRFA_PARTS.forEach(p => {
          const raw = o?.items[p.key]?.value
          if (raw === undefined) return
          const data: (number | null)[] = Array(n).fill(null)
          data[ci] = raw  // already %
          datasets.push({ label: p.label, data, backgroundColor: p.color, stack: 'brfa', barPercentage: 0.95, categoryPercentage: 0.85 })
        })
      }
    }

    {
      const ci = cols.findIndex(c => c.id === 'ampac')
      if (ci >= 0) {
        AMPAC_PARTS.forEach(p => {
          const raw = o?.items[p.key]?.value
          if (raw === undefined) return
          const data: (number | null)[] = Array(n).fill(null)
          data[ci] = normPct(raw, 24)
          const ds = { label: p.label, data, backgroundColor: p.color, stack: 'ampac', barPercentage: 0.95, categoryPercentage: 0.85 }
          ;(ds as Record<string, unknown>)._rawVal = raw
          datasets.push(ds)
        })
      }
    }

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
            const rawVal = (ctx.dataset as unknown as Record<string, unknown>)._rawVal
            if (typeof rawVal === 'number') {
              return ` ${ctx.dataset.label}: ${rawVal}/24`
            }
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

  // ── Outcome cards ──────────────────────────────────────────────────────────

  const latestO  = bySession[filledSessions[filledSessions.length - 1]]
  const initialO = bySession['Initial']

  interface CardInfo { key: string; label: string; rawVal: number; unit: string; pct: number; initPct?: number }
  const cards: CardInfo[] = []
  if (latestO) {
    BRFA_PARTS.forEach(p => {
      const raw = latestO.items[p.key]?.value
      if (raw === undefined) return
      const iv = initialO?.items[p.key]?.value
      cards.push({ key: p.key, label: p.label, rawVal: raw, unit: '%', pct: raw, initPct: iv })
    })
    AMPAC_PARTS.forEach(p => {
      const raw = latestO.items[p.key]?.value
      if (raw === undefined) return
      const pct = normPct(raw, 24)
      const iv = initialO?.items[p.key]?.value
      cards.push({ key: p.key, label: p.label, rawVal: raw, unit: '/24', pct, initPct: iv !== undefined ? normPct(iv, 24) : undefined })
    })
    OTHER_DEFS.forEach(d => {
      const raw = latestO.items[d.key]?.value
      if (raw === undefined) return
      const pct = normPct(raw, d.maxRef, d.inverted)
      const iv = initialO?.items[d.key]?.value
      cards.push({ key: d.key, label: d.label, rawVal: raw, unit: d.unit, pct, initPct: iv !== undefined ? normPct(iv, d.maxRef, d.inverted) : undefined })
    })
  }

  // ── Legend items ───────────────────────────────────────────────────────────

  interface LegendItem { key: string; label: string; color: string }
  const legendItems: LegendItem[] = compareMode
    ? filledSessions.map((s, i) => ({ key: s, label: SESSION_SHORT[s] ?? s, color: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }))
    : [
        ...(hasBrfa  ? BRFA_PARTS.filter(p => latestO?.items[p.key]?.value !== undefined) : []),
        ...(hasAmpac ? AMPAC_PARTS.filter(p => latestO?.items[p.key]?.value !== undefined) : []),
        ...presentOthers.filter(d => latestO?.items[d.key]?.value !== undefined),
      ]

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
        {/* Custom HTML legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3 pb-3 border-b border-slate-100">
          {legendItems.map(item => (
            <div key={item.key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: item.color }} />
              <span className="text-[11px] text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 280 }}>
          <Bar
            key={compareMode ? 'compare' : selectedSession}
            data={{ labels: chartLabels, datasets: chartDatasets }}
            options={options}
          />
        </div>
      </div>

      {/* Outcome detail cards */}
      {cards.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            รายละเอียด — {filledSessions[filledSessions.length - 1]}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {cards.map(card => {
              const pass = card.pct >= 60
              const delta = card.initPct !== undefined ? card.pct - card.initPct : null
              return (
                <div key={card.key} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-xs font-semibold text-slate-600 truncate">{card.label}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {pass ? 'Pass' : 'Low'}
                    </span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-xl font-bold text-slate-800 leading-none">
                      {card.pct.toFixed(0)}<span className="text-xs font-normal text-slate-400">%</span>
                    </span>
                    {delta !== null && (
                      <span className={`text-xs font-semibold mb-0.5 ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{card.rawVal} {card.unit}</div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${pass ? 'bg-green-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, card.pct)}%` }} />
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
