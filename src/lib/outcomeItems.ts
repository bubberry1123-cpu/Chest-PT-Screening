import type { OverallLevel } from '@/types'

export interface OutcomeItemDef {
  key: string
  label: string
  unit: string
  lowerIsBetter?: boolean
  step?: number
  min?: number
  max?: number
  showNotes?: boolean
}

export interface OutcomeGroupDef {
  groupKey: string
  label: string
  items: OutcomeItemDef[]
}

export const OUTCOME_SESSIONS = [
  'Initial',
  'Reassessment 1', 'Reassessment 2', 'Reassessment 3', 'Reassessment 4', 'Reassessment 5',
  'Reassessment 6', 'Reassessment 7', 'Reassessment 8', 'Reassessment 9', 'Reassessment 10',
  'Discharge',
] as const

export const SESSION_SHORT: Record<string, string> = {
  'Initial':          'Initial',
  'Reassessment 1':   'RA 1',  'Reassessment 2':  'RA 2',
  'Reassessment 3':   'RA 3',  'Reassessment 4':  'RA 4',
  'Reassessment 5':   'RA 5',  'Reassessment 6':  'RA 6',
  'Reassessment 7':   'RA 7',  'Reassessment 8':  'RA 8',
  'Reassessment 9':   'RA 9',  'Reassessment 10': 'RA 10',
  'Discharge':        'D/C',
  // ERAS phases
  'Prehabilitation': 'Pre-hab',
  'Pre-op':          'Pre-op',
  'DC':              'D/C',
  'Follow-up':       'F/U',
  // Legacy keys for existing localStorage records
  'Follow-up 1': 'FU 1',  'Follow-up 2':  'FU 2',
  'Follow-up 3': 'FU 3',  'Follow-up 4':  'FU 4',
  'Follow-up 5': 'FU 5',  'Follow-up 6':  'FU 6',
  'Follow-up 7': 'FU 7',  'Follow-up 8':  'FU 8',
  'Follow-up 9': 'FU 9',  'Follow-up 10': 'FU 10',
}

const AMPAC_GROUP: OutcomeGroupDef = {
  groupKey: 'ampac', label: 'AMPAC',
  items: [
    { key: 'ampac_part1', label: 'Part 1: Basic Mobility',    unit: '/24', min: 0, max: 24 },
    { key: 'ampac_part2', label: 'Part 2: Daily Activity',    unit: '/24', min: 0, max: 24 },
    { key: 'ampac_part3', label: 'Part 3: Applied Cognitive', unit: '/24', min: 0, max: 24 },
  ],
}

const BRFA_GROUP: OutcomeGroupDef = {
  groupKey: 'brfa', label: 'BRFA',
  items: [
    { key: 'brfa_part1', label: 'Part 1: Functional Assessment', unit: '%', min: 0, max: 100 },
    { key: 'brfa_part2', label: 'Part 2: Confidence (Q16-19)',   unit: '%', min: 0, max: 100 },
    { key: 'brfa_q20',   label: 'Q20: Environment',             unit: '%', min: 0, max: 100 },
    { key: 'brfa_q21',   label: 'Q21: Satisfaction',            unit: '%', min: 0, max: 100 },
  ],
}

const GRIP_GROUP: OutcomeGroupDef = {
  groupKey: 'gripStrength', label: 'Grip Strength',
  items: [
    { key: 'gripStrength_left',  label: 'Left hand',  unit: 'kg', step: 0.1 },
    { key: 'gripStrength_right', label: 'Right hand', unit: 'kg', step: 0.1 },
  ],
}

const WALK_TEST_GROUP: OutcomeGroupDef = {
  groupKey: 'walkTest',
  label: '6-Minute Walk Test or 2-Minute Stepping Test (6MWT or 2MST)',
  items: [
    { key: 'sixMWT',         label: '6-Minute Walk Test',      unit: 'meters' },
    { key: 'twoMinMarching', label: '2-Minute Stepping Test',  unit: 'steps' },
  ],
}

function single(key: string, label: string, unit: string, opts?: Partial<OutcomeItemDef>): OutcomeGroupDef {
  return { groupKey: key, label, items: [{ key, label, unit, ...opts }] }
}

const DYSPNEA = single('dyspneaScale', 'mMRC Dyspnea Scale', '/4', { min: 0, max: 4 })

