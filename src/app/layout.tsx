import type { Metadata } from 'next'
import ClientNavBar from '@/components/ClientNavBar'
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
            <ClientNavBar />
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
