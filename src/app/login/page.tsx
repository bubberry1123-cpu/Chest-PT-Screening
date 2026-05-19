'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/authStore'
import { getUserProfile } from '@/lib/authStore'
import { auth } from '@/lib/firebase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
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
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
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
