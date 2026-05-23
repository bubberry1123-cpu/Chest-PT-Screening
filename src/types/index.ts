export type O2Support = 'room_air' | 'low_flow' | 'high_flow' | 'ventilator'
export type Sex = 'Male' | 'Female' | 'Other'
export type Cooperativeness = 'fully_cooperative' | 'non_cooperative'
export type FLevel = 1 | 2 | 3 | 4
export type RLevel = 1 | 2 | 3 | 4
export type OverallLevel = 1 | 2 | 3 | 4
export type ProgramType = 'Standard' | 'Intensive'
export type Driver = 'Functional' | 'Respiratory' | 'Equal' | 'Non-Cooperative'
export type AssessmentType = 'Standard' | 'ERAS'

export interface Patient {
  id?: string
  hn: string
  firstName: string
  lastName: string
  age: number
  sex: Sex
  nationality: string
  location: string
  createdAt?: Date
}

export interface ScreeningInput {
  cooperativeness: Cooperativeness
  cfsScore: number
  o2Support: O2Support
}

export interface ScreeningResult {
  fLevel: FLevel
  rLevel: RLevel
  overallLevel: OverallLevel
  programType: ProgramType
  driver: Driver
  levelName: string
  goal: string
  outcomeMeasurements: string[]
}

export interface Screening extends ScreeningInput, ScreeningResult {
  id?: string
  patientId: string
  patientHn: string
  location: string
  assessedBy: string
  notes?: string
  assessedAt?: Date
  assessmentType?: AssessmentType
}

export type OutcomeSession =
  | 'Initial'
  | 'Reassessment 1' | 'Reassessment 2' | 'Reassessment 3' | 'Reassessment 4' | 'Reassessment 5'
  | 'Reassessment 6' | 'Reassessment 7' | 'Reassessment 8' | 'Reassessment 9' | 'Reassessment 10'
  | 'Discharge'
  | 'Prehabilitation' | 'Pre-op' | 'Post-op' | 'DC'

export interface OutcomeEntry {
  value: number
  note?: string
}

export interface OutcomeMeasurement {
  id?: string
  patientId: string
  patientHn: string
  session: OutcomeSession
  level: OverallLevel
  items: Record<string, OutcomeEntry>
  recordedAt?: Date
  assessmentDate?: string  // YYYY-MM-DD, user-editable, separate from recordedAt
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  employeeId?: string
  role: 'admin' | 'staff'
  status: 'pending' | 'active' | 'rejected'
  createdAt?: Date
}

export interface ActivityLog {
  id?: string
  userId: string
  userEmail: string
  userName: string
  action: string
  entityType: 'patient' | 'screening' | 'outcome'
  entityId: string
  entityLabel: string
  timestamp?: Date
}
