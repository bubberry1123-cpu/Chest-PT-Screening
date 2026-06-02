'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

const PUBLIC_PATHS = ['/login', '/register', '/setup']

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, userProfile, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (loading) return
    if (isPublic) return
    if (!firebaseUser) {
      router.replace('/login')
      return
    }
    if (userProfile?.mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password')
    }
  }, [loading, firebaseUser, userProfile, isPublic, router, pathname])

  if (isPublic) return <>{children}</>

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (!firebaseUser) return null

  if (userProfile?.mustChangePassword && pathname !== '/change-password') return null

  if (userProfile?.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9] p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Pending Approval</h2>
          <p className="text-slate-500 text-sm">Your account is pending admin approval. Please wait.</p>
          <button onClick={() => { import('@/lib/authStore').then(m => m.signOut()).then(() => router.replace('/login')) }}
            className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline">Sign out</button>
        </div>
      </div>
    )
  }

  if (userProfile?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9] p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Account Rejected</h2>
          <p className="text-slate-500 text-sm">Your account has been rejected. Contact the administrator.</p>
          <button onClick={() => { import('@/lib/authStore').then(m => m.signOut()).then(() => router.replace('/login')) }}
            className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline">Sign out</button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
