'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, createScreening } from '@/lib/localstore'
import { calculateScreening, CFS_DESCRIPTIONS, MMRC_DESCRIPTIONS } from '@/lib/scoring'
import type { Patient, O2Support, ScreeningInput } from '@/types'
import SeverityBadge from '@/components/SeverityBadge'

export default function NewScreeningPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [screeningId, setScreeningId] = useState<string | null>(null)

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
    cfsScore: null, o2Support: null, o2FlowRate: '', peakCoughFlow: '',
    abgPaO2: '', mmrcDyspnea: null, assessedBy: '', notes: '',
  })

  useEffect(() => {
    getPatientById(id).then(setPatient)
  }, [id])

  const result = clinical.cfsScore !== null && clinical.o2Support !== null && clinical.mmrcDyspnea !== null
    ? calculateScreening({
        cfsScore: clinical.cfsScore,
        o2Support: clinical.o2Support,
        peakCoughFlow: clinical.peakCoughFlow ? Number(clinical.peakCoughFlow) : undefined,
        abgPaO2: clinical.abgPaO2 ? Number(clinical.abgPaO2) : undefined,
        mmrcDyspnea: clinical.mmrcDyspnea,
      })
    : null

  const handleSave = async () => {
    if (!clinical.cfsScore || !clinical.o2Support || clinical.mmrcDyspnea === null) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
      return
    }
    if (!patient) return
    setError('')
    setSaving(true)
    try {
      const input: ScreeningInput = {
        cfsScore: clinical.cfsScore,
        o2Support: clinical.o2Support,
        peakCoughFlow: clinical.peakCoughFlow ? Number(clinical.peakCoughFlow) : undefined,
        abgPaO2: clinical.abgPaO2 ? Number(clinical.abgPaO2) : undefined,
        mmrcDyspnea: clinical.mmrcDyspnea,
      }
      const res = calculateScreening(input)
      const sid = await createScreening({
        patientId: id,
        patientHn: patient.hn,
        ward: patient.ward,
        assessedBy: clinical.assessedBy || 'PT',
        notes: clinical.notes,
        ...input,
        ...res,
      })
      setScreeningId(sid)
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
        <span className="text-blue-600 ml-2">• {patient.ward}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-lg text-sm mb-4">
          ⚠ {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {/* CFS */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">A. Clinical Frailty Scale (CFS) *</h3>
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
            <h3 className="font-bold text-slate-800 mb-4">B. Oxygen Support *</h3>
            <div className="space-y-2">
              {([
                { value: 'room_air', label: 'Room Air', desc: 'หายใจเองได้ปกติ' },
                { value: 'low_flow', label: 'Low Flow', desc: '1–6 L/min' },
                { value: 'high_flow', label: 'High Flow', desc: '≥ 30–60 L/min' },
                { value: 'ventilator', label: 'Ventilator', desc: 'เครื่องช่วยหายใจ' },
              ] as const).map(opt => (
                <label key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    clinical.o2Support === opt.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
                  }`}>
                  <input type="radio" name="o2" checked={clinical.o2Support === opt.value}
                    onChange={() => setClinical(c => ({ ...c, o2Support: opt.value }))} />
                  <span className="font-medium text-sm">{opt.label}</span>
                  <span className="text-slate-500 text-xs">({opt.desc})</span>
                </label>
              ))}
            </div>
          </div>

          {/* Lab values */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">C. ค่าวัดทางคลินิก (ถ้ามี)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peak Cough Flow (L/min)</label>
                <input type="number" value={clinical.peakCoughFlow} placeholder="–"
                  onChange={e => setClinical(c => ({ ...c, peakCoughFlow: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ABG PaO₂ (mmHg)</label>
                <input type="number" value={clinical.abgPaO2} placeholder="–"
                  onChange={e => setClinical(c => ({ ...c, abgPaO2: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>

          {/* mMRC */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">D. mMRC Dyspnea Scale *</h3>
            <div className="space-y-2">
              {[0,1,2,3,4].map(g => (
                <label key={g}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    clinical.mmrcDyspnea === g ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
                  }`}>
                  <input type="radio" name="mmrc" checked={clinical.mmrcDyspnea === g}
                    onChange={() => setClinical(c => ({ ...c, mmrcDyspnea: g }))} className="mt-0.5 shrink-0" />
                  <span className="text-sm"><span className="font-semibold">Grade {g}:</span> {MMRC_DESCRIPTIONS[g]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
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
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 text-sm text-slate-600 flex flex-wrap gap-4">
              <span>F{result.fLevel}</span><span>R{result.rLevel}</span>
              <span>Level {result.overallLevel}</span>
              <span className={result.programType === 'Standard' ? 'text-green-700 font-medium' : 'text-orange-700 font-medium'}>
                {result.programType}
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
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              <div className="bg-slate-50 rounded-lg p-2.5"><div className="text-xs text-slate-500">CFS</div><div className="font-bold text-lg">{clinical.cfsScore}</div></div>
              <div className="bg-slate-50 rounded-lg p-2.5"><div className="text-xs text-slate-500">F Level</div><div className="font-bold text-lg text-blue-700">F{result.fLevel}</div></div>
              <div className="bg-slate-50 rounded-lg p-2.5"><div className="text-xs text-slate-500">R Level</div><div className="font-bold text-lg text-blue-700">R{result.rLevel}</div></div>
              <div className="bg-slate-50 rounded-lg p-2.5"><div className="text-xs text-slate-500">Program</div><div className={`font-bold text-sm ${result.programType === 'Standard' ? 'text-green-700' : 'text-orange-700'}`}>{result.programType}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-semibold text-slate-700 mb-2">Outcome Measurements</h4>
            <ul className="space-y-1">{result.outcomeMeasurements.map(m => <li key={m} className="text-sm text-slate-700 flex items-center gap-2"><span className="text-green-500">✓</span>{m}</li>)}</ul>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-semibold text-slate-700 mb-2">Rehabilitation Program</h4>
            <ul className="space-y-1">{result.rehabProgram.map(p => <li key={p} className="text-sm text-slate-700 flex items-start gap-2"><span className="text-blue-500">•</span>{p}</li>)}</ul>
          </div>
          <Link href={`/patients/${id}`} className="block text-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors">
            กลับหน้าผู้ป่วย
          </Link>
        </div>
      )}
    </div>
  )
}
