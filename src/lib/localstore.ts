'use client'
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, deleteDoc, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { logActivity } from './authStore'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession, LocationHistoryEntry } from '@/types'

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
  try { await logActivity('Added patient', 'patient', ref.id, `HN: ${data.hn}`) } catch {}
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
  try { await logActivity('Added screening', 'screening', ref.id, `HN: ${data.patientHn}`) } catch {}
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
  const docId = `${data.patientId}_${data.session.replace(/\s+/g, '_')}`
  const ref = doc(db, 'outcomes', docId)
  console.log('[saveOutcome] writing to:', ref.path, 'data:', JSON.stringify(data))
  await setDoc(ref, { ...data, recordedAt: serverTimestamp() }, { merge: true })
  console.log('[saveOutcome] success:', docId)
  try { await logActivity('Saved outcome', 'outcome', docId, `HN: ${data.patientHn} [${data.session}]`) } catch {}
  return docId
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
  const [screeningsSnap, outcomesSnap, locationHistorySnap] = await Promise.all([
    getDocs(query(collection(db, 'screenings'),       where('patientId', '==', id))),
    getDocs(query(collection(db, 'outcomes'),          where('patientId', '==', id))),
    getDocs(query(collection(db, 'locationHistory'),   where('patientId', '==', id))),
  ])
  const batch = writeBatch(db)
  screeningsSnap.docs.forEach(d => batch.delete(d.ref))
  outcomesSnap.docs.forEach(d => batch.delete(d.ref))
  locationHistorySnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'patients', id))
  await batch.commit()
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

// ── LOCATION HISTORY ──────────────────────────────────────────────────────────

export async function getLocationHistory(patientId: string): Promise<LocationHistoryEntry[]> {
  const snap = await getDocs(
    query(collection(db, 'locationHistory'), where('patientId', '==', patientId))
  )
  const results = snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, changedAt: toDate(data.changedAt) } as LocationHistoryEntry
  })
  return results.sort((a, b) => (b.changedAt?.getTime() ?? 0) - (a.changedAt?.getTime() ?? 0))
}

export async function addLocationHistory(
  entry: Omit<LocationHistoryEntry, 'id' | 'changedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'locationHistory'), {
    ...entry,
    changedAt: serverTimestamp(),
  })
  return ref.id
}

export async function ensureLocationHistory(
  patientId: string,
  patientHn: string,
  currentLocation: string,
  createdAt?: Date
): Promise<void> {
  const existing = await getDocs(
    query(collection(db, 'locationHistory'), where('patientId', '==', patientId), limit(1))
  )
  if (!existing.empty) return
  await addDoc(collection(db, 'locationHistory'), {
    patientId,
    patientHn,
    from: null,
    to: currentLocation,
    changedAt: createdAt ? Timestamp.fromDate(createdAt) : serverTimestamp(),
    changedBy: 'system (migration)',
  })
}

export async function updatePatientLocation(
  patientId: string,
  patientHn: string,
  newLocation: string,
  changedBy: string,
  previousLocation: string
): Promise<void> {
  await setDoc(doc(db, 'patients', patientId), { location: newLocation }, { merge: true })
  await addDoc(collection(db, 'locationHistory'), {
    patientId,
    patientHn,
    from: previousLocation || null,
    to: newLocation,
    changedAt: serverTimestamp(),
    changedBy,
  })
}
