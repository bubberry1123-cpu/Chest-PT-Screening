import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'

function getAdminServices() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
    initializeApp({ credential: cert(sa) })
  }
  return { adminAuth: getAuth(), db: getFirestore() }
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json()
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 })

    const authHeader = req.headers.get('Authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { adminAuth, db } = getAdminServices()

    // Verify caller is an admin
    const decoded = await adminAuth.verifyIdToken(idToken)
    const callerSnap = await db.collection('users').doc(decoded.uid).get()
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tempPassword = generateTempPassword()
    await adminAuth.updateUser(uid, { password: tempPassword })
    await db.collection('users').doc(uid).set({ mustChangePassword: true }, { merge: true })

    return NextResponse.json({ ok: true, tempPassword })
  } catch (err) {
    console.error('[reset-password]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
