'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient, saveOutcome, getOutcomesByPatient } from '@/lib/localstore'
import { OUTCOME_ITEMS, OUTCOME_SESSIONS, SESSION_SHORT } from '@/lib/outcomeItems'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession, OverallLevel } from '@/types'

export default function OutcomePage() {
  const { id } = useParams<{ id: string }>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [latestScreening, setLatestScreening] = useState<Screening | null>(null)
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [session, setSession] = useState<OutcomeSession>('Initial')
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    const [p, s, o] = await Promise.all([
      getPatientById(id),
      getScreeningsByPatient(id),
      getOutcomesByPatient(id),
    ])
    setPatient(p)
    setLatestScreening(s[0] ?? null)
    setOutcomes(o)
    setLoading(false)
  }

  useEffect(() => { reload() }, [id])

  useEffect(() => {
    const existing = outcomes.find(o => o.session === session)
    if (existing) {
      const v: Record<string, string> = {}
      const n: Record<string, string> = {}
      Object.entries(existing.items).forEach(([k, e]) => {
        v[k] = String(e.value)
        n[k] = e.note ?? ''
      })
      setValues(v)
      setNotes(n)
    } else {
      setValues({})
      setNotes({})
    }
    setSaved(false)
    setError('')
  }, [session, outcomes])

  const level = latestScreening?.overallLevel as OverallLevel | undefined
  const items = level ? OUTCOME_ITEMS[level] : []

  const handleSave = async () => {
    if (!level || !patient) return
    const filledItems: Record<string, { value: number; note?: string }> = {}
    let hasAny = false
    for (const item of items) {
      const raw = values[item.key]
      if (raw !== undefined && raw !== '') {
        filledItems[item.key] = {
          value: Number(raw),
          note: notes[item.key]?.trim() || undefined,
        }
        hasAny = true
      }
    }
    if (!hasAny) { setError('กรุณากรอกข้อมูลอย่างน้อย 1 รายการ'); return }
    setError('')
    setSaving(true)
    try {
      await saveOutcome({ patientId: id, patientHn: patient.hn, session, level, items: filledItems })
      const updated = await getOutcomesByPatient(id)
      setOutcomes(updated)
      setSaved(true)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
  if (!patient) return <div className="text-center py-16 text-slate-400">ไม่พบผู้ป่วย</div>
  if (!latestScreening) return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/patients/${id}`} className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      <div className="text-center py-16 text-slate-400 mt-8">ยังไม่มีผลการประเมิน กรุณาประเมินก่อน</div>
    </div>
  )

  const hasDataForSession = outcomes.some(o => o.session === session)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <Link href={`/patients/${id}`} className="text-slate-400 hover:text-slate-600 text-sm">← กลับ</Link>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-sm flex items-center justify-between">
        <div>
          <span className="font-semibold text-blue-800">{patient.firstName} {patient.lastName}</span>
          <span className="text-blue-600 ml-2 font-mono">HN: {patient.hn}</span>
        </div>
        <span className="text-blue-700 font-semibold text-xs px-2.5 py-1 bg-blue-100 rounded-full">
          Level {latestScreening.overallLevel} — {latestScreening.levelName}
        </span>
      </div>

      <h2 className="text-lg font-bold text-slate-800 mb-4">บันทึก Outcome Measurement</h2>

      {/* Session selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-slate-700 mb-3">เลือก Session</h3>
        <div className="flex flex-wrap gap-2">
          {OUTCOME_SESSIONS.map(s => {
            const hasDone = outcomes.some(o => o.session === s)
            const active = session === s
            return (
              <button key={s} type="button" onClick={() => setSession(s)}
                className={`relative px-4 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                  active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : hasDone
                      ? 'bg-green-50 border-green-400 text-green-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'
                }`}>
                {SESSION_SHORT[s]}
                {hasDone && !active && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border border-white" />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-400 mt-2">สีเขียว = มีข้อมูลแล้ว (คลิกเพื่อแก้ไข)</p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-700">
            {session}
          </h3>
          {hasDataForSession && (
            <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              มีข้อมูลเดิม — แก้ไข
            </span>
          )}
        </div>
        <div className="space-y-5">
          {items.map(item => (
            <div key={item.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                <span className="text-xs text-slate-400">({item.unit})</span>
                {item.lowerIsBetter && (
                  <span className="text-xs text-indigo-500 font-medium">↓ ดีขึ้น</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step={item.step ?? 1}
                  min={0}
                  value={values[item.key] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [item.key]: e.target.value }))}
                  placeholder="–"
                  className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={notes[item.key] ?? ''}
                  onChange={e => setNotes(n => ({ ...n, [item.key]: e.target.value }))}
                  placeholder="หมายเหตุ (optional)"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-lg text-sm mb-4">
          ⚠ {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-2.5 rounded-lg text-sm mb-4">
          ✓ บันทึก {session} สำเร็จแล้ว
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <Link href={`/patients/${id}`}
          className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          ← กลับ
        </Link>
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
          {saving ? 'กำลังบันทึก...' : `บันทึก ${SESSION_SHORT[session]}`}
        </button>
      </div>
    </div>
  )
}
