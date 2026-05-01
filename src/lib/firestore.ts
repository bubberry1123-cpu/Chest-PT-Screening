import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Patient, Screening } from '@/types'

// ---- Patients ----

export async function createPatient(data: Omit<Patient, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'patients'), {
    ...data,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function getPatientByHn(hn: string): Promise<Patient | null> {
  const q = query(collection(db, 'patients'), where('hn', '==', hn))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Patient
}

export async function searchPatients(term: string): Promise<Patient[]> {
  const snap = await getDocs(collection(db, 'patients'))
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient))
  const t = term.toLowerCase()
  return all.filter(p =>
    p.hn.toLowerCase().includes(t) ||
    p.firstName.toLowerCase().includes(t) ||
    p.lastName.toLowerCase().includes(t)
  )
}

export async function getAllPatients(): Promise<Patient[]> {
  const q = query(collection(db, 'patients'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient))
}

export async function getPatientById(id: string): Promise<Patient | null> {
  const ref = doc(db, 'patients', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Patient
}

export async function updatePatient(id: string, data: Partial<Patient>): Promise<void> {
  await updateDoc(doc(db, 'patients', id), data)
}

// ---- Screenings ----

export async function createScreening(data: Omit<Screening, 'id' | 'assessedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'screenings'), {
    ...data,
    assessedAt: Timestamp.now(),
  })
  return ref.id
}

export async function getScreeningsByPatient(patientId: string): Promise<Screening[]> {
  const q = query(
    collection(db, 'screenings'),
    where('patientId', '==', patientId),
    orderBy('assessedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      assessedAt: data.assessedAt?.toDate(),
    } as Screening
  })
}

export async function getScreeningById(id: string): Promise<Screening | null> {
  const ref = doc(db, 'screenings', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: snap.id,
    ...data,
    assessedAt: data.assessedAt?.toDate(),
  } as Screening
}
