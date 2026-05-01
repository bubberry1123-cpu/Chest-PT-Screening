'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getScreeningById } from '@/lib/localstore'
import type { Screening } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'

const O2_LABELS: Record<string, string> = {
  room_air: 'Room Air',
  low_flow: 'Low Flow',
  high_flow: 'High Flow',
  ventilator: 'Ventilator',
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
        <div className="mt-0.5">Ward: {screening.ward} • {date}</div>
        {screening.assessedBy && <div className="mt-0.5">ผู้ประเมิน: {screening.assessedBy}</div>}
      </div>

      <SeverityBadge level={screening.overallLevel} size="lg" />

      <div className="grid grid-cols-4 gap-3 my-4 text-center text-sm">
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">CFS</div>
          <div className="font-bold text-xl text-slate-800">{screening.cfsScore}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">F Level</div>
          <div className="font-bold text-xl text-blue-700">F{screening.fLevel}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">R Level</div>
          <div className="font-bold text-xl text-blue-700">R{screening.rLevel}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-500">Program</div>
          <div className={`font-bold text-sm mt-1 ${screening.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}`}>
            {screening.programType}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-slate-700 mb-3">ข้อมูล Clinical</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-500">O2 Support</span>
            <span className="font-medium">{O2_LABELS[screening.o2Support]}</span>
          </div>
          {screening.peakCoughFlow && (
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Peak Cough Flow</span>
              <span className="font-medium">{screening.peakCoughFlow} L/min</span>
            </div>
          )}
          {screening.abgPaO2 && (
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">ABG PaO₂</span>
              <span className="font-medium">{screening.abgPaO2} mmHg</span>
            </div>
          )}
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-500">mMRC Dyspnea</span>
            <span className="font-medium">Grade {screening.mmrcDyspnea}</span>
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
        <h3 className="font-semibold text-slate-700 mb-3">Rehabilitation Program</h3>
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
