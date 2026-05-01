export type O2Support = 'room_air' | 'low_flow' | 'high_flow' | 'ventilator'
export type FLevel = 1 | 2 | 3 | 4
export type RLevel = 1 | 2 | 3 | 4
export type OverallLevel = 1 | 2 | 3 | 4
export type ProgramType = 'Standard' | 'Intensive'

export interface Patient {
  id?: string
  hn: string
  firstName: string
  lastName: string
  age: number
  nationality: string
  ward: string
  createdAt?: Date
}

export interface ScreeningInput {
  cfsScore: number
  o2Support: O2Support
  o2FlowRate?: number
  peakCoughFlow?: number
  abgPaO2?: number
  mmrcDyspnea: number
}

export interface ScreeningResult {
  fLevel: FLevel
  rLevel: RLevel
  overallLevel: OverallLevel
  programType: ProgramType
  outcomeMeasurements: string[]
  rehabProgram: string[]
}

export interface Screening extends ScreeningInput, ScreeningResult {
  id?: string
  patientId: string
  patientHn: string
  ward: string
  assessedBy: string
  notes?: string
  assessedAt?: Date
}
