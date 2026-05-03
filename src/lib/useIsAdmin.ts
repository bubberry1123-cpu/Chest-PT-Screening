import { useState, useEffect } from 'react'

export const AUTH_KEY = 'cpt_admin_auth'
export const ADMIN_PASSWORD = '2813'

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(AUTH_KEY) === '1')
  }, [])
  return isAdmin
}
