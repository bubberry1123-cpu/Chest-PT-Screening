import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession } from '@/types'

function toDate(val: unknown): Date | undefined {
  if (!val) return undefined
  if (val instanceof Timestamp) return val.toDate()
  if (val instanceof Date) return val
  return new Date(val as string)
}

// ── PATIENTS ──────────────────────────────────────────────────────────────────

export async function createPatient(data: Omit<Patient, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'patients'), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getPatientById(id: string): Promise<Patient | null> {
  const snap = await getDoc(doc(db, 'patients', id))
  if (!snap.exists()) return null
  const d = snap.data()
  return { ...d, id: snap.id, createdAt: toDate(d.createdAt) } as Patient
}

export async function getPatientByHn(hn: string): Promise<Patient | null> {
  const snap = await getDocs(query(collection(db, 'patients'), where('hn', '==', hn)))
  if (snap.empty) return null
  const d = snap.docs[0]
  const data = d.data()
  return { ...data, id: d.id, createdAt: toDate(data.createdAt) } as Patient
}

export async function getAllPatients(): Promise<Patient[]> {
  const snap = await getDocs(query(collection(db, 'patients'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: toDate(data.createdAt) } as Patient
  })
}

export async function searchPatients(term: string): Promise<Patient[]> {
  const all = await getAllPatients()
  const t = term.toLowerCase()
  return all.filter(p =>
    p.hn.toLowerCase().includes(t) ||
    p.firstName.toLowerCase().includes(t) ||
    p.lastName.toLowerCase().includes(t)
  )
}

export async function updatePatient(id: string, data: Partial<Patient>): Promise<void> {
  await setDoc(doc(db, 'patients', id), data, { merge: true })
}

// ── SCREENINGS ────────────────────────────────────────────────────────────────

export async function createScreening(data: Omit<Screening, 'id' | 'assessedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'screenings'), {
    ...data,
    assessedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getScreeningsByPatient(patientId: string): Promise<Screening[]> {
  const snap = await getDocs(
    query(collection(db, 'screenings'), where('patientId', '==', patientId))
  )
  const results = snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, assessedAt: toDate(data.assessedAt) } as Screening
  })
  return results.sort((a, b) => (b.assessedAt?.getTime() ?? 0) - (a.assessedAt?.getTime() ?? 0))
}

export async function getScreeningById(id: string): Promise<Screening | null> {
  const snap = await getDoc(doc(db, 'screenings', id))
  if (!snap.exists()) return null
  const data = snap.data()
  return { ...data, id: snap.id, assessedAt: toDate(data.assessedAt) } as Screening
}

export async function getAllScreenings(): Promise<Screening[]> {
  const snap = await getDocs(query(collection(db, 'screenings'), orderBy('assessedAt', 'desc')))
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, assessedAt: toDate(data.assessedAt) } as Screening
  })
}

// ── OUTCOMES ──────────────────────────────────────────────────────────────────

export async function saveOutcome(data: Omit<OutcomeMeasurement, 'id' | 'recordedAt'>): Promise<string> {
  const existing = await getDocs(
    query(
      collection(db, 'outcomes'),
      where('patientId', '==', data.patientId),
      where('session', '==', data.session)
    )
  )
  if (!existing.empty) {
    const ref = existing.docs[0].ref
    await setDoc(ref, { ...data, recordedAt: serverTimestamp() })
    return ref.id
  }
  const ref = await addDoc(collection(db, 'outcomes'), {
    ...data,
    recordedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getOutcomesByPatient(patientId: string): Promise<OutcomeMeasurement[]> {
  const snap = await getDocs(
    query(collection(db, 'outcomes'), where('patientId', '==', patientId))
  )
  const results = snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, recordedAt: toDate(data.recordedAt) } as OutcomeMeasurement
  })
  return results.sort((a, b) => (a.recordedAt?.getTime() ?? 0) - (b.recordedAt?.getTime() ?? 0))
}

export async function getAllOutcomes(): Promise<OutcomeMeasurement[]> {
  const snap = await getDocs(collection(db, 'outcomes'))
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, recordedAt: toDate(data.recordedAt) } as OutcomeMeasurement
  })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function deletePatient(id: string): Promise<void> {
  const [screeningsSnap, outcomesSnap] = await Promise.all([
    getDocs(query(collection(db, 'screenings'), where('patientId', '==', id))),
    getDocs(query(collection(db, 'outcomes'),   where('patientId', '==', id))),
  ])
  await Promise.all([
    ...screeningsSnap.docs.map(d => deleteDoc(d.ref)),
    ...outcomesSnap.docs.map(d => deleteDoc(d.ref)),
    deleteDoc(doc(db, 'patients', id)),
  ])
}

export async function deleteScreening(id: string): Promise<void> {
  await deleteDoc(doc(db, 'screenings', id))
}

export async function deleteOutcomeSession(patientId: string, session: OutcomeSession): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, 'outcomes'),
      where('patientId', '==', patientId),
      where('session',   '==', session)
    )
  )
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
}
