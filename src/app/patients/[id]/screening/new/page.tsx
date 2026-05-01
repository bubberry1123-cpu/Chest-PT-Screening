'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, createScreening } from '@/lib/localstore'
import { calculateScreening, CFS_DESCRIPTIONS } from '@/lib/scoring'
import type { Patient, O2Support, Cooperativeness, ScreeningInput } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'

const DRIVER_LABELS: Record<string, string> = {
  Functional: 'Functional (F > R)',
  Respiratory: 'Respiratory (R > F)',
  Equal: 'Equal (F = R)',
  'Non-Cooperative': 'Non-Cooperative',
}

export default function NewScreeningPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [clinical, setClinical] = useState<{
    cooperativeness: Cooperativeness | null
    cfsScore: number | null
    o2Support: O2Support | null
    assessedBy: string
    notes: string
  }>({
    cooperativeness: null, cfsScore: null, o2Support: null, assessedBy: '', notes: '',
  })

  useEffect(() => {
    getPatientById(id).then(setPatient)
  }, [id])

  const result = clinical.cooperativeness && clinical.cfsScore !== null && clinical.o2Support
    ? calculateScreening({
        cooperativeness: clinical.cooperativeness,
        cfsScore: clinical.cfsScore,
        o2Support: clinical.o2Support,
      })
    : null

  const handleSave = async () => {
    if (!clinical.cooperativeness) { setError('กรุณาเลือก Ability to Follow Commands'); return }
    if (!clinical.cfsScore) { setError('กรุณาเลือก CFS Score'); return }
    if (!clinical.o2Support) { setError('กรุณาเลือก Oxygen Support'); return }
    if (!patient) return
    setError('')
    setSaving(true)
    try {
      const input: ScreeningInput = {
        cooperativeness: clinical.cooperativeness,
        cfsScore: clinical.cfsScore,
        o2Support: clinical.o2Support,
      }
      const res = calculateScreening(input)
      await createScreening({
        patientId: id,
        patientHn: patient.hn,
        location: patient.location,
        assessedBy: clinical.assessedBy || 'PT',
        notes: clinical.notes,
        ...input,
        ...res,
      })
      setStep(2)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  if (!patient) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <Link href={`/patients/${id}`} className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-sm">
        <span className="font-semibold text-blue-800">{patient.firstName} {patient.lastName}</span>
        <span className="text-blue-600 ml-2 font-mono">HN: {patient.hn}</span>
        <span className="text-blue-600 ml-2">• {patient.location}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-lg text-sm mb-4">
          ⚠ {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {/* Cooperativeness */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">A. Ability to Follow Commands *</h3>
            <div className="grid grid-cols-2 gap-3">
              <button type="button"
                onClick={() => setClinical(c => ({ ...c, cooperativeness: 'fully_cooperative' }))}
                className={`py-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                  clinical.cooperativeness === 'fully_cooperative'
                    ? 'bg-green-600 border-green-600 text-white shadow'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-green-400 hover:bg-green-50'
                }`}>
                Fully Cooperative
                <div className={`text-xs mt-1 font-normal ${clinical.cooperativeness === 'fully_cooperative' ? 'text-green-100' : 'text-slate-400'}`}>
                  ทำตามคำสั่งได้
                </div>
              </button>
              <button type="button"
                onClick={() => setClinical(c => ({ ...c, cooperativeness: 'non_cooperative' }))}
                className={`py-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                  clinical.cooperativeness === 'non_cooperative'
                    ? 'bg-red-600 border-red-600 text-white shadow'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-red-400 hover:bg-red-50'
                }`}>
                Non-Cooperative
                <div className={`text-xs mt-1 font-normal ${clinical.cooperativeness === 'non_cooperative' ? 'text-red-100' : 'text-slate-400'}`}>
                  ทำตามคำสั่งไม่ได้ → Level 4
                </div>
              </button>
            </div>
          </div>

          {/* CFS */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">B. Clinical Frailty Scale (CFS) *</h3>
            <div className="space-y-1.5">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} type="button"
                  onClick={() => setClinical(c => ({ ...c, cfsScore: n }))}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 text-left transition-all ${
                    clinical.cfsScore === n
                      ? 'bg-blue-600 border-blue-600 text-white shadow'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                  }`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    clinical.cfsScore === n ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-600'
                  }`}>{n}</span>
                  <span className="font-medium text-sm">{CFS_DESCRIPTIONS[n].en}</span>
                  <span className={`text-xs ml-auto hidden sm:block ${clinical.cfsScore === n ? 'text-blue-100' : 'text-slate-400'}`}>
                    {CFS_DESCRIPTIONS[n].th.split(' — ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* O2 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">C. Oxygen Support *</h3>
            <div className="space-y-2.5">
              {([
                { value: 'room_air', label: 'Room Air', desc: 'หายใจเองได้ปกติ' },
                { value: 'low_flow', label: 'Low Flow', desc: '1–6 L/min' },
                { value: 'high_flow', label: 'High Flow', desc: '> 6 L/min (HFNC/Mask)' },
                { value: 'ventilator', label: 'Ventilator', desc: 'เครื่องช่วยหายใจ' },
              ] as const).map(opt => (
                <label key={opt.value}
                  className={`flex items-center gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                    clinical.o2Support === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}>
                  <input type="radio" name="o2" value={opt.value}
                    checked={clinical.o2Support === opt.value}
                    onChange={() => setClinical(c => ({ ...c, o2Support: opt.value }))}
                    className="text-blue-600" />
                  <div>
                    <span className="font-medium text-slate-800 text-sm">{opt.label}</span>
                    <span className="text-slate-500 text-xs ml-2">({opt.desc})</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Extra info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ผู้ประเมิน</label>
                <input type="text" value={clinical.assessedBy} placeholder="ชื่อ PT"
                  onChange={e => setClinical(c => ({ ...c, assessedBy: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <input type="text" value={clinical.notes} placeholder="–"
                  onChange={e => setClinical(c => ({ ...c, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>

          {result && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 text-sm text-slate-600 flex flex-wrap gap-4 items-center">
              <span className="font-semibold text-slate-800">{result.levelName}</span>
              <span>F{result.fLevel} / R{result.rLevel}</span>
              <span>Level {result.overallLevel}</span>
              <span className={result.driver === 'Non-Cooperative' ? 'text-red-600 font-medium' : result.programType === 'Standard' ? 'text-green-700 font-medium' : 'text-orange-700 font-medium'}>
                {result.driver}
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึกและดูผลลัพธ์ →'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && result && (
        <div className="space-y-4">
          <SeverityBadge level={result.overallLevel} size="lg" />

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-0.5">Goal</div>
              <div className="text-sm text-slate-700 font-medium">{result.goal}</div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-500">CFS</div>
                <div className="font-bold text-lg">{clinical.cfsScore}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-500">Code F / R</div>
                <div className="font-bold text-lg text-blue-700">F{result.fLevel} / R{result.rLevel}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-500">Driver</div>
                <div className="font-bold text-xs mt-1 text-slate-700">{DRIVER_LABELS[result.driver]}</div>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${result.programType === 'Standard' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {result.programType} Program
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-semibold text-slate-700 mb-2">Outcome Measurements</h4>
            <ul className="space-y-1">{result.outcomeMeasurements.map(m => (
              <li key={m} className="text-sm text-slate-700 flex items-center gap-2">
                <span className="text-green-500">✓</span>{m}
              </li>
            ))}</ul>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-semibold text-slate-700 mb-2">PT Program</h4>
            <ul className="space-y-1">{result.rehabProgram.map(p => (
              <li key={p} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-blue-500">•</span>{p}
              </li>
            ))}</ul>
          </div>

          <Link href={`/patients/${id}`}
            className="block text-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors">
            กลับหน้าผู้ป่วย
          </Link>
        </div>
      )}
    </div>
  )
}
