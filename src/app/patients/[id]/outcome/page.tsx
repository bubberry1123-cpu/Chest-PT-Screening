'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient, saveOutcome, getOutcomesByPatient } from '@/lib/localstore'
import { OUTCOME_GROUPS, OUTCOME_SESSIONS, SESSION_SHORT, getFlatItems } from '@/lib/outcomeItems'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession, OverallLevel } from '@/types'

export default function OutcomePage() {
  const { id } = useParams<{ id: string }>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [latestScreening, setLatestScreening] = useState<Screening | null>(null)
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [session, setSession] = useState<OutcomeSession>('Initial')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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
      Object.entries(existing.items).forEach(([k, e]) => { v[k] = String(e.value) })
      setValues(v)
    } else {
      setValues({})
    }
    setSaved(false)
    setError('')
  }, [session, outcomes])

  const level = latestScreening?.overallLevel as OverallLevel | undefined
  const groups = level ? OUTCOME_GROUPS[level] : []

  const handleSave = async () => {
    if (!level || !patient) return
    const allItems = getFlatItems(level)
    const filledItems: Record<string, { value: number }> = {}
    let hasAny = false
    for (const item of allItems) {
      const raw = values[item.key]
      if (raw !== undefined && raw !== '') {
        filledItems[item.key] = { value: Number(raw) }
        hasAny = true
      }
    }
    if (!hasAny) { setError('Please enter at least one value.'); return }
    setError('')
    setSaving(true)
    try {
      await saveOutcome({ patientId: id, patientHn: patient.hn, session, level, items: filledItems })
      const updated = await getOutcomesByPatient(id)
      setOutcomes(updated)
      setSaved(true)
    } catch {
      setError('Error saving. Please try again.')
    } finally {
      setSaving(false)
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
        <div className="flex flex-wrap gap-2">
          {OUTCOME_SESSIONS.map(s => {
            const hasDone = outcomes.some(o => o.session === s)
            const active = session === s
            return (
              <button key={s} type="button" onClick={() => setSession(s)}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                  active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : hasDone
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'
                }`}>
                {SESSION_SHORT[s]}
                {hasDone && !active && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                )}
              </button>
            )
          })}
        </div>
        {hasDataForSession && (
          <p className="text-xs text-emerald-600 mt-2">✓ Has existing data — editing will overwrite</p>
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

          // Single-item group
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
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2.5 rounded-lg text-sm mb-4">⚠ {error}</div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-2.5 rounded-lg text-sm mb-4">
          ✓ {session} saved successfully
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <Link href={`/patients/${id}`}
          className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          ← Back
        </Link>
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
          {saving ? 'Saving...' : `Save ${SESSION_SHORT[session]}`}
        </button>
      </div>
    </div>
  )
}
