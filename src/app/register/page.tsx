'use client'
import { useState } from 'react'
import Link from 'next/link'
import { signUp } from '@/lib/authStore'
import { signOut } from '@/lib/authStore'

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', displayName: '', employeeId: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      await signUp(form.email, form.password, form.displayName, form.employeeId || undefined)
      await signOut()
      setDone(true)
    } catch (err: unknown) {
      console.error('[Register] signUp error:', err)
      const code = (err as { code?: string })?.code
      const msg = (err as { message?: string })?.message ?? ''
      if (code === 'auth/email-already-in-use') setError('This email is already registered.')
      else if (code === 'auth/invalid-email') setError('Invalid email address.')
      else if (code === 'auth/weak-password') setError('Password is too weak. Use at least 6 characters.')
      else if (code === 'auth/operation-not-allowed') setError('Email/Password sign-in is not enabled. Please contact the administrator.')
      else if (code === 'auth/network-request-failed') setError('Network error. Check your connection and try again.')
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Please wait a moment and try again.')
      else if (code) setError(`Registration failed (${code}). Please try again.`)
      else setError(`Registration failed: ${msg || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Registration Submitted</h2>
          <p className="text-slate-500 text-sm">Waiting for admin approval. You will be notified once your account is activated.</p>
          <Link href="/login" className="mt-6 inline-block bg-[#0C447C] hover:bg-[#185FA5] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors">
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <span className="text-5xl">🫁</span>
        <h1 className="text-xl font-bold text-[#0C447C] mt-3">Chest PT Screening</h1>
        <p className="text-slate-500 text-sm mt-1">Create your account</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-6">Register</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Full Name *</label>
            <input value={form.displayName} onChange={e => set('displayName', e.target.value)} required placeholder="Your full name"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Employee ID (optional)</label>
            <input value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="e.g. PT001"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="your@email.com"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password *</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Min 6 characters"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Confirm Password *</label>
            <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required placeholder="Re-enter password"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5]" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors mt-2">
            {loading ? 'Registering...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-[#0C447C] font-semibold hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
