'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { signOut } from '@/lib/authStore'

// ── Fix existing account → admin ──────────────────────────────────────────────
function FixAdminSection() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleFix = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      // Sign in to get the uid
      const cred = await signInWithEmailAndPassword(auth, email, password)
      const uid = cred.user.uid

      // Check if Firestore profile exists
      const snap = await getDoc(doc(db, 'users', uid))

      if (snap.exists()) {
        // Update existing profile
        await setDoc(doc(db, 'users', uid), { role: 'admin', status: 'active' }, { merge: true })
        setResult({ success: true, message: `Updated! ${email} is now admin/active.` })
      } else {
        // Create new profile
        await setDoc(doc(db, 'users', uid), {
          uid,
          email,
          displayName: displayName || email,
          employeeId: employeeId || '',
          role: 'admin',
          status: 'active',
          createdAt: serverTimestamp(),
        })
        setResult({ success: true, message: `Created Firestore profile for ${email} as admin/active.` })
      }

      await signOut()
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setResult({ success: false, message: 'Incorrect email or password.' })
      } else if (code === 'auth/user-not-found') {
        setResult({ success: false, message: 'No Firebase Auth account found for this email. Create one first using the form above.' })
      } else {
        setResult({ success: false, message: `Error: ${code ?? String(err)}` })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#BBF7D0] shadow-sm p-6 w-full max-w-sm">
      <h2 className="text-base font-bold text-[#166534] mb-1">Fix Existing Account → Admin</h2>
      <p className="text-xs text-slate-500 mb-4">Sign in แล้ว set role=admin, status=active ให้อัตโนมัติ</p>

      {result ? (
        <div>
          <div className={`px-4 py-3 rounded-xl text-sm mb-4 ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {result.message}
          </div>
          {result.success ? (
            <Link href="/login" className="block text-center w-full bg-[#0C447C] hover:bg-[#185FA5] text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
              Go to Login →
            </Link>
          ) : (
            <button onClick={() => setResult(null)} className="w-full border border-slate-200 text-slate-600 py-2 rounded-xl text-sm hover:bg-slate-50">
              Try Again
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleFix} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="Email *"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            placeholder="Password *"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="Full Name (ถ้ายังไม่มี profile)"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input value={employeeId} onChange={e => setEmployeeId(e.target.value)}
            placeholder="Employee ID (optional)"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <button type="submit" disabled={loading}
            className="w-full bg-[#166534] hover:bg-[#15803D] disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
            {loading ? 'Processing...' : 'Set as Admin'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Create new admin account ──────────────────────────────────────────────────
function CreateAdminSection() {
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    displayName: '', employeeId: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) { setResult({ success: false, message: 'Passwords do not match.' }); return }
    if (form.password.length < 6) { setResult({ success: false, message: 'Password must be at least 6 characters.' }); return }
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: form.email,
        displayName: form.displayName,
        employeeId: form.employeeId || '',
        role: 'admin',
        status: 'active',
        createdAt: serverTimestamp(),
      })
      await signOut()
      setResult({ success: true, message: `Admin account created for ${form.email}.` })
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/email-already-in-use') setResult({ success: false, message: 'Email already exists. Use "Fix Existing Account" below instead.' })
      else if (code === 'auth/operation-not-allowed') setResult({ success: false, message: 'Enable Email/Password in Firebase Console → Authentication → Sign-in method first.' })
      else setResult({ success: false, message: `Error: ${code ?? String(err)}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 w-full max-w-sm">
      <h2 className="text-base font-bold text-slate-800 mb-1">Create New Admin Account</h2>
      <p className="text-xs text-slate-500 mb-4">สร้าง Firebase Auth user ใหม่ + Firestore profile</p>

      {result ? (
        <div>
          <div className={`px-4 py-3 rounded-xl text-sm mb-4 ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {result.message}
          </div>
          {result.success ? (
            <Link href="/login" className="block text-center w-full bg-[#0C447C] hover:bg-[#185FA5] text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
              Go to Login →
            </Link>
          ) : (
            <button onClick={() => setResult(null)} className="w-full border border-slate-200 text-slate-600 py-2 rounded-xl text-sm hover:bg-slate-50">Try Again</button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input value={form.displayName} onChange={e => set('displayName', e.target.value)} required placeholder="Full Name *"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="Employee ID (optional)"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="Email *"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Password *"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required placeholder="Confirm Password *"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          <button type="submit" disabled={loading}
            className="w-full bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
            {loading ? 'Creating...' : 'Create Admin Account'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Main Setup Page ───────────────────────────────────────────────────────────
export default function SetupPage() {
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4 gap-5">
      <div className="text-center">
        <span className="text-4xl">⚙️</span>
        <h1 className="text-xl font-bold text-[#0C447C] mt-3">Admin Setup</h1>
        <p className="text-slate-500 text-sm mt-1">ใช้หน้านี้ครั้งแรกเพื่อตั้งค่า admin account</p>
      </div>

      {/* Fix existing account first (most common case) */}
      <FixAdminSection />

      <div className="flex items-center gap-3 w-full max-w-sm">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">หรือ</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <CreateAdminSection />

      <Link href="/login" className="text-sm text-slate-400 hover:text-slate-600">← Back to Login</Link>
    </div>
  )
}
