'use client'
import { useState } from 'react'
import type { OutcomeMeasurement } from '@/types'
import { ERAS_PHASES, ERAS_PHASE_SHORT, ERAS_OUTCOME_GROUPS, peakCoughFlowInterpretation } from '@/lib/outcomeItems'

const ERAS_COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706']

interface TooltipState {
  mouseX: number
  mouseY: number
  phaseLabel: string
  dateStr: string | null
  val: number
  unit: string
  color: string
}

function ErasLineChart({
  data,
  unit,
  color,
  lowerIsBetter,
  itemKey,
}: {
  data: { phase: string; value: number | null; date?: string }[]
  unit: string
  color: string
  lowerIsBetter?: boolean
  itemKey?: string
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const filled = data.filter(d => d.value !== null)
  if (filled.length === 0) return null

  const W = 420, H = 130, PL = 44, PR = 12, PT = 16, PB = 28
  const chartW = W - PL - PR
  const chartH = H - PT - PB
  const n = data.length

  const vals = data.map(d => d.value).filter((v): v is number => v !== null)
  let yMin = Math.min(...vals)
  let yMax = Math.max(...vals)
  if (yMin === yMax) { yMin = Math.max(0, yMin - 1); yMax = yMax + 1 }
  const yRange = yMax - yMin
  const toY = (v: number) => PT + (1 - (v - yMin) / yRange) * chartH

  const pts = data.map((d, i) => ({
    x: PL + (n > 1 ? i / (n - 1) : 0.5) * chartW,
    y: d.value !== null ? toY(d.value) : null,
    val: d.value,
    phase: d.phase,
    date: d.date,
  }))

  const segments: { x: number; y: number }[][] = []
  let cur: { x: number; y: number }[] = []
  for (const p of pts) {
    if (p.y !== null) cur.push({ x: p.x, y: p.y })
    else if (cur.length) { segments.push(cur); cur = [] }
  }
  if (cur.length) segments.push(cur)

  const ticks = [yMin, (yMin + yMax) / 2, yMax]
  const hoverX = hoverIdx !== null ? pts[hoverIdx].x : null

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const idx = pts.reduce((b, p, i) => Math.abs(p.x - svgX) < Math.abs(pts[b].x - svgX) ? i : b, 0)
    const p = pts[idx]
    if (p.val === null) { setTooltip(null); setHoverIdx(null); return }
    setHoverIdx(idx)
    setTooltip({
      mouseX: e.clientX, mouseY: e.clientY,
      phaseLabel: ERAS_PHASE_SHORT[p.phase] ?? p.phase,
      dateStr: p.date ? new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null,
      val: p.val,
      unit,
      color,
    })
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ height: 130 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setTooltip(null); setHoverIdx(null) }}>
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

        {/* Area fill */}
        {segments.map((seg, si) => {
          if (seg.length < 2) return null
          const area = `M ${seg[0].x},${PT + chartH} ${seg.map(p => `L ${p.x},${p.y}`).join(' ')} L ${seg[seg.length - 1].x},${PT + chartH} Z`
          return <path key={si} d={area} fill={color + '18'} />
        })}

        {/* Hover highlight */}
        {hoverX !== null && (
          <line x1={hoverX} y1={PT} x2={hoverX} y2={PT + chartH}
            stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,2" />
        )}

        {/* Lines */}
        {segments.map((seg, si) =>
          seg.length > 1 ? (
            <polyline key={si}
              points={seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none" stroke={color} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          ) : null
        )}

        {/* Points */}
        {pts.filter(p => p.y !== null).map((p, i) => (
          <circle key={i}
            cx={p.x.toFixed(1)} cy={p.y!.toFixed(1)}
            r="4" fill={color} stroke="white" strokeWidth="2" />
        ))}

        {/* X labels */}
        {data.map((d, i) => {
          const x = pts[i].x
          const hasData = d.value !== null
          return (
            <text key={i} x={x.toFixed(1)} y={H - 2} fontSize="9"
              fill={hasData ? '#64748b' : '#cbd5e1'} textAnchor="middle">
              {ERAS_PHASE_SHORT[d.phase] ?? d.phase}
            </text>
          )
        })}

        {lowerIsBetter && (
          <text x={W - PR} y={PT - 4} fontSize="8" fill="#94a3b8" textAnchor="end">↓ lower = better</text>
        )}
      </svg>

      {tooltip && (
        <div
          className="fixed z-[300] bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2.5 text-xs pointer-events-none"
          style={{
            left: Math.min(tooltip.mouseX + 16, (typeof window !== 'undefined' ? window.innerWidth : 800) - 200),
            top: Math.max(tooltip.mouseY - 60, 8),
          }}>
          <p className="font-semibold text-slate-600 mb-1">
            {tooltip.phaseLabel}
            {tooltip.dateStr && <span className="font-normal text-slate-400 ml-1.5">· {tooltip.dateStr}</span>}
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tooltip.color }} />
            <span className="font-bold text-slate-800">{tooltip.val}{tooltip.unit ? ` ${tooltip.unit}` : ''}</span>
          </div>
          {itemKey === 'peakCoughFlow' && (
            <div className="mt-0.5 text-[10px] leading-snug" style={{ color: '#0C447C' }}>
              → {peakCoughFlowInterpretation(tooltip.val)}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default function ErasOutcomeCharts({ outcomes }: { outcomes: OutcomeMeasurement[] }) {
  const byPhase: Record<string, OutcomeMeasurement> = {}
  outcomes.forEach(o => { byPhase[o.session] = o })

  const flatItems = ERAS_OUTCOME_GROUPS.flatMap(g => g.items)

  const chartData = flatItems.map((item, idx) => ({
    item,
    color: ERAS_COLORS[idx % ERAS_COLORS.length],
    data: ERAS_PHASES.map(phase => ({
      phase,
      value: byPhase[phase]?.items[item.key]?.value ?? null,
      date: byPhase[phase]?.assessmentDate,
    })),
  })).filter(c => c.data.some(d => d.value !== null))

  if (chartData.length === 0) return null

  return (
    <div className="mt-5">
      <h3 className="font-semibold text-slate-700 mb-3">ERAS Outcome Trends</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {chartData.map(({ item, color, data }) => (
          <div key={item.key} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">{item.label}</span>
              <span className="text-xs text-slate-400">{item.unit}</span>
            </div>
            <ErasLineChart data={data} unit={item.unit} color={color} lowerIsBetter={item.lowerIsBetter} itemKey={item.key} />
          </div>
        ))}
      </div>
    </div>
  )
}
