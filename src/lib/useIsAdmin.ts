'use client'
import { useAuth } from './auth-context'

export function useIsAdmin(): boolean {
  const { isAdmin } = useAuth()
  return isAdmin
}

// Keep for backward compat (no longer used but may be imported)
export const AUTH_KEY = 'cpt_admin_auth'
export const ADMIN_PASSWORD = '2813'
