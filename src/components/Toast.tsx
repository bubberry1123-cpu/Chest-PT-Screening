'use client'
import type { ToastState } from '@/lib/useToast'

export default function Toast({ message, type, visible }: ToastState) {
  return (
    <div className={`fixed bottom-5 right-5 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold pointer-events-none transition-all duration-300 ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
    } ${type === 'success'
      ? 'bg-green-50 border-green-300 text-green-800'
      : 'bg-red-50 border-red-300 text-red-800'
    }`}>
      <span>{type === 'success' ? '✓' : '⚠'}</span>
      {message}
    </div>
  )
}
