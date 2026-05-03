import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chest PT Screening',
  description: 'ระบบ Screening ผู้ป่วย Chest Physical Therapy',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">
        <header className="bg-blue-700 text-white shadow-md">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🫁</span>
            <div>
              <h1 className="font-bold text-lg leading-tight">Chest PT Screening</h1>
              <p className="text-blue-200 text-xs">ระบบประเมินผู้ป่วย Pulmonary Rehabilitation</p>
            </div>
            <nav className="ml-auto flex items-center gap-1">
              <Link href="/" className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-blue-600 rounded-lg transition-colors">
                รายการผู้ป่วย
              </Link>
              <Link href="/admin" className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-blue-600 rounded-lg transition-colors font-semibold">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          {children}
        </main>
        <footer className="text-center text-slate-400 text-xs py-3 border-t border-slate-200">
          Chest PT Screening System
        </footer>
      </body>
    </html>
  )
}