export const OUTCOME_GROUPS: Record<OverallLevel, OutcomeGroupDef[]> = {
  1: [
    AMPAC_GROUP,
    BRFA_GROUP,
    DYSPNEA,
    single('peakCoughFlow',    'Peak Cough Flow',   'L/min'),
    single('wrightSpirometer', 'Wright Spirometer', 'mL'),
    single('cs30', '30-Second Chair Stand Test (CS-30)', 'stands', { showNotes: true }),
    GRIP_GROUP,
    WALK_TEST_GROUP,
  ],
  2: [
    AMPAC_GROUP,
    BRFA_GROUP,
    DYSPNEA,
    single('peakCoughFlow',    'Peak Cough Flow',   'L/min'),
    single('wrightSpirometer', 'Wright Spirometer', 'mL'),
    single('cs30', '30-Second Chair Stand Test (CS-30)', 'stands', { showNotes: true }),
    GRIP_GROUP,
    single('twoMeterWalk', '2-Minute Walk Test (2MWT)', 'meters', { showNotes: true }),
  ],
  3: [
    AMPAC_GROUP,
    BRFA_GROUP,
    DYSPNEA,
    single('peakCoughFlow',    'Peak Cough Flow',   'L/min'),
    single('wrightSpirometer', 'Wright Spirometer', 'mL'),
  ],
  4: [
    AMPAC_GROUP,
    BRFA_GROUP,
    DYSPNEA,
  ],
}

export function getFlatItems(level: OverallLevel): OutcomeItemDef[] {
  return OUTCOME_GROUPS[level].flatMap(g => g.items)
}

// Kept for comparison table (flat list per level)
export const OUTCOME_ITEMS: Record<OverallLevel, OutcomeItemDef[]> = {
  1: getFlatItems(1),
  2: getFlatItems(2),
  3: getFlatItems(3),
  4: getFlatItems(4),
}

// ── ERAS ──────────────────────────────────────────────────────────────────────

export const ERAS_PHASES = ['Prehabilitation', 'Pre-op', 'DC', 'Follow-up'] as const
export type ErasPhaseValue = typeof ERAS_PHASES[number]

export const ERAS_PHASE_SHORT: Record<string, string> = {
  'Prehabilitation': 'Pre-hab',
  'Pre-op':          'Pre-op',
  'DC':              'D/C',
  'Follow-up':       'F/U',
}

export const ERAS_OUTCOME_GROUPS: OutcomeGroupDef[] = [
  single('peakCoughFlow',   'Peak Cough Flow',   'L/min'),
  single('wrightSpirometer','Wright Spirometry', 'mL'),
  {
    groupKey: 'handGrip',
    label: 'Hand Grip Strength',
    items: [
      { key: 'gripStrength_left',  label: 'Left hand',  unit: 'kg', step: 0.1 },
      { key: 'gripStrength_right', label: 'Right hand', unit: 'kg', step: 0.1 },
    ],
  },
  single('cs30',         '30-Second Chair Stand Test (CS-30)', 'stands', { showNotes: true }),
  single('erasTwoMWalk', '2-Meter Walk Test',                  'seconds', { lowerIsBetter: true, step: 0.1 }),
]

export function getErasFlatItems(): OutcomeItemDef[] {
  return ERAS_OUTCOME_GROUPS.flatMap(g => g.items)
}

// ── Peak Cough Flow clinical interpretation ───────────────────────────────────
// Shown inside chart tooltips wherever a Peak Cough Flow value appears.
//   ≥ 400 L/min    → Effective cough
//   271–399 L/min  → Strong cough
//   160–270 L/min  → Moderate cough
//   < 160 L/min    → Ineffective / weak cough
export function peakCoughFlowInterpretation(val: number): string {
  if (val >= 400) return 'Effective cough'
  if (val >= 271) return 'Strong cough'
  if (val >= 160) return 'Moderate cough'
  return 'Ineffective / weak cough'
}

// ── Grip strength (sarcopenia) interpretation ─────────────────────────────────
// Shown as the "→ ..." line inside the Grip L / Grip R tooltips.
export const GRIP_KEYS = ['gripStrength_left', 'gripStrength_right'] as const
const GRIP_RED = '#DC2626'   // below cut-off
const GRIP_GREEN = '#16A34A' // within normal range
const GRIP_BLUE = '#0C447C'  // neutral (matches the BRFA "→" color)

export interface GripInterp { text: string; color: string }

// Cut-off (kg) by nationality standard + sex.
//   AWGS 2019 (Thai, CLMV, Asia): Male < 28, Female < 18
//   EWGSOP2   (Inter, Arab):      Male < 27, Female < 16
function gripCutoff(nationality: string, sex: string): number | null {
  const ewgsop2 = nationality === 'Inter' || nationality === 'Arab'
  if (sex === 'Male')   return ewgsop2 ? 27 : 28
  if (sex === 'Female') return ewgsop2 ? 16 : 18
  return null // 'Other' → cannot pick a cut-off
}

