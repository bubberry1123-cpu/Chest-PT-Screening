'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from './firebase'
import { getUserProfile } from './authStore'
import type { UserProfile } from '@/types'

interface AuthContextType {
  firebaseUser: User | null
  userProfile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  isActive: boolean
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
  isAdmin: false,
  isActive: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        const profile = await getUserProfile(user.uid)
        setUserProfile(profile)
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const isAdmin = userProfile?.role === 'admin' && userProfile?.status === 'active'
  const isActive = userProfile?.status === 'active'

  return (
    <AuthContext.Provider value={{ firebaseUser, userProfile, loading, isAdmin, isActive }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
