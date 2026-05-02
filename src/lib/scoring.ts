import type { FLevel, RLevel, OverallLevel, O2Support, ProgramType, Driver, ScreeningInput, ScreeningResult } from '@/types'

export function calculateFLevel(cfsScore: number): FLevel {
  if (cfsScore <= 3) return 1
  if (cfsScore <= 5) return 2
  if (cfsScore <= 7) return 3
  return 4
}

function o2ToRLevel(o2Support: O2Support): RLevel {
  switch (o2Support) {
    case 'room_air': return 1
    case 'low_flow': return 2
    case 'high_flow': return 3
    case 'ventilator': return 4
  }
}

export function calculateRLevel(o2Support: O2Support): RLevel {
  return o2ToRLevel(o2Support)
}

const LEVEL_NAMES: Record<number, string> = {
  1: 'Mild',
  2: 'Moderate',
  3: 'Mild Severe',
  4: 'Severe',
}

const LEVEL_GOALS: Record<number, string> = {
  1: 'Improve Self-Confidence',
  2: 'Enhance Functional Restoration',
  3: 'Reconditioning and Weaning',
  4: 'Secretion Clearance & Prevent Complication',
}

const OUTCOME_MEASUREMENTS: Record<number, string[]> = {
  1: ['AMPAC', 'BRFA', 'Dyspnea scale', 'Peak Cough Flow', 'Wright Spirometry', '6-Minute Walk Test or 2-Minute Marching Test', 'Grip Strength'],
  2: ['AMPAC', 'BRFA', 'Dyspnea scale', 'Peak Cough Flow', 'Wright Spirometry', '30-Second Chair Stand Test (CS-30)', 'Grip Strength'],
  3: ['AMPAC', 'BRFA', 'Dyspnea scale', 'Peak Cough Flow', 'Wright Spirometry'],
  4: ['AMPAC', 'BRFA', 'Dyspnea scale'],
}

const REHAB_PROGRAMS: Record<number, string[]> = {
  1: [
    'Circuit training (ACSM)',
    'Work Hardening',
    'Return to ADL',
    'Motivational Interviewing',
    'Educational Program',
  ],
  2: [
    'Lung Expansion Exercise with IS training',
    'Cough Training and IMT',
    'AROM',
    'Endurance training (Bicycle/Treadmill)',
    'Self-Management with Energy Conservation',
  ],
  3: [
    'Chest Program (Trilogy/Vibration/Suction)',
    'Lung Expansion + IS',
    'Incentive Muscle Training (IMT)',
    'AAROM',
    'Bed Mobility Training',
    'Self-Management with Energy Conservation',
  ],
  4: [
    'Positioning & Postural drainage',
    'Chest Program (Trilogy/Vibration/Suction)',
    'PROM/Stretching',
    'Lung Expansion with Manual Hyperinflation',
  ],
}

export const RED_FLAGS = [
  'SpO₂ < 95% หรือลดลง > 2% จาก baseline',
  'RR > 30 ครั้ง/นาที หรือใช้ accessory muscle เพิ่มขึ้น',
  'HR > 120 หรือ < 50 bpm หรือ new arrhythmia',
  'Borg dyspnea ≥ 7/10',
  'BP systolic < 90 หรือ > 180 mmHg / MAP < 65 mmHg',
  'Altered consciousness / Agitation (RASS ≤ -3 หรือ ≥ +2)',
]

export function calculateScreening(input: ScreeningInput): ScreeningResult {
  const fLevel = calculateFLevel(input.cfsScore)
  const rLevel = calculateRLevel(input.o2Support)

  if (input.cooperativeness === 'non_cooperative') {
    return {
      fLevel,
      rLevel,
      overallLevel: 4,
      programType: 'Intensive',
      driver: 'Non-Cooperative',
      levelName: LEVEL_NAMES[4],
      goal: LEVEL_GOALS[4],
      outcomeMeasurements: OUTCOME_MEASUREMENTS[4],
      rehabProgram: REHAB_PROGRAMS[4],
    }
  }

  const overallLevel = Math.max(fLevel, rLevel) as OverallLevel
  const programType: ProgramType = fLevel === rLevel ? 'Standard' : 'Intensive'
  const driver: Driver = fLevel > rLevel ? 'Functional' : rLevel > fLevel ? 'Respiratory' : 'Equal'

  return {
    fLevel,
    rLevel,
    overallLevel,
    programType,
    driver,
    levelName: LEVEL_NAMES[overallLevel],
    goal: LEVEL_GOALS[overallLevel],
    outcomeMeasurements: OUTCOME_MEASUREMENTS[overallLevel],
    rehabProgram: REHAB_PROGRAMS[overallLevel],
  }
}

export const CFS_DESCRIPTIONS: Record<number, { th: string; en: string }> = {
  1: { en: 'Very fit', th: 'แข็งแรงมาก — ออกกำลังกายสม่ำเสมอ' },
  2: { en: 'Fit', th: 'แข็งแรง — ไม่มีโรคประจำตัว' },
  3: { en: 'Managing well', th: 'จัดการได้ดี — มีโรคประจำตัวที่ควบคุมได้' },
  4: { en: 'Vulnerable', th: 'เปราะบางเล็กน้อย — มีข้อจำกัดในกิจกรรมซับซ้อน' },
  5: { en: 'Mildly frail', th: 'เปราะบางปานกลาง — ต้องการความช่วยเหลือบ้าง' },
  6: { en: 'Moderate frail', th: 'เปราะบางปานกลางถึงมาก — ต้องการช่วยแต่งตัว/อาบน้ำ' },
  7: { en: 'Severely frail', th: 'เปราะบางรุนแรง — ต้องพึ่งพาผู้อื่นสมบูรณ์' },
  8: { en: 'Very severely frail', th: 'เปราะบางรุนแรงมาก — ใกล้เสียชีวิต' },
  9: { en: 'Terminally ill', th: 'ป่วยระยะสุดท้าย — คาดว่าจะมีชีวิตอยู่ไม่เกิน 6 เดือน' },
}

export const LEVEL_CONFIG = {
  1: { label: 'Mild', color: 'green', th: 'ระดับเบา' },
  2: { label: 'Moderate', color: 'yellow', th: 'ระดับปานกลาง' },
  3: { label: 'Mild Severe', color: 'orange', th: 'ระดับค่อนข้างรุนแรง' },
  4: { label: 'Severe', color: 'red', th: 'ระดับรุนแรง' },
} as const
