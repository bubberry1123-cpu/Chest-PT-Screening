'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, createScreening } from '@/lib/localstore'
import { calculateScreening, CFS_DESCRIPTIONS, STEP_UP_CRITERIA } from '@/lib/scoring'
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
    getPatientById(id).then(setPatient).catch(() => setPatient(null))
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

      <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-2xl p-3 mb-5 text-sm">
        <span className="font-semibold text-[#1D4ED8]">{patient.firstName} {patient.lastName}</span>
        <span className="text-blue-600 ml-2 font-mono">HN: {patient.hn}</span>
        <span className="text-blue-600 ml-2">• {patient.location}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-xl text-sm mb-4">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {/* Cooperativeness */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">B. Clinical Frailty Scale (CFS) *</h3>
            <div className="space-y-1.5">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} type="button"
                  onClick={() => setClinical(c => ({ ...c, cfsScore: n }))}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-all ${
                    clinical.cfsScore === n
                      ? 'bg-[#0C447C] border-[#0C447C] text-white shadow'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-[#185FA5] hover:bg-blue-50'
                  }`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    clinical.cfsScore === n ? 'bg-white text-[#0C447C]' : 'bg-slate-100 text-slate-600'
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">C. Oxygen Support *</h3>
            <div className="space-y-2.5">
              {([
                { value: 'room_air', label: 'Room Air', desc: 'หายใจเองได้ปกติ' },
                { value: 'low_flow', label: 'Low Flow', desc: '1–6 L/min' },
                { value: 'high_flow', label: 'High Flow', desc: '> 6 L/min (HFNC/Mask)' },
                { value: 'ventilator', label: 'Ventilator', desc: 'เครื่องช่วยหายใจ' },
              ] as const).map(opt => (
                <label key={opt.value}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    clinical.o2Support === opt.value
                      ? 'border-[#185FA5] bg-blue-50'
                      : 'border-slate-200 hover:border-[#185FA5]'
                  }`}>
                  <input type="radio" name="o2" value={opt.value}
                    checked={clinical.o2Support === opt.value}
                    onChange={() => setClinical(c => ({ ...c, o2Support: opt.value }))}
                    className="text-[#0C447C]" />
                  <div>
                    <span className="font-medium text-slate-800 text-sm">{opt.label}</span>
                    <span className="text-slate-500 text-xs ml-2">({opt.desc})</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Extra info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ผู้ประเมิน</label>
                <input type="text" value={clinical.assessedBy} placeholder="ชื่อ PT"
                  onChange={e => setClinical(c => ({ ...c, assessedBy: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#185FA5]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <input type="text" value={clinical.notes} placeholder="–"
                  onChange={e => setClinical(c => ({ ...c, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#185FA5]" />
              </div>
            </div>
          </div>

          {result && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm text-slate-600 flex flex-wrap gap-4 items-center">
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
              className="bg-[#0C447C] hover:bg-[#185FA5] disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึกและดูผลลัพธ์ →'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && result && (
        <div className="space-y-4">
          {/* Patient info banner */}
          <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-2xl p-3 text-sm">
            <span className="font-semibold text-[#1D4ED8]">{patient.firstName} {patient.lastName}</span>
            <span className="text-blue-600 ml-2 font-mono">HN: {patient.hn}</span>
            <span className="text-blue-600 ml-2">• {patient.location}</span>
          </div>

          {/* Severity badge */}
          <SeverityBadge level={result.overallLevel} size="lg" />

          {/* Info grid: 4 cells */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
              <div className="text-[10px] uppercase text-slate-400 tracking-wide">Cooperative</div>
              <div className="text-sm font-medium text-slate-700 mt-0.5">
                {clinical.cooperativeness === 'fully_cooperative' ? 'Yes' : 'No'}
              </div>
            </div>
            <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
              <div className="text-[10px] uppercase text-slate-400 tracking-wide">CFS</div>
              <div className="text-sm font-medium text-slate-700 mt-0.5">{clinical.cfsScore}</div>
            </div>
            <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
              <div className="text-[10px] uppercase text-slate-400 tracking-wide">Code F / R</div>
              <div className="text-sm font-medium text-[#0C447C] mt-0.5">F{result.fLevel} / R{result.rLevel}</div>
            </div>
            <div className="bg-[#F8FAFC] rounded-[10px] p-2.5 text-center">
              <div className="text-[10px] uppercase text-slate-400 tracking-wide">Program Type</div>
              <div className={`text-sm font-medium mt-0.5 ${result.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}`}>
                {result.programType}
              </div>
            </div>
          </div>

          {/* Goal */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide mb-1">Goal</div>
            <div className="text-sm font-medium text-slate-700">{result.goal}</div>
          </div>

          {/* Outcome Measurements as chips */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-semibold text-slate-700 mb-3 text-sm">Outcome Measurements</h4>
            <div className="flex flex-wrap gap-2">
              {result.outcomeMeasurements.map(m => (
                <span key={m} className="bg-[#F0F7FF] text-[#1D4ED8] border border-[#BFDBFE] rounded-full px-3 py-1 text-xs font-medium">
                  ✓ {m}
                </span>
              ))}
            </div>
          </div>

          {/* Step-up Criteria */}
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-5">
            <h4 className="text-[#166534] font-bold mb-3">Step-up Criteria</h4>
            <ul className="space-y-2">
              {STEP_UP_CRITERIA[result.overallLevel]?.map(c => (
                <li key={c} className="text-[#15803D] text-sm flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">→</span>{c}
                </li>
              ))}
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Link href={`/patients/${id}`}
              className="flex-1 text-center border border-slate-300 text-slate-600 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
              ← Back
            </Link>
            <Link href={`/patients/${id}/outcome`}
              className="flex-1 text-center bg-[#0C447C] hover:bg-[#185FA5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
              Record Outcome →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
