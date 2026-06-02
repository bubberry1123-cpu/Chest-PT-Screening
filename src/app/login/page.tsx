'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, getUserProfile, sendPasswordReset } from '@/lib/authStore'
import { auth } from '@/lib/firebase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Forgot password state
  const [showForgotPw, setShowForgotPw] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [resetError, setResetError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      const user = auth.currentUser
      if (user) {
        const profile = await getUserProfile(user.uid)
        if (profile?.status === 'pending') {
          setError('Your account is pending admin approval.')
          await import('@/lib/authStore').then(m => m.signOut())
          setLoading(false)
          return
        }
        if (profile?.status === 'rejected') {
          setError('Your account has been rejected. Contact the administrator.')
          await import('@/lib/authStore').then(m => m.signOut())
          setLoading(false)
          return
        }
      }
      router.replace('/')
    } catch {
      setError('Invalid email or password.')
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    try {
      await sendPasswordReset(resetEmail)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/invalid-email') {
        setResetError('Please enter a valid email address.')
        setResetLoading(false)
        return
      }
      // Swallow all other errors (including auth/user-not-found) to avoid revealing registered emails
    }
    setResetDone(true)
    setResetLoading(false)
  }

  const closeForgotPw = () => {
    setShowForgotPw(false)
    setResetEmail('')
    setResetDone(false)
    setResetError('')
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
      {/* ── Forgot Password Modal ──────────────────────────────────────────── */}
      {showForgotPw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) closeForgotPw() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {resetDone ? (
              <>
                <div className="text-center mb-4">
                  <div className="text-4xl mb-3">📬</div>
                  <h3 className="text-base font-bold text-slate-800">Check your inbox</h3>
                </div>
                <p className="text-sm text-slate-600 text-center mb-6">
                  If an account exists for <span className="font-medium">{resetEmail}</span>, a password reset link has been sent. Please check your inbox (and spam folder).
                </p>
                <button
                  onClick={closeForgotPw}
                  className="w-full bg-[#0C447C] hover:bg-[#185FA5] text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-slate-800 mb-1">Reset Password</h3>
                <p className="text-sm text-slate-500 mb-5">Enter your email and we&apos;ll send you a reset link.</p>
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    autoFocus
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5]/20"
                  />
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs">
                      {resetError}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeForgotPw}
                      className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="flex-1 bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
                    >
                      {resetLoading ? 'Sending…' : 'Send Link'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-8 text-center">
        <span className="text-5xl">🫁</span>
        <h1 className="text-xl font-bold text-[#0C447C] mt-3">Chest PT Screening</h1>
        <p className="text-slate-500 text-sm mt-1">Pulmonary Rehabilitation System</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-6">Sign In</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5]/20"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Password</label>
              <button
                type="button"
                onClick={() => { setShowForgotPw(true); setResetEmail(email) }}
                className="text-xs text-[#0C447C] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5]/20"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors mt-2">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-5">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#0C447C] font-semibold hover:underline">Register</Link>
        </p>
      </div>
    </div>
  )
}
