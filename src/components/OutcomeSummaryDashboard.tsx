'use client'
import { useMemo, useState } from 'react'
import type { OutcomeMeasurement, OverallLevel, OutcomeSession } from '@/types'
import { OUTCOME_SESSIONS, SESSION_SHORT, GRIP_KEYS, gripFirstLast, gripInterpretationSingle, type GripInterp } from '@/lib/outcomeItems'

// ── Session gradient palette: Initial (idx 0) = lightest, Discharge (idx 11) = darkest
const SHADE_FILLS = [
  '#EFF6FF', '#DBEAFE', '#BFDBFE', '#93C5FD',
  '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8',
  '#1E40AF', '#1E3A8A', '#172554', '#0F172A',
]
const SHADE_STROKES = [
  '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6',
  '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A',
  '#172554', '#0F172A', '#060A13', '#2D3748',
]

function getShade(session: string, overrideIdx?: number): { fill: string; stroke: string } {
  const i = overrideIdx !== undefined ? overrideIdx : (OUTCOME_SESSIONS as readonly string[]).indexOf(session)
  return {
    fill:   SHADE_FILLS[i  >= 0 ? i : 0] ?? '#93C5FD',
    stroke: SHADE_STROKES[i >= 0 ? i : 0] ?? '#3B82F6',
  }
}

function fmtVal(val: number, unit: string): string {
  const n = val % 1 === 0 ? String(val) : val.toFixed(1)
  return unit.startsWith('/') ? `${n}${unit}` : `${n} ${unit}`
}

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

export interface OtherDef {
  key: string; label: string; unit: string
  color: string; maxRef: number
}
const OTHER_DEFS: OtherDef[] = [
  { key: 'dyspneaScale',       label: 'mMRC',       unit: '/4',     color: '#E85D04', maxRef: 4   },
  { key: 'peakCoughFlow',      label: 'Cough Flow', unit: 'L/min',  color: '#378ADD', maxRef: 600 },
  { key: 'wrightSpirometer',   label: 'Wright',     unit: 'mL',     color: '#0F6E56', maxRef: 600 },
  { key: 'gripStrength_left',  label: 'Grip L',     unit: 'kg',     color: '#BA7517', maxRef: 60  },
  { key: 'gripStrength_right', label: 'Grip R',     unit: 'kg',     color: '#EF9F27', maxRef: 60  },
  { key: 'cs30',               label: 'CS-30',      unit: 'ครั้ง',  color: '#639922', maxRef: 30  },
  { key: 'twoMeterWalk',       label: '2MWT',       unit: 'meters', color: '#0891B2', maxRef: 500 },
  { key: 'sixMWT',             label: '6MWT',       unit: 'm',      color: '#C77DFF', maxRef: 600 },
  { key: 'twoMinMarching',     label: '2MST',       unit: 'steps',  color: '#E63946', maxRef: 120 },
]

const SESSION_PALETTE = [
  '#3b82f6','#10b981','#f97316','#8b5cf6','#ec4899',
  '#06b6d4','#84cc16','#f59e0b','#ef4444','#64748b','#14b8a6','#6366f1',
]

function getFilledSessions(outcomes: OutcomeMeasurement[]): string[] {
  const set = new Set(outcomes.map(o => o.session))
  return OUTCOME_SESSIONS.filter(s => set.has(s))
}

// ── Session datum ─────────────────────────────────────────────────────────────

export interface SessionDatum {
  session: string
  label: string
  color: string
  shadeIdx?: number
  o: OutcomeMeasurement | undefined
}

// ── BRFA segmented bar ────────────────────────────────────────────────────────

const BRFA_SVG_SEGS = [
  { key: 'brfa_q21',   short: 'Q21', fullLabel: 'Q21 Satisfaction',  segColor: '#9FE1CB', maxVal: 100, unit: '%' },
  { key: 'brfa_q20',   short: 'Q20', fullLabel: 'Q20 Environment',   segColor: '#5DCAA5', maxVal: 100, unit: '%' },
  { key: 'brfa_part2', short: 'P2',  fullLabel: 'Part 2 Confidence', segColor: '#1D9E75', maxVal: 100, unit: '%' },
  { key: 'brfa_part1', short: 'P1',  fullLabel: 'Part 1 Functional', segColor: '#085041', maxVal: 100, unit: '%' },
] as const

