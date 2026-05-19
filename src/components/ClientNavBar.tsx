'use client'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { signOut } from '@/lib/authStore'

export default function ClientNavBar() {
  const { isAdmin, userProfile } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isPublic = pathname === '/login' || pathname === '/register' || pathname === '/setup'
  if (isPublic) return null

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  const linkClass = (active?: boolean) =>
    `px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${active ? 'text-white bg-[#185FA5]' : 'text-blue-200 hover:text-white hover:bg-[#185FA5]'}`

  return (
    <nav className="ml-auto flex items-center gap-1">
      {isAdmin && (
        <span className="text-[10px] bg-amber-400 text-amber-900 font-bold px-2 py-0.5 rounded-full mr-1 whitespace-nowrap">
          Admin
        </span>
      )}
      {userProfile && (
        <span className="text-xs text-blue-200 mr-2 hidden sm:block">
          {userProfile.displayName}
        </span>
      )}
      <Link href="/" className={linkClass(pathname === '/')}>Patients</Link>
      {isAdmin && (
        <Link href="/admin" className={linkClass(pathname === '/admin')}>Admin</Link>
      )}
      <button onClick={handleSignOut}
        className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-[#185FA5] rounded-lg transition-colors whitespace-nowrap">
        Sign out
      </button>
    </nav>
  )
}
