import type { OverallLevel } from '@/types'

export interface OutcomeItemDef {
  key: string
  label: string
  unit: string
  lowerIsBetter?: boolean
  step?: number
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

export const OUTCOME_ITEMS: Record<OverallLevel, OutcomeItemDef[]> = {
  1: [
    { key: 'ampac',               label: 'AMPAC',               unit: 'คะแนน' },
    { key: 'brfa',                label: 'BRFA',                unit: 'คะแนน' },
    { key: 'peakCoughFlow',       label: 'Peak Cough Flow',     unit: 'L/min' },
    { key: 'wrightSpirometer',    label: 'Wright Spirometer',   unit: 'mL' },
    { key: 'incentiveSpirometry', label: 'Incentive spirometry',unit: 'mL' },
    { key: 'sixMWT',              label: '6MWT',                unit: 'เมตร' },
    { key: 'gripStrength',        label: 'Grip Strength',       unit: 'kg', step: 0.1 },
  ],
  2: [
    { key: 'ampac',               label: 'AMPAC',               unit: 'คะแนน' },
    { key: 'brfa',                label: 'BRFA',                unit: 'คะแนน' },
    { key: 'peakCoughFlow',       label: 'Peak Cough Flow',     unit: 'L/min' },
    { key: 'wrightSpirometer',    label: 'Wright Spirometer',   unit: 'mL' },
    { key: 'incentiveSpirometry', label: 'Incentive spirometry',unit: 'mL' },
    { key: 'twoMinMarching',      label: '2-min Marching Test', unit: 'ครั้ง' },
    { key: 'gripStrength',        label: 'Grip Strength',       unit: 'kg', step: 0.1 },
  ],
  3: [
    { key: 'ampac',            label: 'AMPAC',          unit: 'คะแนน' },
    { key: 'brfa',             label: 'BRFA',           unit: 'คะแนน' },
    { key: 'dyspneaScale',     label: 'Dyspnea scale',  unit: '0–10', lowerIsBetter: true },
    { key: 'peakCoughFlow',    label: 'Peak Cough Flow',unit: 'L/min' },
    { key: 'wrightSpirometer', label: 'Wright Spirometer', unit: 'mL' },
  ],
  4: [
    { key: 'ampac',        label: 'AMPAC',         unit: 'คะแนน' },
    { key: 'brfa',         label: 'BRFA',          unit: 'คะแนน' },
    { key: 'dyspneaScale', label: 'Dyspnea scale', unit: '0–10', lowerIsBetter: true },
  ],
}