// Clinical interpretation of a BRFA segment score (%) — shown in the segment tooltip.
function brfaInterpretation(key: string, val: number): string {
  switch (key) {
    case 'brfa_part1': // Part 1 Functional (ข้อ 1–15)
      if (val <= 33.30) return 'ต้องการความช่วยเหลืออย่างใกล้ชิด'
      if (val <= 66.70) return 'ต้องการความช่วยเหลือบางกิจกรรม'
      return 'สามารถทำกิจกรรมได้ด้วยตนเอง'
    case 'brfa_part2': // Part 2 Confidence (ข้อ 16–19)
      if (val <= 33.30) return 'ความมั่นใจต่ำ ควรได้รับแรงเสริม'
      if (val <= 66.70) return 'ความมั่นใจปานกลาง ควรประเมิน Work Hardening'
      return 'มีความพร้อมและมั่นใจสูง ควรแนะนำหลักการยศาสตร์ (Ergonomics) เพื่อป้องกันการบาดเจ็บซ้ำ'
    case 'brfa_q20': // Q20 Environment
      if (val <= 50) return 'ที่พักไม่เหมาะสม ควรปรับเปลี่ยน'
      return 'ที่พักเหมาะสม ควรประเมิน Safety in House'
    case 'brfa_q21': // Q21 Satisfaction
      if (val <= 50) return 'ความพึงพอใจต่อสุขภาพแย่ ควรให้กำลังใจ'
      return 'ความพึงพอใจดีมาก ควรสนับสนุนต่อเนื่อง'
    default:
      return ''
  }
}

type SegTooltip = {
  fullLabel: string
  entries: { label: string; value: string; color: string; interpretation?: string }[]
  segMidY: number
}

