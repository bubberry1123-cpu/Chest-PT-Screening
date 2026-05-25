'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getScreeningById, deleteScreening } from '@/lib/localstore'
import { useIsAdmin } from '@/lib/useIsAdmin'
import type { Screening } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'
import ConfirmDialog from '@/components/ConfirmDialog'

const O2_LABELS: Record<string, string> = {
  room_air: 'Room Air',
  low_flow: 'Low Flow (1–6 L/min)',
  high_flow: 'High Flow (> 6 L/min)',
  ventilator: 'Ventilator',
}

const COOP_LABELS: Record<string, string> = {
  fully_cooperative: 'Fully Cooperative',
  non_cooperative: 'Non-Cooperative',
}

const DRIVER_LABELS: Record<string, string> = {
  Functional: 'Functional (F > R)',
  Respiratory: 'Respiratory (R > F)',
  Equal: 'Equal (F = R)',
  'Non-Cooperative': 'Non-Cooperative',
}

export default function ScreeningDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [screening, setScreening] = useState<Screening | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    getScreeningById(id)
      .then(s => { setScreening(s); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const handleDelete = async () => {
    if (!screening) return
    try {
      await deleteScreening(id)
      router.push(`/patients/${screening.patientId}`)
    } catch {
      alert('ลบไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  if (loading) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
  if (!screening) return <div className="text-center py-16 text-slate-400">ไม่พบข้อมูลการประเมิน</div>

  const screeningDate = screening.assessedAt instanceof Date
    ? screening.assessedAt.toLocaleDateString('th-TH')
    : 'นี้'

  const date = screening.assessedAt instanceof Date
    ? screening.assessedAt.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'ไม่ทราบวันที่'

  return (
    <div className="max-w-2xl mx-auto">
      {confirmOpen && (
        <ConfirmDialog
          title="ลบการประเมิน"
          message={`ลบการประเมินวันที่ ${screeningDate}?\nการกระทำนี้ไม่สามารถกู้คืนได้`}
          confirmLabel="ลบ"
          onConfirm={() => { setConfirmOpen(false); handleDelete() }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
      <div className="flex items-center justify-between gap-2 mb-5">
        <Link href={`/patients/${screening.patientId}`} className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
        {isAdmin && (
          <button onClick={() => setConfirmOpen(true)}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-xl transition-colors">
            ลบการประเมินนี้
          </button>
        )}
      </div>

      {/* Patient info banner */}
      <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-2xl p-4 mb-4 text-sm">
        <div className="font-mono text-[#1D4ED8] font-semibold">HN: {screening.patientHn}</div>
        <div className="mt-0.5 text-blue-600">Location: {screening.location} • {date}</div>
        {screening.assessedBy && <div className="mt-0.5 text-blue-600">ผู้ประเมิน: {screening.assessedBy}</div>}
      </div>

      {/* Severity badge */}
      <SeverityBadge level={screening.overallLevel} size="lg" />

      {/* Info grid: Cooperative | CFS | Code F/R | Program Type */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
          <div className="text-[10px] uppercase text-slate-400 tracking-wide">Cooperative</div>
          <div className={`text-sm font-medium mt-0.5 ${screening.cooperativeness === 'non_cooperative' ? 'text-red-600' : 'text-green-700'}`}>
            {COOP_LABELS[screening.cooperativeness]}
          </div>
        </div>
        <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
          <div className="text-[10px] uppercase text-slate-400 tracking-wide">CFS</div>
          <div className="text-sm font-medium text-slate-700 mt-0.5">{screening.cfsScore}</div>
        </div>
        <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
          <div className="text-[10px] uppercase text-slate-400 tracking-wide">Code F / R</div>
          <div className="text-sm font-medium text-[#0C447C] mt-0.5">F{screening.fLevel} / R{screening.rLevel}</div>
        </div>
        <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
          <div className="text-[10px] uppercase text-slate-400 tracking-wide">Program Type</div>
          <div className={`text-sm font-medium mt-0.5 ${screening.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}`}>
            {screening.programType}
          </div>
        </div>
      </div>

      {/* Goal */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 shadow-sm">
        <div className="text-[10px] uppercase text-slate-400 tracking-wide mb-1">Goal</div>
        <div className="text-sm font-medium text-slate-700">{screening.goal}</div>
      </div>

      {/* O2 Support + Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">ข้อมูล Clinical</h3>
        <div className="flex justify-between py-1.5 border-b border-slate-100 text-sm">
          <span className="text-slate-500">O2 Support</span>
          <span className="font-medium text-slate-700">{O2_LABELS[screening.o2Support]}</span>
        </div>
        <div className="flex justify-between py-1.5 text-sm">
          <span className="text-slate-500">Driver</span>
          <span className="font-medium text-slate-700">{DRIVER_LABELS[screening.driver]}</span>
        </div>
        {screening.notes && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
            <span className="text-slate-500">หมายเหตุ: </span>{screening.notes}
          </div>
        )}
      </div>

      {/* Outcome Measurements as chips */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">Outcome Measurements</h3>
        <div className="flex flex-wrap gap-2">
          {screening.outcomeMeasurements.map(m => (
            <span key={m} className="bg-[#F0F7FF] text-[#1D4ED8] border border-[#BFDBFE] rounded-full px-3 py-1 text-xs font-medium">
              ✓ {m}
            </span>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <Link href={`/patients/${screening.patientId}`}
          className="flex-1 text-center border border-slate-300 text-slate-600 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
          ← Back
        </Link>
        <Link href={`/patients/${screening.patientId}/outcome`}
          className="flex-1 text-center bg-[#0C447C] hover:bg-[#185FA5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
          Record Outcome →
        </Link>
      </div>
    </div>
  )
}
