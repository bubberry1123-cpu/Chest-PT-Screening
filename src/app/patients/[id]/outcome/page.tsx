'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient, saveOutcome, getOutcomesByPatient, deleteOutcomeSession } from '@/lib/localstore'
import { OUTCOME_GROUPS, OUTCOME_SESSIONS, SESSION_SHORT, getFlatItems } from '@/lib/outcomeItems'
import { useIsAdmin } from '@/lib/useIsAdmin'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/Toast'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession, OverallLevel } from '@/types'

type BtnState = 'idle' | 'saving' | 'saved'

export default function OutcomePage() {
  const { id } = useParams<{ id: string }>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [latestScreening, setLatestScreening] = useState<Screening | null>(null)
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [session, setSession] = useState<OutcomeSession>('Initial')
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const isAdmin = useIsAdmin()
  const [btnState, setBtnState] = useState<BtnState>('idle')
  const [loading, setLoading] = useState(true)
  const { toast, showToast } = useToast()

  useEffect(() => {
    Promise.all([getPatientById(id), getScreeningsByPatient(id), getOutcomesByPatient(id)])
      .then(([p, s, o]) => {
        setPatient(p)
        setLatestScreening(s[0] ?? null)
        setOutcomes(o)
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    const existing = outcomes.find(o => o.session === session)
    if (existing) {
      const v: Record<string, string> = {}
      const n: Record<string, string> = {}
      Object.entries(existing.items).forEach(([k, e]) => {
        v[k] = String(e.value)
        if (e.note) n[k] = e.note
      })
      setValues(v)
      setNotes(n)
    } else {
      setValues({})
      setNotes({})
    }
    setBtnState('idle')
  }, [session, outcomes])

  const level = latestScreening?.overallLevel as OverallLevel | undefined
  const groups = level ? OUTCOME_GROUPS[level] : []

  const handleSave = async () => {
    if (!level || !patient) return
    const allItems = getFlatItems(level)
    const filledItems: Record<string, { value: number; note?: string }> = {}
    let hasAny = false
    for (const item of allItems) {
      const raw = values[item.key]
      if (raw !== undefined && raw !== '') {
        filledItems[item.key] = { value: Number(raw), note: notes[item.key]?.trim() || undefined }
        hasAny = true
      }
    }
    if (!hasAny) {
      showToast('Please fill in at least one field', 'error')
      return
    }
    setBtnState('saving')
    try {
      await saveOutcome({ patientId: id, patientHn: patient.hn, session, level, items: filledItems })
      const updated = await getOutcomesByPatient(id)
      setOutcomes(updated)
      setBtnState('saved')
      showToast('Outcome saved successfully!', 'success')
      setTimeout(() => setBtnState('idle'), 2000)
    } catch {
      setBtnState('idle')
      showToast('Failed to save. Please try again.', 'error')
    }
  }

  if (loading) return <div className="text-center py-16 text-slate-400">Loading...</div>
  if (!patient) return <div className="text-center py-16 text-slate-400">Patient not found.</div>
  if (!latestScreening) return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/patients/${id}`} className="text-slate-400 hover:text-slate-600 text-sm">← Back</Link>
      <div className="text-center py-16 text-slate-400 mt-8">No screening found. Please complete a screening first.</div>
    </div>
  )

  const hasDataForSession = outcomes.some(o => o.session === session)

  return (
    <div className="max-w-2xl mx-auto">
      {toast && <Toast {...toast} />}

      <div className="flex items-center gap-2 mb-5">
        <Link href={`/patients/${id}`} className="text-slate-400 hover:text-slate-600 text-sm">← Back</Link>
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

      <h2 className="text-lg font-bold text-slate-800 mb-4">Outcome Measurement</h2>

      {/* Session selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Select Session</p>
        <select
          value={session}
          onChange={e => setSession(e.target.value as OutcomeSession)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-700">
          {OUTCOME_SESSIONS.map(s => {
            const hasDone = outcomes.some(o => o.session === s)
            return (
              <option key={s} value={s}>
                {s}{hasDone ? ' ✓' : ''}
              </option>
            )
          })}
        </select>
        {hasDataForSession && (
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-emerald-600">✓ Has existing data — editing will overwrite</p>
            {isAdmin && (
              <button
                onClick={async () => {
                  if (!window.confirm(`ลบข้อมูล ${SESSION_SHORT[session]} ทั้งหมด?`)) return
                  await deleteOutcomeSession(id, session)
                  const updated = await getOutcomesByPatient(id)
                  setOutcomes(updated)
                }}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded transition-colors">
                ลบ session นี้
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grouped form */}
      <div className="space-y-3 mb-5">
        {groups.map(group => {
          const isMulti = group.items.length > 1
          if (isMulti) {
            return (
              <div key={group.groupKey} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <h4 className="font-bold text-slate-800 text-sm">{group.label}</h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.items.map(item => (
                    <div key={item.key} className="flex items-center px-5 py-3 gap-3">
                      <label className="flex-1 text-sm text-slate-600 pl-2">{item.label}</label>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min={item.min}
                          max={item.max}
                          step={item.step ?? 1}
                          value={values[item.key] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [item.key]: e.target.value }))}
                          placeholder="–"
                          className="w-20 text-right border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                        />
                        <span className="text-sm text-slate-400 w-10 shrink-0">{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          const item = group.items[0]
          return (
            <div key={group.groupKey} className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center px-5 py-3.5 gap-3">
                <label className="flex-1 font-medium text-slate-700 text-sm">
                  {group.label}
                  {item.lowerIsBetter && (
                    <span className="ml-2 text-xs font-normal text-indigo-400">↓ better</span>
                  )}
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={item.min}
                    max={item.max}
                    step={item.step ?? 1}
                    value={values[item.key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [item.key]: e.target.value }))}
                    placeholder="–"
                    className="w-20 text-right border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                  />
                  <span className="text-sm text-slate-400 w-10 shrink-0">{item.unit}</span>
                </div>
              </div>
              {item.showNotes && (
                <div className="px-5 pb-3.5 -mt-1">
                  <input
                    type="text"
                    value={notes[item.key] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [item.key]: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-500 placeholder-slate-300 focus:outline-none focus:border-blue-400 bg-slate-50"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 justify-between">
        <Link href={`/patients/${id}`}
          className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          ← Back
        </Link>
        <button
          onClick={handleSave}
          disabled={btnState === 'saving'}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
            btnState === 'saved'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : btnState === 'saving'
                ? 'bg-blue-600 opacity-80 text-white cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}>
          {btnState === 'saving' && (
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {btnState === 'saved' ? '✓ Saved' : btnState === 'saving' ? 'Saving...' : `Save ${SESSION_SHORT[session]}`}
        </button>
      </div>
    </div>
  )
}