export function BrfaSegmentBar({ sessions }: { sessions: SessionDatum[] }) {
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
            .map(sv => ({
              label: sv.label,
              value: `${sv.val!.toFixed(0)}${p.unit}`,
              color: sv.color,
              interpretation: brfaInterpretation(p.key, sv.val!),
            }))

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
          padding: '6px 9px', fontSize: 11, color: '#1e293b',
          width: tooltip.entries.some(e => e.interpretation) ? 210 : undefined,
          whiteSpace: tooltip.entries.some(e => e.interpretation) ? 'normal' : 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 10, color: '#64748b' }}>{tooltip.fullLabel}</div>
          {tooltip.entries.map((e, i) => (
            <div key={i} style={{ marginTop: i > 0 ? 5 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                <span style={{ color: '#64748b' }}>{e.label}:</span>
                <span style={{ fontWeight: 700 }}>{e.value}</span>
              </div>
              {e.interpretation && (
                <div style={{ marginLeft: 13, marginTop: 1, fontSize: 10, lineHeight: 1.35, color: '#0C447C' }}>
                  → {e.interpretation}
                </div>
              )}
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

export function AmpacSegmentBar({ sessions }: { sessions: SessionDatum[] }) {
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
          padding: '6px 9px', fontSize: 11, color: '#1e293b',
          width: tooltip.entries.some(e => e.interpretation) ? 210 : undefined,
          whiteSpace: tooltip.entries.some(e => e.interpretation) ? 'normal' : 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 10, color: '#64748b' }}>{tooltip.fullLabel}</div>
          {tooltip.entries.map((e, i) => (
            <div key={i} style={{ marginTop: i > 0 ? 5 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                <span style={{ color: '#64748b' }}>{e.label}:</span>
                <span style={{ fontWeight: 700 }}>{e.value}</span>
              </div>
              {e.interpretation && (
                <div style={{ marginLeft: 13, marginTop: 1, fontSize: 10, lineHeight: 1.35, color: '#0C447C' }}>
                  → {e.interpretation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Custom SVG bar chart ──────────────────────────────────────────────────────

const MAX_H = 200
const MIN_H = 8
const VAL_PAD = 84  // keeps total height = 320 to align with BRFA/AMPAC
const LBL_PAD = 36
const SIDE_PAD = 8
const GAP_WITHIN = 2
const GAP_BETWEEN = 14

// Pre-hab bar color for the appended ERAS InBody groups.
const INBODY_COLOR = '#378ADD'
// Wider slot per InBody group so the (multi-line) x-axis labels don't overlap.
const INBODY_SLOT_W = 58
// Short, wrap-friendly x-axis labels for the InBody groups (name lines only; unit shown below).
const INBODY_LABELS: Record<string, string[]> = {
  inbody_bmi:            ['BMI'],
  inbody_skeletalMuscle: ['Skeletal', 'Muscle'],
  inbody_bodyFatPct:     ['Body Fat'],
}

// Grip L / Grip R tooltip — same box/style as the BRFA/AMPAC SegTooltip, but
// mouse-anchored (fixed) since this chart lives inside an overflow-x container.
type GripTip = {
  x: number; y: number
  title: string
  entries: { label: string; value: string; color: string }[]
  interp: GripInterp | null
}

export function CustomBarChart({ defs, sessions, inbodyDefs, gripInterp }: {
  defs: OtherDef[]
  sessions: SessionDatum[]
  // ERAS only: InBody measures appended after the normal groups. Each renders a
  // single Pre-hab bar (#378ADD); the group is dropped when Pre-hab isn't shown.
  inbodyDefs?: OtherDef[]
  // Grip L / Grip R clinical interpretation line, keyed by grip item key.
  // Only groups present here become hoverable; all other bars stay non-interactive.
  gripInterp?: Record<string, GripInterp | null>
}) {
  const [gripTip, setGripTip] = useState<GripTip | null>(null)
  const N = sessions.length
  const BAR_W = Math.min(40, Math.max(14, Math.floor(64 / N)))
  const groupW = N * BAR_W + Math.max(0, N - 1) * GAP_WITHIN

  const showGripTip = (e: React.MouseEvent, def: OtherDef) => {
    const entries = sessions
      .filter(sd => sd.o?.items[def.key]?.value !== undefined)
      .map(sd => ({
        label: sd.label,
        value: fmtVal(sd.o!.items[def.key]!.value, def.unit),
        color: getShade(sd.session, sd.shadeIdx).stroke,
      }))
    setGripTip({
      x: Math.min(e.clientX + 14, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 240),
      y: Math.max(e.clientY - 12, 8),
      title: def.label,
      entries,
      interp: gripInterp?.[def.key] ?? null,
    })
  }

  // InBody: Prehabilitation session only, and only defs that actually have a value.
  const prehab = sessions.find(s => s.session === 'Prehabilitation')
  const presentInbody = (inbodyDefs ?? []).filter(d => prehab?.o?.items[d.key]?.value !== undefined)
  const inbodyBase = SIDE_PAD + defs.length * (groupW + GAP_BETWEEN)

  const totalGroups = defs.length + presentInbody.length
  const svgW = SIDE_PAD * 2
    + defs.length * groupW
    + presentInbody.length * INBODY_SLOT_W
    + Math.max(0, totalGroups - 1) * GAP_BETWEEN
  const svgH = VAL_PAD + MAX_H + LBL_PAD

  return (
    <div style={{ overflowX: 'auto', flex: 1, minWidth: 0 }}>
      <svg width={Math.max(svgW, 100)} height={svgH} style={{ display: 'block' }}>
        {defs.map((def, gi) => {
          const groupX = SIDE_PAD + gi * (groupW + GAP_BETWEEN)
          const groupCenterX = groupX + groupW / 2

          return (
            <g key={def.key}>
              {sessions.map((sd) => {
                const val = sd.o?.items[def.key]?.value
                if (val === undefined) return null

                const si = sessions.indexOf(sd)
                const barH = Math.max(MIN_H, (val / def.maxRef) * MAX_H)
                const barX = groupX + si * (BAR_W + GAP_WITHIN)
                const barY = VAL_PAD + MAX_H - barH
                const { fill, stroke } = getShade(sd.session, sd.shadeIdx)

                return (
                  <g key={sd.session}>
                    <rect
                      x={barX} y={barY}
                      width={BAR_W} height={barH}
                      fill={fill} stroke={stroke} strokeWidth={1}
                      rx={2}
                    />
                    <text
                      transform={`translate(${barX + BAR_W / 2},${barY - 4}) rotate(-90)`}
                      textAnchor="start"
                      fontSize="8.5"
                      fill="#334155"
                      fontWeight="600"
                    >
                      {fmtVal(val, def.unit)}
                    </text>
                  </g>
                )
              })}

              <text
                x={groupCenterX} y={VAL_PAD + MAX_H + 16}
                textAnchor="middle" fontSize="10"
                fill="#475569" fontWeight="600"
              >
                {def.label}
              </text>
              <text
                x={groupCenterX} y={VAL_PAD + MAX_H + 28}
                textAnchor="middle" fontSize="8.5"
                fill="#94a3b8"
              >
                {def.unit}
              </text>

              {/* Grip L / Grip R only: transparent overlay to catch hover (on top). */}
              {gripInterp?.[def.key] !== undefined && (
                <rect
                  x={groupX} y={0} width={groupW} height={VAL_PAD + MAX_H}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseEnter={e => showGripTip(e, def)}
                  onMouseMove={e => showGripTip(e, def)}
                  onMouseLeave={() => setGripTip(null)}
                />
              )}
            </g>
          )
        })}

        {/* ERAS InBody — appended after 2-Meter, single Pre-hab bar each (#378ADD).
            Rendered in a wider slot with a centered bar + multi-line label so the
            BMI / Skeletal Muscle / Body Fat labels never overlap. */}
        {presentInbody.map((def, ii) => {
          const val = prehab!.o!.items[def.key]!.value
          const slotX = inbodyBase + ii * (INBODY_SLOT_W + GAP_BETWEEN)
          const groupCenterX = slotX + INBODY_SLOT_W / 2
          const barX = slotX + (INBODY_SLOT_W - BAR_W) / 2
          const barH = Math.max(MIN_H, (val / def.maxRef) * MAX_H)
          const barY = VAL_PAD + MAX_H - barH
          const nameLines = INBODY_LABELS[def.key] ?? [def.label]

          return (
            <g key={def.key}>
              <rect
                x={barX} y={barY}
                width={BAR_W} height={barH}
                fill={INBODY_COLOR} stroke={INBODY_COLOR} strokeWidth={1}
                rx={2}
              />
              <text
                transform={`translate(${barX + BAR_W / 2},${barY - 4}) rotate(-90)`}
                textAnchor="start" fontSize="8.5" fill={INBODY_COLOR} fontWeight="600"
              >
                {fmtVal(val, def.unit)}
              </text>
              {nameLines.map((ln, li) => (
                <text
                  key={li}
                  x={groupCenterX} y={VAL_PAD + MAX_H + 13 + li * 10}
                  textAnchor="middle" fontSize="9" fill="#475569" fontWeight="600"
                >
                  {ln}
                </text>
              ))}
              <text
                x={groupCenterX} y={VAL_PAD + MAX_H + 13 + nameLines.length * 10}
                textAnchor="middle" fontSize="8" fill="#94a3b8"
              >
                {def.unit}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Grip L / Grip R tooltip — same box + "→" line style as the BRFA/AMPAC tooltip */}
      {gripTip && (
        <div style={{
          position: 'fixed', top: gripTip.y, left: gripTip.x,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '6px 9px', fontSize: 11, color: '#1e293b',
          width: 220, whiteSpace: 'normal',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 300, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 10, color: '#64748b' }}>{gripTip.title}</div>
          {gripTip.entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: i > 0 ? 3 : 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
              <span style={{ color: '#64748b' }}>{e.label}:</span>
              <span style={{ fontWeight: 700 }}>{e.value}</span>
            </div>
          ))}
          {gripTip.interp && (
            <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.35, color: gripTip.interp.color }}>
              → {gripTip.interp.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared chart core (used by admin section too) ─────────────────────────────

export function OutcomeSummaryChartCore({
  sessions,
  otherDefs,
  inbodyDefs,
  gripInterp,
}: {
  sessions: SessionDatum[]
  otherDefs: OtherDef[]
  inbodyDefs?: OtherDef[]
  gripInterp?: Record<string, GripInterp | null>
}) {
  const showBrfa  = sessions.some(sd => BRFA_PARTS.some(p => sd.o?.items[p.key]?.value !== undefined))
  const showAmpac = sessions.some(sd => AMPAC_PARTS.some(p => sd.o?.items[p.key]?.value !== undefined))
  const presentOthers = otherDefs.filter(d => sessions.some(sd => sd.o?.items[d.key]?.value !== undefined))
  const showOther = presentOthers.length > 0

  // InBody (ERAS) — Prehabilitation session only.
  const prehab = sessions.find(s => s.session === 'Prehabilitation')
  const showInbody = (inbodyDefs ?? []).some(d => prehab?.o?.items[d.key]?.value !== undefined)

  if (!showBrfa && !showAmpac && !showOther && !showInbody)
    return <div className="text-center py-8 text-slate-400 text-sm">No data for selected sessions</div>

  const legendItems = sessions.map(sd => {
    const { stroke } = getShade(sd.session, sd.shadeIdx)
    return { key: sd.session, label: sd.label, color: stroke }
  })

  return (
    <div>
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
      <div className="flex items-end gap-1">
        {showBrfa  && <BrfaSegmentBar  sessions={sessions} />}
        {showAmpac && <AmpacSegmentBar sessions={sessions} />}
        {(showOther || showInbody) && (
          <CustomBarChart defs={presentOthers} sessions={sessions} inbodyDefs={inbodyDefs} gripInterp={gripInterp} />
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OutcomeSummaryDashboard({
  outcomes,
  level: _level,
  nationality,
  sex,
}: {
  outcomes: OutcomeMeasurement[]
  level: OverallLevel
  nationality?: string
  sex?: string
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

  const presentOthers = useMemo(
    () => OTHER_DEFS.filter(d => outcomes.some(o => o.items[d.key]?.value !== undefined)),
    [outcomes]
  )

  // Grip L / Grip R interpretation — single patient (patient page).
  const gripInterp = useMemo<Record<string, GripInterp | null>>(() => {
    const res: Record<string, GripInterp | null> = {}
    GRIP_KEYS.forEach(key => {
      const { firstVal, lastVal } = gripFirstLast(outcomes, key, OUTCOME_SESSIONS, 'Discharge')
      res[key] = gripInterpretationSingle({ nationality: nationality ?? '', sex: sex ?? '', firstVal, lastVal })
    })
    return res
  }, [outcomes, nationality, sex])

  const selectedSessionData: SessionDatum[] = useMemo(() =>
    selectedSessions.map(s => ({
      session: s,
      label: SESSION_SHORT[s] ?? s,
      color: sessionColorMap[s] ?? '#94a3b8',
      o: bySession[s],
    }))
  , [selectedSessions, sessionColorMap, bySession])

  const los = useMemo(() => {
    if (selectedSessions.length < 2) return null
    const dates = selectedSessions
      .map(s => bySession[s]?.assessmentDate)
      .filter((d): d is string => !!d)
      .map(d => new Date(d).getTime())
    if (dates.length < 2) return null
    return Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000)
  }, [selectedSessions, bySession])

  if (filledSessions.length === 0) return null

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
  const showChart    = presentOthers.some(d => selectedSessionData.some(sd => sd.o?.items[d.key]?.value !== undefined))

  const legendItems = selectedSessions.map(s => {
    const { stroke } = getShade(s)
    return { key: s, label: SESSION_SHORT[s] ?? s, color: stroke }
  })

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
        {/* Legend — session gradient colors */}
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

        <div className="flex items-end gap-1">
          {showBrfaSvg  && <BrfaSegmentBar  sessions={selectedSessionData} />}
          {showAmpacSvg && <AmpacSegmentBar sessions={selectedSessionData} />}
          {showChart && (
            <CustomBarChart defs={presentOthers} sessions={selectedSessionData} gripInterp={gripInterp} />
          )}
        </div>
      </div>
    </div>
  )
}