// First (Initial) and last (Discharge, else latest) grip value for one key,
// following the given session order.
export function gripFirstLast(
  outcomes: { session: string; items: Record<string, { value: number } | undefined> }[],
  key: string,
  order: readonly string[],
  dischargeSession: string,
): { firstVal?: number; lastVal?: number } {
  const bySess: Record<string, number> = {}
  outcomes.forEach(o => { const v = o.items[key]?.value; if (v !== undefined) bySess[o.session] = v })
  const firstVal = order.map(s => bySess[s]).find(v => v !== undefined)
  const lastVal = bySess[dischargeSession] ?? [...order].reverse().map(s => bySess[s]).find(v => v !== undefined)
  return { firstVal, lastVal }
}

function gripTrendText(firstVal?: number, lastVal?: number): string {
  if (firstVal === undefined || lastVal === undefined) return ''
  const diff = Math.round((lastVal - firstVal) * 10) / 10
  if (diff >= 1)  return `ดีขึ้น +${diff.toFixed(1)} kg`
  if (diff <= -1) return `ลดลง ${diff.toFixed(1)} kg ควรติดตาม`
  return ''
}

// Single patient: compare the Discharge/latest value against the cut-off + trend.
export function gripInterpretationSingle(o: {
  nationality: string; sex: string; firstVal?: number; lastVal?: number
}): GripInterp | null {
  if (o.lastVal === undefined) return null
  const cutoff = gripCutoff(o.nationality, o.sex)
  const trend = gripTrendText(o.firstVal, o.lastVal)
  let text: string, color: string
  if (cutoff === null) {
    text = 'เทียบเกณฑ์ราย case (ระบุเพศเพื่อเทียบ cut-off)'; color = GRIP_BLUE
  } else if (o.lastVal < cutoff) {
    text = `แรงบีบมือต่ำกว่าเกณฑ์ (< ${cutoff} kg) — possible sarcopenia ควรประเมินเพิ่มเติม`; color = GRIP_RED
  } else {
    text = 'แรงบีบมืออยู่ในเกณฑ์ปกติ'; color = GRIP_GREEN
  }
  if (trend) text += ` · ${trend}`
  return { text, color }
}

// All patients (average): trend only, never compare the cut-off (mixed sex/nationality).
export function gripInterpretationAverage(o: { firstAvg?: number; lastAvg?: number }): GripInterp | null {
  if (o.lastAvg === undefined && o.firstAvg === undefined) return null
  const trend = gripTrendText(o.firstAvg, o.lastAvg)
  const text = (trend ? `${trend} · ` : '') + 'เทียบเกณฑ์ราย case'
  return { text, color: GRIP_BLUE }
}

// ── INBODY (ERAS — Prehabilitation phase only) ────────────────────────────────

export const INBODY_BALANCE_OPTIONS = ['Balanced', 'Slightly unbalanced', 'Extremely unbalanced'] as const

export const INBODY_GROUPS: OutcomeGroupDef[] = [
  {
    groupKey: 'inbody_general',
    label: 'General',
    items: [
      { key: 'inbody_bmi',            label: 'BMI',                  unit: 'kg/m²', step: 0.1, showNotes: true },
      { key: 'inbody_bodyFatMass',    label: 'Body fat mass',        unit: 'kg',    step: 0.1 },
      { key: 'inbody_skeletalMuscle', label: 'Skeletal Muscle Mass', unit: 'kg',    step: 0.1, showNotes: true },
      { key: 'inbody_bodyFatPct',     label: 'Body Fat %',           unit: '%',     step: 0.1, showNotes: true },
    ],
  },
  {
    groupKey: 'inbody_segmentLean',
    label: 'Segment Lean Analysis',
    items: [
      { key: 'inbody_legLeft',  label: 'Leg — Left',  unit: 'kg', step: 0.1 },
      { key: 'inbody_legRight', label: 'Leg — Right', unit: 'kg', step: 0.1 },
      { key: 'inbody_trunk',    label: 'Trunk',       unit: 'kg', step: 0.1 },
      { key: 'inbody_armLeft',  label: 'Arm — Left',  unit: 'kg', step: 0.1 },
      { key: 'inbody_armRight', label: 'Arm — Right', unit: 'kg', step: 0.1 },
    ],
  },
]

export const INBODY_BALANCE_ITEMS = [
  { key: 'inbody_balanceUpper',      label: 'Upper' },
  { key: 'inbody_balanceLower',      label: 'Lower' },
  { key: 'inbody_balanceUpperLower', label: 'Upper-Lower' },
] as const

export const INBODY_BALANCE_KEYS: string[] = ['inbody_balanceUpper', 'inbody_balanceLower', 'inbody_balanceUpperLower']

export function getInBodyFlatItems(): OutcomeItemDef[] {
  return INBODY_GROUPS.flatMap(g => g.items)
}
