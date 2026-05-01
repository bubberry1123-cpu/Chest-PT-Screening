import type { FLevel, RLevel, OverallLevel, O2Support, ProgramType, ScreeningInput, ScreeningResult } from '@/types'

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

function coughToRLevel(peakCoughFlow: number): RLevel {
  if (peakCoughFlow > 400) return 1
  if (peakCoughFlow >= 360) return 2
  if (peakCoughFlow >= 160) return 3
  return 4
}

function abgToRLevel(abgPaO2: number): RLevel {
  if (abgPaO2 > 80) return 1
  if (abgPaO2 >= 60) return 2
  if (abgPaO2 >= 40) return 3
  return 4
}

function mmrcToRLevel(mmrc: number): RLevel {
  if (mmrc === 0) return 1
  if (mmrc <= 2) return 2
  if (mmrc === 3) return 3
  return 4
}

export function calculateRLevel(
  o2Support: O2Support,
  peakCoughFlow?: number,
  abgPaO2?: number,
  mmrcDyspnea?: number
): RLevel {
  const levels: RLevel[] = [o2ToRLevel(o2Support)]
  if (peakCoughFlow != null) levels.push(coughToRLevel(peakCoughFlow))
  if (abgPaO2 != null) levels.push(abgToRLevel(abgPaO2))
  if (mmrcDyspnea != null) levels.push(mmrcToRLevel(mmrcDyspnea))
  return Math.max(...levels) as RLevel
}

const OUTCOME_MEASUREMENTS: Record<number, string[]> = {
  1: ['AMPAC', 'BRFA', 'Peak flow', 'Incentive spirometry', '6-Minute Walk Test (6MWT)', 'Grip Strength'],
  2: ['AMPAC', 'BRFA', 'Peak flow', 'Incentive spirometry', '2-Minute Marching Test', 'Grip Strength'],
  3: ['AMPAC', 'BRFA', 'Dyspnea scale', 'Peak flow'],
  4: ['AMPAC', 'Dyspnea scale'],
}

const REHAB_PROGRAMS: Record<number, string[]> = {
  1: [
    'Circuit training (ACSM)',
    'Work Hardening',
    'Motivational Interviewing & Educational Program',
  ],
  2: [
    'Lung Expansion Exercise with IS training',
    'Cough Training and IMT',
    'AROM',
    'Endurance (Bicycle/Treadmill)',
    'IMT',
    'Self-Management with Energy Conservation',
  ],
  3: [
    'Chest Program (Trilogy/Vibration/Suction)',
    'Lung Expansion + IS',
    'Incentive Muscle Training',
    'AAROM / Bed Mobility Training',
    'Self-Management with Energy Conservation',
  ],
  4: [
    'Positioning & Postural Drainage',
    'Chest Program (Trilogy/Vibration/Suction)',
    'PROM/Stretching',
    'Lung Expansion with Manual Hyperinflation',
  ],
}

export function calculateScreening(input: ScreeningInput): ScreeningResult {
  const fLevel = calculateFLevel(input.cfsScore)
  const rLevel = calculateRLevel(input.o2Support, input.peakCoughFlow, input.abgPaO2, input.mmrcDyspnea)
  const overallLevel = Math.max(fLevel, rLevel) as OverallLevel
  const programType: ProgramType = fLevel === rLevel ? 'Standard' : 'Intensive'

  return {
    fLevel,
    rLevel,
    overallLevel,
    programType,
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

export const MMRC_DESCRIPTIONS: Record<number, string> = {
  0: 'ไม่มีอาการหายใจลำบาก ยกเว้นออกแรงมาก',
  1: 'หายใจลำบากเมื่อเดินเร็วหรือขึ้นเนิน',
  2: 'เดินช้ากว่าคนปกติ หรือต้องหยุดพักเป็นระยะ',
  3: 'ต้องหยุดพักทุก 100 เมตร หรือหลังเดินไม่กี่นาที',
  4: 'หายใจลำบากจนไม่สามารถออกจากบ้านได้ / เหนื่อยแม้ขณะพัก',
}

export const LEVEL_CONFIG = {
  1: { label: 'Mild', color: 'green', th: 'ระดับเบา' },
  2: { label: 'Moderate', color: 'yellow', th: 'ระดับปานกลาง' },
  3: { label: 'Mild Severe', color: 'orange', th: 'ระดับค่อนข้างรุนแรง' },
  4: { label: 'Severe', color: 'red', th: 'ระดับรุนแรง' },
} as const
