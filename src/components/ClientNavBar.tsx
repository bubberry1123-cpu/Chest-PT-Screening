'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AUTH_KEY } from '@/lib/useIsAdmin'

export default function ClientNavBar() {
  const [isAdmin, setIsAdmin] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(AUTH_KEY) === '1')
  }, [pathname])

  return (
    <nav className="ml-auto flex items-center gap-1">
      {isAdmin && (
        <span className="text-[10px] bg-amber-400 text-amber-900 font-bold px-2 py-0.5 rounded-full mr-1 whitespace-nowrap">
          Admin Mode
        </span>
      )}
      <Link href="/"
        className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap">
        รายการผู้ป่วย
      </Link>
      {isAdmin ? (
        <Link href="/admin"
          className="px-3 py-1.5 text-sm text-amber-300 hover:text-white hover:bg-blue-600 rounded-lg transition-colors font-semibold whitespace-nowrap">
          ⚙ Admin
        </Link>
      ) : (
        <Link href="/admin"
          className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap">
          Admin
        </Link>
      )}
    </nav>
  )
}
