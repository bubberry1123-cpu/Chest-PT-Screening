'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPatient, getPatientByHn } from '@/lib/localstore'
import { createScreening } from '@/lib/localstore'
import { calculateScreening, CFS_DESCRIPTIONS, MMRC_DESCRIPTIONS } from '@/lib/scoring'
import type { O2Support, ScreeningInput } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'

type Step = 1 | 2 | 3

const NATIONALITIES = ['ไทย', 'พม่า', 'ลาว', 'กัมพูชา', 'เวียดนาม', 'จีน', 'อื่นๆ']
const WARDS = ['ICU', 'CCU', 'MICU', 'SICU', 'Ward ทั่วไป', 'อื่นๆ']

export default function NewPatientPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — Patient info
  const [patientForm, setPatientForm] = useState({
    hn: '', firstName: '', lastName: '', age: '', nationality: 'ไทย', ward: 'ICU',
  })
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null)

  // Step 2 — Clinical
  const [clinical, setClinical] = useState<{
    cfsScore: number | null
    o2Support: O2Support | null
    o2FlowRate: string
    peakCoughFlow: string
    abgPaO2: string
    mmrcDyspnea: number | null
    assessedBy: string
    notes: string
  }>({
    cfsScore: null,
    o2Support: null,
    o2FlowRate: '',
    peakCoughFlow: '',
    abgPaO2: '',
    mmrcDyspnea: null,
    assessedBy: '',
    notes: '',
  })

  // Step 3 — Result
  const [screeningId, setScreeningId] = useState<string | null>(null)
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null)

  const validateStep1 = () => {
    if (!patientForm.hn.trim()) return 'กรุณากรอก HN'
    if (!patientForm.firstName.trim()) return 'กรุณากรอกชื่อ'
    if (!patientForm.lastName.trim()) return 'กรุณากรอกนามสกุล'
    if (!patientForm.age || isNaN(Number(patientForm.age)) || Number(patientForm.age) <= 0) return 'กรุณากรอกอายุที่ถูกต้อง'
    return ''
  }

  const handleStep1Next = async () => {
    const err = validateStep1()
    if (err) { setError(err); return }
    setError('')

    // Check if HN exists
    const existing = await getPatientByHn(patientForm.hn.trim())
    if (existing) {
      setExistingPatientId(existing.id!)
      // Pre-fill form with existing data
      setPatientForm({
        hn: existing.hn,
        firstName: existing.firstName,
        lastName: existing.lastName,
        age: String(existing.age),
        nationality: existing.nationality,
        ward: existing.ward,
      })
    }
    setStep(2)
  }

  const validateStep2 = () => {
    if (clinical.cfsScore === null) return 'กรุณาเลือก CFS Score'
    if (!clinical.o2Support) return 'กรุณาเลือก Oxygen Support'
    if (clinical.mmrcDyspnea === null) return 'กรุณาเลือก mMRC Dyspnea Scale'
    return ''
  }

  const handleStep2Next = async () => {
    const err = validateStep2()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)

    try {
      // Save or use existing patient
      let patientId = existingPatientId
      if (!patientId) {
        patientId = await createPatient({
          hn: patientForm.hn.trim(),
          firstName: patientForm.firstName.trim(),
          lastName: patientForm.lastName.trim(),
          age: Number(patientForm.age),
          nationality: patientForm.nationality,
          ward: patientForm.ward,
        })
      }
      setSavedPatientId(patientId)

      const input: ScreeningInput = {
        cfsScore: clinical.cfsScore!,
        o2Support: clinical.o2Support!,
        o2FlowRate: clinical.o2FlowRate ? Number(clinical.o2FlowRate) : undefined,
        peakCoughFlow: clinical.peakCoughFlow ? Number(clinical.peakCoughFlow) : undefined,
        abgPaO2: clinical.abgPaO2 ? Number(clinical.abgPaO2) : undefined,
        mmrcDyspnea: clinical.mmrcDyspnea!,
      }

      const result = calculateScreening(input)
      const sid = await createScreening({
        patientId,
        patientHn: patientForm.hn.trim(),
        ward: patientForm.ward,
        assessedBy: clinical.assessedBy || 'PT',
        notes: clinical.notes,
        ...input,
        ...result,
      })
      setScreeningId(sid)
      setStep(3)
    } catch (e) {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const result = clinical.cfsScore !== null && clinical.o2Support !== null && clinical.mmrcDyspnea !== null
    ? calculateScreening({
        cfsScore: clinical.cfsScore,
        o2Support: clinical.o2Support,
        peakCoughFlow: clinical.peakCoughFlow ? Number(clinical.peakCoughFlow) : undefined,
        abgPaO2: clinical.abgPaO2 ? Number(clinical.abgPaO2) : undefined,
        mmrcDyspnea: clinical.mmrcDyspnea,
      })
    : null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
        </div>
        <div className="flex gap-1 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-slate-200'}`} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span className={step >= 1 ? 'text-blue-600 font-medium' : ''}>1. ข้อมูลผู้ป่วย</span>
          <span className={step >= 2 ? 'text-blue-600 font-medium' : ''}>2. Clinical Assessment</span>
          <span className={step >= 3 ? 'text-blue-600 font-medium' : ''}>3. ผลลัพธ์</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-lg text-sm mb-4">
          ⚠ {error}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-5 text-lg">ข้อมูลผู้ป่วย</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">HN (Hospital Number) *</label>
              <input type="text" value={patientForm.hn}
                onChange={e => setPatientForm(f => ({ ...f, hn: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="เช่น 6500123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ *</label>
              <input type="text" value={patientForm.firstName}
                onChange={e => setPatientForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="ชื่อ" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">นามสกุล *</label>
              <input type="text" value={patientForm.lastName}
                onChange={e => setPatientForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="นามสกุล" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">อายุ *</label>
              <input type="number" value={patientForm.age} min={0} max={150}
                onChange={e => setPatientForm(f => ({ ...f, age: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="ปี" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">สัญชาติ *</label>
              <select value={patientForm.nationality}
                onChange={e => setPatientForm(f => ({ ...f, nationality: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
                {NATIONALITIES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Ward *</label>
              <select value={patientForm.ward}
                onChange={e => setPatientForm(f => ({ ...f, ward: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
                {WARDS.map(w => <option key={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={handleStep1Next}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
              ถัดไป: Clinical Assessment →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          {/* CFS */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-1">A. Clinical Frailty Scale (CFS) *</h3>
            <p className="text-slate-500 text-xs mb-4">เลือก 1 คะแนน ที่ตรงกับสภาวะผู้ป่วย</p>
            <div className="grid grid-cols-9 gap-1.5 mb-3">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => setClinical(c => ({ ...c, cfsScore: n }))}
                  className={`h-12 rounded-lg font-bold text-sm transition-all border-2 ${
                    clinical.cfsScore === n
                      ? 'bg-blue-600 border-blue-600 text-white shadow'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            {clinical.cfsScore && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm">
                <span className="font-semibold text-blue-800">CFS {clinical.cfsScore}: </span>
                <span className="text-blue-700">{CFS_DESCRIPTIONS[clinical.cfsScore].en} — {CFS_DESCRIPTIONS[clinical.cfsScore].th}</span>
              </div>
            )}
          </div>

          {/* O2 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">B. Oxygen Support *</h3>
            <div className="space-y-2.5">
              {([
                { value: 'room_air', label: 'Room Air', desc: 'หายใจเองได้ปกติ' },
                { value: 'low_flow', label: 'Low Flow', desc: '1–6 L/min' },
                { value: 'high_flow', label: 'High Flow', desc: '≥ 30–60 L/min' },
                { value: 'ventilator', label: 'Ventilator', desc: 'เครื่องช่วยหายใจ' },
              ] as const).map(opt => (
                <label key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
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
                  {(opt.value === 'low_flow' || opt.value === 'high_flow') && clinical.o2Support === opt.value && (
                    <input type="number" placeholder="L/min" value={clinical.o2FlowRate}
                      onChange={e => setClinical(c => ({ ...c, o2FlowRate: e.target.value }))}
                      className="ml-auto w-24 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Peak Cough + ABG */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">C. ค่าวัดทางคลินิก (ถ้ามี)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peak Cough Flow</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={clinical.peakCoughFlow} placeholder="–"
                    onChange={e => setClinical(c => ({ ...c, peakCoughFlow: e.target.value }))}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  <span className="text-slate-500 text-xs">L/min</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ABG PaO₂</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={clinical.abgPaO2} placeholder="–"
                    onChange={e => setClinical(c => ({ ...c, abgPaO2: e.target.value }))}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  <span className="text-slate-500 text-xs">mmHg</span>
                </div>
              </div>
            </div>
          </div>

          {/* mMRC */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">D. mMRC Dyspnea Scale *</h3>
            <div className="space-y-2">
              {[0,1,2,3,4].map(grade => (
                <label key={grade}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    clinical.mmrcDyspnea === grade
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}>
                  <input type="radio" name="mmrc" value={grade}
                    checked={clinical.mmrcDyspnea === grade}
                    onChange={() => setClinical(c => ({ ...c, mmrcDyspnea: grade }))}
                    className="mt-0.5 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800 text-sm">Grade {grade}: </span>
                    <span className="text-slate-600 text-sm">{MMRC_DESCRIPTIONS[grade]}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Assessed by */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">E. ข้อมูลเพิ่มเติม</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ผู้ประเมิน (PT)</label>
                <input type="text" value={clinical.assessedBy} placeholder="ชื่อนักกายภาพบำบัด"
                  onChange={e => setClinical(c => ({ ...c, assessedBy: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <textarea value={clinical.notes} rows={2} placeholder="บันทึกเพิ่มเติม..."
                  onChange={e => setClinical(c => ({ ...c, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>
          </div>

          {/* Preview */}
          {result && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 text-sm text-slate-600 flex flex-wrap gap-4">
              <span>F Level: <strong className="text-slate-800">F{result.fLevel}</strong></span>
              <span>R Level: <strong className="text-slate-800">R{result.rLevel}</strong></span>
              <span>Overall: <strong className="text-slate-800">Level {result.overallLevel}</strong></span>
              <span>Program: <strong className="text-slate-800">{result.programType}</strong></span>
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <button onClick={() => { setStep(1); setError('') }}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              ← ย้อนกลับ
            </button>
            <button onClick={handleStep2Next} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึกและดูผลลัพธ์ →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && result && screeningId && (
        <div className="space-y-4">
          <SeverityBadge level={result.overallLevel} size="lg" />

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-3">สรุปผลการประเมิน</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">CFS Score</div>
                <div className="font-bold text-lg text-slate-800">{clinical.cfsScore}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">F Level</div>
                <div className="font-bold text-lg text-blue-700">F{result.fLevel}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">R Level</div>
                <div className="font-bold text-lg text-blue-700">R{result.rLevel}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Program</div>
                <div className={`font-bold text-sm ${result.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}`}>
                  {result.programType}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-3">Outcome Measurements ที่แนะนำ</h3>
            <ul className="space-y-1.5">
              {result.outcomeMeasurements.map(m => (
                <li key={m} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="text-green-500 font-bold">✓</span> {m}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-3">Rehabilitation Program</h3>
            <ul className="space-y-1.5">
              {result.rehabProgram.map(p => (
                <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-blue-500 mt-0.5">•</span> {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <Link href={`/patients/${savedPatientId}`}
              className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors">
              ดูประวัติผู้ป่วย
            </Link>
            <Link href="/"
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
