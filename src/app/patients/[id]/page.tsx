'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient } from '@/lib/firestore'
import type { Patient, Screening } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'

export default function PatientPage() {
  const { id } = useParams<{ id: string }>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getPatientById(id),
      getScreeningsByPatient(id),
    ]).then(([p, s]) => {
      setPatient(p)
      setScreenings(s)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
  if (!patient) return <div className="text-center py-16 text-slate-400">ไม่พบผู้ป่วย</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      </div>

      {/* Patient Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{patient.firstName} {patient.lastName}</h2>
            <p className="text-slate-500 text-sm mt-0.5 font-mono">HN: {patient.hn}</p>
          </div>
          <Link href={`/patients/${id}/screening/new`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
            + ประเมินใหม่
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">อายุ</div>
            <div className="font-semibold text-slate-800">{patient.age} ปี</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">สัญชาติ</div>
            <div className="font-semibold text-slate-800">{patient.nationality}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">Ward</div>
            <div className="font-semibold text-slate-800">{patient.ward}</div>
          </div>
        </div>
      </div>

      {/* Screening History */}
      <h3 className="font-semibold text-slate-700 mb-3">ประวัติการประเมิน ({screenings.length} ครั้ง)</h3>
      {screenings.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">
          ยังไม่มีประวัติการประเมิน
        </div>
      ) : (
        <div className="space-y-3">
          {screenings.map(s => (
            <Link key={s.id} href={`/screenings/${s.id}`}
              className="block bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-blue-300 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-500 mb-1">
                    {s.assessedAt instanceof Date
                      ? s.assessedAt.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'ไม่ทราบวันที่'}
                    {s.assessedBy && <span className="ml-2">โดย {s.assessedBy}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span>CFS: {s.cfsScore}</span>
                    <span>F{s.fLevel}</span>
                    <span>R{s.rLevel}</span>
                    <span className={s.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}>
                      {s.programType}
                    </span>
                  </div>
                </div>
                <SeverityBadge level={s.overallLevel} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
