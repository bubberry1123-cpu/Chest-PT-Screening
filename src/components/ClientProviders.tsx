'use client'
import { AuthProvider } from '@/lib/auth-context'
import AuthGuard from './AuthGuard'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  )
}
