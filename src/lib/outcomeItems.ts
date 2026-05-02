import type { OverallLevel } from '@/types'

export interface OutcomeItemDef {
  key: string
  label: string
  unit: string
  lowerIsBetter?: boolean
  step?: number
  min?: number
  max?: number
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

const AMPAC_ITEMS: OutcomeItemDef[] = [
  { key: 'ampac_part1', label: 'AMPAC — Part 1: Basic Mobility',   unit: 'score', min: 0, max: 24 },
  { key: 'ampac_part2', label: 'AMPAC — Part 2: Daily Activity',   unit: 'score', min: 0, max: 24 },
  { key: 'ampac_part3', label: 'AMPAC — Part 3: Applied Cognitive',unit: 'score', min: 0, max: 24 },
]

export const OUTCOME_ITEMS: Record<OverallLevel, OutcomeItemDef[]> = {
  1: [
    ...AMPAC_ITEMS,
    { key: 'brfa',                label: 'BRFA',                unit: 'score' },
    { key: 'peakCoughFlow',       label: 'Peak Cough Flow',     unit: 'L/min' },
    { key: 'wrightSpirometer',    label: 'Wright Spirometer',   unit: 'mL' },
    { key: 'incentiveSpirometry', label: 'Incentive spirometry',unit: 'mL' },
    { key: 'sixMWT',              label: '6MWT',                unit: 'meters' },
    { key: 'gripStrength',        label: 'Grip Strength',       unit: 'kg', step: 0.1 },
  ],
  2: [
    ...AMPAC_ITEMS,
    { key: 'brfa',                label: 'BRFA',                unit: 'score' },
    { key: 'peakCoughFlow',       label: 'Peak Cough Flow',     unit: 'L/min' },
    { key: 'wrightSpirometer',    label: 'Wright Spirometer',   unit: 'mL' },
    { key: 'incentiveSpirometry', label: 'Incentive spirometry',unit: 'mL' },
    { key: 'twoMinMarching',      label: '2-min Marching Test', unit: 'steps' },
    { key: 'gripStrength',        label: 'Grip Strength',       unit: 'kg', step: 0.1 },
  ],
  3: [
    ...AMPAC_ITEMS,
    { key: 'brfa',             label: 'BRFA',           unit: 'score' },
    { key: 'dyspneaScale',     label: 'Dyspnea scale',  unit: '0–10', lowerIsBetter: true, min: 0, max: 10 },
    { key: 'peakCoughFlow',    label: 'Peak Cough Flow',unit: 'L/min' },
    { key: 'wrightSpirometer', label: 'Wright Spirometer', unit: 'mL' },
  ],
  4: [
    ...AMPAC_ITEMS,
    { key: 'brfa',         label: 'BRFA',          unit: 'score' },
    { key: 'dyspneaScale', label: 'Dyspnea scale', unit: '0–10', lowerIsBetter: true, min: 0, max: 10 },
  ],
}
