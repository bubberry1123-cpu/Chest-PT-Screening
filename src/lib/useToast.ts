'use client'
import { useState, useCallback, useRef, useEffect } from 'react'

export interface ToastState {
  message: string
  type: 'success' | 'error'
  visible: boolean
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (hideRef.current) clearTimeout(hideRef.current)
    if (removeRef.current) clearTimeout(removeRef.current)
  }, [])

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (hideRef.current) clearTimeout(hideRef.current)
    if (removeRef.current) clearTimeout(removeRef.current)
    setToast({ message, type, visible: true })
    hideRef.current = setTimeout(() => {
      setToast(prev => prev ? { ...prev, visible: false } : null)
      removeRef.current = setTimeout(() => setToast(null), 300)
    }, 3000)
  }, [])

  return { toast, showToast }
}
