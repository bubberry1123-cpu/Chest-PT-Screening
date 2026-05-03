import type { Patient, Screening, OutcomeMeasurement, OutcomeSession } from '@/types'

const PATIENTS_KEY = 'cpt_patients'
const SCREENINGS_KEY = 'cpt_screenings'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// --- Patients ---

export async function createPatient(data: Omit<Patient, 'id' | 'createdAt'>): Promise<string> {
  const patients = load<Patient>(PATIENTS_KEY)
  const id = uid()
  patients.unshift({ ...data, id, createdAt: new Date() })
  save(PATIENTS_KEY, patients)
  return id
}

export async function getPatientByHn(hn: string): Promise<Patient | null> {
  return load<Patient>(PATIENTS_KEY).find(p => p.hn === hn) ?? null
}

export async function searchPatients(term: string): Promise<Patient[]> {
  const t = term.toLowerCase()
  return load<Patient>(PATIENTS_KEY).filter(p =>
    p.hn.toLowerCase().includes(t) ||
    p.firstName.toLowerCase().includes(t) ||
    p.lastName.toLowerCase().includes(t)
  )
}

export async function getAllPatients(): Promise<Patient[]> {
  return load<Patient>(PATIENTS_KEY)
}

export async function getPatientById(id: string): Promise<Patient | null> {
  return load<Patient>(PATIENTS_KEY).find(p => p.id === id) ?? null
}

export async function updatePatient(id: string, data: Partial<Patient>): Promise<void> {
  const patients = load<Patient>(PATIENTS_KEY).map(p =>
    p.id === id ? { ...p, ...data } : p
  )
  save(PATIENTS_KEY, patients)
}

// --- Screenings ---

export async function createScreening(data: Omit<Screening, 'id' | 'assessedAt'>): Promise<string> {
  const screenings = load<Screening>(SCREENINGS_KEY)
  const id = uid()
  screenings.unshift({ ...data, id, assessedAt: new Date() })
  save(SCREENINGS_KEY, screenings)
  return id
}

export async function getScreeningsByPatient(patientId: string): Promise<Screening[]> {
  return load<Screening>(SCREENINGS_KEY)
    .filter(s => s.patientId === patientId)
    .map(s => ({ ...s, assessedAt: s.assessedAt ? new Date(s.assessedAt) : undefined }))
}

export async function getScreeningById(id: string): Promise<Screening | null> {
  const s = load<Screening>(SCREENINGS_KEY).find(s => s.id === id)
  if (!s) return null
  return { ...s, assessedAt: s.assessedAt ? new Date(s.assessedAt) : undefined }
}

// --- Outcomes ---

const OUTCOMES_KEY = 'cpt_outcomes'

export async function saveOutcome(data: Omit<OutcomeMeasurement, 'id' | 'recordedAt'>): Promise<string> {
  const outcomes = load<OutcomeMeasurement>(OUTCOMES_KEY)
  const idx = outcomes.findIndex(o => o.patientId === data.patientId && o.session === data.session)
  if (idx >= 0) {
    const id = outcomes[idx].id!
    outcomes[idx] = { ...data, id, recordedAt: new Date() }
    save(OUTCOMES_KEY, outcomes)
    return id
  }
  const id = uid()
  outcomes.push({ ...data, id, recordedAt: new Date() })
  save(OUTCOMES_KEY, outcomes)
  return id
}

export async function getOutcomesByPatient(patientId: string): Promise<OutcomeMeasurement[]> {
  return load<OutcomeMeasurement>(OUTCOMES_KEY)
    .filter(o => o.patientId === patientId)
    .map(o => ({ ...o, recordedAt: o.recordedAt ? new Date(o.recordedAt) : undefined }))
}

export async function getAllScreenings(): Promise<Screening[]> {
  return load<Screening>(SCREENINGS_KEY)
    .map(s => ({ ...s, assessedAt: s.assessedAt ? new Date(s.assessedAt) : undefined }))
}

export async function getAllOutcomes(): Promise<OutcomeMeasurement[]> {
  return load<OutcomeMeasurement>(OUTCOMES_KEY)
    .map(o => ({ ...o, recordedAt: o.recordedAt ? new Date(o.recordedAt) : undefined }))
}
