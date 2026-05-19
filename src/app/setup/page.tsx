'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { signOut } from '@/lib/authStore'

export default function SetupPage() {
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    displayName: '', employeeId: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      setResult({ success: false, message: 'Passwords do not match.' })
      return
    }
    if (form.password.length < 6) {
      setResult({ success: false, message: 'Password must be at least 6 characters.' })
      return
    }
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
      setResult({ success: true, message: `Admin account created for ${form.email}. You can now log in.` })
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/email-already-in-use') {
        setResult({ success: false, message: 'This email is already registered in Firebase Auth. If this is your account, go to Firebase Console → Firestore → users collection and set role: "admin", status: "active" manually.' })
      } else if (code === 'auth/operation-not-allowed') {
        setResult({ success: false, message: 'Email/Password sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method → Email/Password → Enable.' })
      } else {
        setResult({ success: false, message: `Error: ${code ?? String(err)}` })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <span className="text-4xl">⚙️</span>
        <h1 className="text-xl font-bold text-[#0C447C] mt-3">Admin Setup</h1>
        <p className="text-slate-500 text-sm mt-1">Create the first administrator account</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-sm">
        {result ? (
          <div>
            <div className={`px-4 py-3 rounded-xl text-sm mb-5 ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.message}
            </div>
            {result.success ? (
              <Link href="/login"
                className="block text-center w-full bg-[#0C447C] hover:bg-[#185FA5] text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
                Go to Login →
              </Link>
            ) : (
              <button onClick={() => setResult(null)}
                className="w-full border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm hover:bg-slate-50 transition-colors">
                Try Again
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Full Name *</label>
              <input value={form.displayName} onChange={e => set('displayName', e.target.value)} required
                placeholder="ชื่อ-นามสกุล"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Employee ID</label>
              <input value={form.employeeId} onChange={e => set('employeeId', e.target.value)}
                placeholder="e.g. PT001"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                placeholder="your@email.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password *</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required
                placeholder="Min 6 characters"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Confirm Password *</label>
              <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required
                placeholder="Re-enter password"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors mt-2">
              {loading ? 'Creating...' : 'Create Admin Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
