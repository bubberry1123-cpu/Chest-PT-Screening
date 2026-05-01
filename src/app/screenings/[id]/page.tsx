'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getScreeningById } from '@/lib/localstore'
import type { Screening } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'

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
  const [screening, setScreening] = useState<Screening | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getScreeningById(id).then(s => {
      setScreening(s)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
  if (!screening) return <div className="text-center py-16 text-slate-400">ไม่พบข้อมูลการประเมิน</div>

  const date = screening.assessedAt instanceof Date
    ? screening.assessedAt.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'ไม่ทราบวันที่'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <Link href={`/patients/${screening.patientId}`} className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm text-sm text-slate-600">
        <div className="font-mono">HN: {screening.patientHn}</div>
        <div className="mt-0.5">Location: {screening.location} • {date}</div>
        {screening.assessedBy && <div className="mt-0.5">ผู้ประเมิน: {screening.assessedBy}</div>}
      </div>

      <SeverityBadge level={screening.overallLevel} size="lg" />

      {/* Level name + Goal */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 my-4 shadow-sm">
        <div className="text-xs text-slate-500 mb-0.5">Level</div>
        <div className="text-lg font-bold text-slate-800 mb-2">{screening.levelName}</div>
        <div className="text-xs text-slate-500 mb-0.5">Goal</div>
        <div className="text-sm text-slate-700">{screening.goal}</div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-4 gap-3 mb-4 text-center text-sm">
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">CFS</div>
          <div className="font-bold text-xl text-slate-800">{screening.cfsScore}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">Code F / R</div>
          <div className="font-bold text-base text-blue-700 mt-0.5">F{screening.fLevel} / R{screening.rLevel}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">Driver</div>
          <div className="font-bold text-xs mt-1 text-slate-700 leading-tight">{DRIVER_LABELS[screening.driver]}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">Program</div>
          <div className={`font-bold text-sm mt-1 ${screening.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}`}>
            {screening.programType}
          </div>
        </div>
      </div>

      {/* Clinical info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-slate-700 mb-3">ข้อมูล Clinical</h3>
        <div className="space-y-0">
          <div className="flex justify-between py-1.5 border-b border-slate-100 text-sm">
            <span className="text-slate-500">Ability to Follow Commands</span>
            <span className={`font-medium ${screening.cooperativeness === 'non_cooperative' ? 'text-red-600' : 'text-green-700'}`}>
              {COOP_LABELS[screening.cooperativeness]}
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">O2 Support</span>
            <span className="font-medium">{O2_LABELS[screening.o2Support]}</span>
          </div>
        </div>
        {screening.notes && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
            <span className="text-slate-500">หมายเหตุ: </span>{screening.notes}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-slate-700 mb-3">Outcome Measurements</h3>
        <ul className="space-y-1.5">
          {screening.outcomeMeasurements.map(m => (
            <li key={m} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-green-500 font-bold">✓</span>{m}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3">PT Program</h3>
        <ul className="space-y-1.5">
          {screening.rehabProgram.map(p => (
            <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="text-blue-500 mt-0.5">•</span>{p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
