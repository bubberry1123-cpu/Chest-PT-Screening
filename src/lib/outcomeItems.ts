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
  label: '6-Minute Walk Test or 2-Minute Marching Test',
  items: [
    { key: 'sixMWT',        label: '6-Minute Walk Test',      unit: 'meters' },
    { key: 'twoMinMarching', label: '2-Minute Marching Test', unit: 'steps' },
  ],
}

function single(key: string, label: string, unit: string, opts?: Partial<OutcomeItemDef>): OutcomeGroupDef {
  return { groupKey: key, label, items: [{ key, label, unit, ...opts }] }
}

const DYSPNEA = single('dyspneaScale', 'Dyspnea scale', '/10', { min: 0, max: 10 })

export const OUTCOME_GROUPS: Record<OverallLevel, OutcomeGroupDef[]> = {
  1: [
    AMPAC_GROUP,
    BRFA_GROUP,
    DYSPNEA,
    single('peakCoughFlow',    'Peak Cough Flow',   'L/min'),
    single('wrightSpirometer', 'Wright Spirometer', 'mL'),
    WALK_TEST_GROUP,
    GRIP_GROUP,
  ],
  2: [
    AMPAC_GROUP,
    BRFA_GROUP,
    DYSPNEA,
    single('peakCoughFlow',    'Peak Cough Flow',   'L/min'),
    single('wrightSpirometer', 'Wright Spirometer', 'mL'),
    single('cs30', '30-Second Chair Stand Test (CS-30)', 'stands', { showNotes: true }),
    single('twoMeterWalk', '2-Meter Walk Test (2mWT)', 'seconds', { showNotes: true, lowerIsBetter: true }),
    GRIP_GROUP,
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
