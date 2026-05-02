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
  'Initial', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Discharge',
] as const

export const SESSION_SHORT: Record<string, string> = {
  'Initial': 'Initial',
  'Follow-up 1': 'FU 1',
  'Follow-up 2': 'FU 2',
  'Follow-up 3': 'FU 3',
  'Discharge': 'D/C',
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

function single(key: string, label: string, unit: string, opts?: Partial<OutcomeItemDef>): OutcomeGroupDef {
  return { groupKey: key, label, items: [{ key, label, unit, ...opts }] }
}

export const OUTCOME_GROUPS: Record<OverallLevel, OutcomeGroupDef[]> = {
  1: [
    AMPAC_GROUP,
    BRFA_GROUP,
    single('peakCoughFlow',       'Peak Cough Flow',      'L/min'),
    single('wrightSpirometer',    'Wright Spirometer',    'mL'),
    single('incentiveSpirometry', 'Incentive Spirometry', 'mL'),
    single('sixMWT',              '6MWT',                 'meters'),
    single('cs30', '30-Second Chair Stand Test (CS-30)', 'stands', { showNotes: true }),
    GRIP_GROUP,
  ],
  2: [
    AMPAC_GROUP,
    BRFA_GROUP,
    single('peakCoughFlow',       'Peak Cough Flow',      'L/min'),
    single('wrightSpirometer',    'Wright Spirometer',    'mL'),
    single('incentiveSpirometry', 'Incentive Spirometry', 'mL'),
    single('twoMinMarching',      '2-min Marching Test',  'steps'),
    single('cs30', '30-Second Chair Stand Test (CS-30)', 'stands', { showNotes: true }),
    GRIP_GROUP,
  ],
  3: [
    AMPAC_GROUP,
    BRFA_GROUP,
    single('peakCoughFlow',    'Peak Cough Flow',   'L/min'),
    single('wrightSpirometer', 'Wright Spirometer', 'mL'),
    single('dyspneaScale',     'Dyspnea scale',     '/10', { lowerIsBetter: true, min: 0, max: 10 }),
  ],
  4: [
    AMPAC_GROUP,
    BRFA_GROUP,
    single('dyspneaScale', 'Dyspnea scale', '/10', { lowerIsBetter: true, min: 0, max: 10 }),
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
