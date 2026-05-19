'use client'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, getDocs, collection, query, orderBy, limit,
  serverTimestamp, Timestamp, where, addDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import type { UserProfile, ActivityLog } from '@/types'

function toDate(val: unknown): Date | undefined {
  if (!val) return undefined
  if (val instanceof Timestamp) return val.toDate()
  if (val instanceof Date) return val
  return new Date(val as string)
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password)
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  employeeId?: string
): Promise<string> {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  const uid = cred.user.uid
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    displayName,
    employeeId: employeeId || '',
    role: 'staff',
    status: 'pending',
    createdAt: serverTimestamp(),
  })
  return uid
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

export async function updatePassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Not authenticated')
  await firebaseUpdatePassword(auth.currentUser, newPassword)
}

// ── USER PROFILE ──────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const d = snap.data()
  return { ...d, uid: snap.id, createdAt: toDate(d.createdAt) } as UserProfile
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'asc')))
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, uid: d.id, createdAt: toDate(data.createdAt) } as UserProfile
  })
}

export async function approveUser(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { status: 'active' }, { merge: true })
}

export async function rejectUser(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { status: 'rejected' }, { merge: true })
}

export async function changeUserRole(uid: string, role: 'admin' | 'staff'): Promise<void> {
  await setDoc(doc(db, 'users', uid), { role }, { merge: true })
}

export async function deactivateUser(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { status: 'rejected' }, { merge: true })
}

// ── ACTIVITY LOG ──────────────────────────────────────────────────────────────

export async function logActivity(
  action: string,
  entityType: ActivityLog['entityType'],
  entityId: string,
  entityLabel: string
): Promise<void> {
  const user = auth.currentUser
  if (!user) return
  const profile = await getUserProfile(user.uid)
  await addDoc(collection(db, 'activityLogs'), {
    userId: user.uid,
    userEmail: user.email ?? '',
    userName: profile?.displayName ?? user.email ?? '',
    action,
    entityType,
    entityId,
    entityLabel,
    timestamp: serverTimestamp(),
  })
}

export async function getActivityLogs(limitCount = 100): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(limitCount))
  )
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, timestamp: toDate(data.timestamp) } as ActivityLog
  })
}

// ── DEFAULT ADMIN SETUP ───────────────────────────────────────────────────────

export async function createDefaultAdmin(): Promise<{ success: boolean; message: string }> {
  const email = 'admin@chestpt.com'
  const password = 'Admin2813'
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName: 'Administrator',
      employeeId: 'ADMIN001',
      role: 'admin',
      status: 'active',
      createdAt: serverTimestamp(),
    })
    await firebaseSignOut(auth)
    return { success: true, message: 'Default admin created. You can now log in with admin@chestpt.com / Admin2813' }
  } catch (err: unknown) {
    const msg = (err as { code?: string })?.code
    if (msg === 'auth/email-already-in-use') {
      return { success: true, message: 'Admin account already exists.' }
    }
    return { success: false, message: String(err) }
  }
}
