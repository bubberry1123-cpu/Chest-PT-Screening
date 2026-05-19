'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createDefaultAdmin } from '@/lib/authStore'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSetup = async () => {
    setLoading(true)
    const res = await createDefaultAdmin()
    setResult(res)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">⚙️</div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">System Setup</h2>
        <p className="text-slate-500 text-sm mb-6">Create the default administrator account.<br/>
          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block">admin@chestpt.com / Admin2813</span>
        </p>
        {result ? (
          <div className={`px-4 py-3 rounded-xl text-sm mb-4 ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {result.message}
          </div>
        ) : (
          <button onClick={handleSetup} disabled={loading}
            className="w-full bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
            {loading ? 'Creating...' : 'Create Default Admin'}
          </button>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm text-[#0C447C] hover:underline">
          Go to Login →
        </Link>
      </div>
    </div>
  )
}
