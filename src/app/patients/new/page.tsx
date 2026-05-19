'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createPatient, getPatientByHn } from '@/lib/localstore'
import { createScreening } from '@/lib/localstore'
import { calculateScreening, CFS_DESCRIPTIONS, STEP_UP_CRITERIA } from '@/lib/scoring'
import type { O2Support, Cooperativeness, Sex, ScreeningInput } from '@/types'
import { WARDS } from '@/lib/wards'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/Toast'
import SeverityBadge from '@/components/SeverityBadge'

type Step = 1 | 2 | 3

const NATIONALITIES = ['Thai', 'Arab', 'Inter', 'CLMV (Cambodia, Laos, Myanmar, Vietnam)', 'Asia']

const DRIVER_LABELS: Record<string, string> = {
  Functional: 'Functional (F > R)',
  Respiratory: 'Respiratory (R > F)',
  Equal: 'Equal (F = R)',
  'Non-Cooperative': 'Non-Cooperative',
}

export default function NewPatientPage() {
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [savedBtn, setSavedBtn] = useState(false)
  const [error, setError] = useState('')
  const [step1Attempted, setStep1Attempted] = useState(false)
  const { toast, showToast } = useToast()

  const [patientForm, setPatientForm] = useState({
    hn: '', firstName: '', lastName: '', age: '', nationality: 'Thai', location: '',
  })
  const [sex, setSex] = useState<Sex | ''>('')
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null)

  const [clinical, setClinical] = useState<{
    cooperativeness: Cooperativeness | null
    cfsScore: number | null
    o2Support: O2Support | null
    assessedBy: string
    notes: string
  }>({
    cooperativeness: null, cfsScore: null, o2Support: null, assessedBy: '', notes: '',
  })

  const [step1Loading, setStep1Loading] = useState(false)
  const [screeningId, setScreeningId] = useState<string | null>(null)
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null)

  const validateStep1 = () => {
    if (!patientForm.hn.trim()) return 'กรุณากรอก HN'
    if (!patientForm.firstName.trim()) return 'กรุณากรอกชื่อ'
    if (!patientForm.lastName.trim()) return 'กรุณากรอกนามสกุล'
    if (!patientForm.age || isNaN(Number(patientForm.age)) || Number(patientForm.age) <= 0) return 'กรุณากรอกอายุที่ถูกต้อง'
    if (!sex) return 'กรุณาเลือกเพศ'
    if (!patientForm.location) return 'กรุณาเลือก Location (Ward)'
    return ''
  }

  const handleStep1Next = async () => {
    setStep1Attempted(true)
    const err = validateStep1()
    if (err) { setError(err); return }
    setError('')
    setStep1Attempted(false)
    setStep1Loading(true)
    try {
      const existing = await getPatientByHn(patientForm.hn.trim())
      if (existing) {
        setExistingPatientId(existing.id!)
        setPatientForm({
          hn: existing.hn,
          firstName: existing.firstName,
          lastName: existing.lastName,
          age: String(existing.age),
          nationality: existing.nationality,
          location: existing.location,
        })
        setSex(existing.sex)
      }
      setStep(2)
    } catch (e) {
      setError('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่')
      console.error(e)
    } finally {
      setStep1Loading(false)
    }
  }

  const validateStep2 = () => {
    if (!clinical.cooperativeness) return 'กรุณาเลือก Ability to Follow Commands'
    if (clinical.cfsScore === null) return 'กรุณาเลือก CFS Score'
    if (!clinical.o2Support) return 'กรุณาเลือก Oxygen Support'
    return ''
  }

  const handleStep2Next = async () => {
    const err = validateStep2()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)
    try {
      let patientId = existingPatientId
      if (!patientId) {
        patientId = await createPatient({
          hn: patientForm.hn.trim(),
          firstName: patientForm.firstName.trim(),
          lastName: patientForm.lastName.trim(),
          age: Number(patientForm.age),
          sex: sex as Sex,
          nationality: patientForm.nationality,
          location: patientForm.location,
        })
      }
      setSavedPatientId(patientId)

      const input: ScreeningInput = {
        cooperativeness: clinical.cooperativeness!,
        cfsScore: clinical.cfsScore!,
        o2Support: clinical.o2Support!,
      }
      const res = calculateScreening(input)
      const sid = await createScreening({
        patientId,
        patientHn: patientForm.hn.trim(),
        location: patientForm.location,
        assessedBy: clinical.assessedBy || 'PT',
        notes: clinical.notes,
        ...input,
        ...res,
      })
      setScreeningId(sid)
      setSavedBtn(true)
      showToast('Assessment saved successfully!', 'success')
      setTimeout(() => setSavedBtn(false), 2000)
      setStep(3)
    } catch (e) {
      showToast('Failed to save. Please try again.', 'error')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const result = clinical.cooperativeness && clinical.cfsScore !== null && clinical.o2Support
    ? calculateScreening({
        cooperativeness: clinical.cooperativeness,
        cfsScore: clinical.cfsScore,
        o2Support: clinical.o2Support,
      })
    : null

  const fieldCls = (empty: boolean) =>
    `w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      step1Attempted && empty
        ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100'
        : 'border-slate-300 focus:border-[#185FA5] focus:ring-blue-100'
    }`

  return (
    <div className="max-w-2xl mx-auto">
      {toast && <Toast {...toast} />}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
        </div>
        <div className="flex gap-1 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-[#0C447C]' : 'bg-slate-200'}`} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span className={step >= 1 ? 'text-[#0C447C] font-medium' : ''}>1. ข้อมูลผู้ป่วย</span>
          <span className={step >= 2 ? 'text-[#0C447C] font-medium' : ''}>2. Clinical Assessment</span>
          <span className={step >= 3 ? 'text-[#0C447C] font-medium' : ''}>3. ผลลัพธ์</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-xl text-sm mb-4">
          ⚠ {error}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-5 text-lg">ข้อมูลผู้ป่วย</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">HN (Hospital Number) *</label>
              <input type="text" value={patientForm.hn}
                onChange={e => setPatientForm(f => ({ ...f, hn: e.target.value }))}
                className={fieldCls(!patientForm.hn.trim())}
                placeholder="เช่น 6500123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ *</label>
              <input type="text" value={patientForm.firstName}
                onChange={e => setPatientForm(f => ({ ...f, firstName: e.target.value }))}
                className={fieldCls(!patientForm.firstName.trim())}
                placeholder="ชื่อ" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">นามสกุล *</label>
              <input type="text" value={patientForm.lastName}
                onChange={e => setPatientForm(f => ({ ...f, lastName: e.target.value }))}
                className={fieldCls(!patientForm.lastName.trim())}
                placeholder="นามสกุล" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">อายุ *</label>
              <input type="number" value={patientForm.age} min={0} max={150}
                onChange={e => setPatientForm(f => ({ ...f, age: e.target.value }))}
                className={fieldCls(!patientForm.age || isNaN(Number(patientForm.age)) || Number(patientForm.age) <= 0)}
                placeholder="ปี" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">สัญชาติ *</label>
              <select value={patientForm.nationality}
                onChange={e => setPatientForm(f => ({ ...f, nationality: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#185FA5] bg-white">
                {NATIONALITIES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">เพศ *</label>
              <div className={`flex gap-2 rounded-lg p-0.5 transition-all ${step1Attempted && !sex ? 'ring-2 ring-red-300' : ''}`}>
                {(['Male', 'Female', 'Other'] as Sex[]).map(s => (
                  <button key={s} type="button"
                    onClick={() => setSex(s)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                      sex === s ? 'bg-[#0C447C] border-[#0C447C] text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-[#185FA5]'
                    }`}>
                    {s === 'Male' ? 'ชาย' : s === 'Female' ? 'หญิง' : 'อื่นๆ'}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Location (Ward) *</label>
              <select value={patientForm.location}
                onChange={e => setPatientForm(f => ({ ...f, location: e.target.value }))}
                className={`${fieldCls(!patientForm.location)} bg-white`}>
                <option value="">Select Ward</option>
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={handleStep1Next} disabled={step1Loading}
              className={`bg-[#0C447C] hover:bg-[#185FA5] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors ${step1Loading ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {step1Loading ? 'กำลังตรวจสอบ...' : 'ถัดไป: Clinical Assessment →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">D. ข้อมูลเพิ่มเติม</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ผู้ประเมิน (PT)</label>
                <input type="text" value={clinical.assessedBy} placeholder="ชื่อนักกายภาพบำบัด"
                  onChange={e => setClinical(c => ({ ...c, assessedBy: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#185FA5]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <textarea value={clinical.notes} rows={2} placeholder="บันทึกเพิ่มเติม..."
                  onChange={e => setClinical(c => ({ ...c, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#185FA5] resize-none" />
              </div>
            </div>
          </div>

          {/* Preview */}
          {result && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm text-slate-600 flex flex-wrap gap-4 items-center">
              <span className="font-semibold text-slate-800">{result.levelName}</span>
              <span>F{result.fLevel} / R{result.rLevel}</span>
              <span>Level {result.overallLevel}</span>
              <span className={result.driver === 'Non-Cooperative' ? 'text-red-600 font-medium' : result.programType === 'Standard' ? 'text-green-700 font-medium' : 'text-orange-700 font-medium'}>
                {result.driver}
              </span>
              <span className={result.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}>
                {result.programType}
              </span>
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <button onClick={() => { setStep(1); setError('') }}
              className="px-5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              ← ย้อนกลับ
            </button>
            <button onClick={handleStep2Next} disabled={saving}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                savedBtn
                  ? 'bg-emerald-600 text-white'
                  : saving
                    ? 'bg-[#0C447C] opacity-80 text-white cursor-not-allowed'
                    : 'bg-[#0C447C] hover:bg-[#185FA5] text-white'
              }`}>
              {saving && (
                <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {savedBtn ? '✓ Saved' : saving ? 'กำลังบันทึก...' : 'บันทึกและดูผลลัพธ์ →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && result && (
        <div className="space-y-4">
          <SeverityBadge level={result.overallLevel} size="lg" />

          {/* Info grid */}
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
            <h3 className="font-semibold text-slate-700 mb-3 text-sm">Outcome Measurements</h3>
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
            <h3 className="text-[#166534] font-bold mb-3">Step-up Criteria</h3>
            <ul className="space-y-2">
              {STEP_UP_CRITERIA[result.overallLevel]?.map(c => (
                <li key={c} className="text-[#15803D] text-sm flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">→</span>{c}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <Link href={`/patients/${savedPatientId}`}
              className="flex-1 text-center bg-[#0C447C] hover:bg-[#185FA5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
              ← Back
            </Link>
            <Link href={`/patients/${savedPatientId}/outcome`}
              className="flex-1 text-center bg-[#0C447C] hover:bg-[#185FA5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
              Record Outcome →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
