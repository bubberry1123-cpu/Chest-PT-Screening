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

  const linkCls = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
      active
        ? 'text-white bg-[#185FA5]'
        : 'text-blue-200 hover:text-white hover:bg-[#185FA5]'
    }`

  return (
    <nav className="ml-auto flex items-center gap-1">
      {isAdmin && (
        <span className="text-[10px] bg-amber-400 text-amber-900 font-bold px-2 py-0.5 rounded-full mr-1 whitespace-nowrap">
          Admin Mode
        </span>
      )}
      <Link href="/" className={linkCls(pathname === '/')}>
        Patients
      </Link>
      <Link href="/" className={linkCls(false)}>
        Outcomes
      </Link>
      {isAdmin ? (
        <Link href="/admin"
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors font-semibold whitespace-nowrap ${
            pathname === '/admin'
              ? 'text-white bg-[#185FA5]'
              : 'text-amber-300 hover:text-white hover:bg-[#185FA5]'
          }`}>
          Admin
        </Link>
      ) : (
        <Link href="/admin" className={linkCls(pathname === '/admin')}>
          Admin
        </Link>
      )}
    </nav>
  )
}
