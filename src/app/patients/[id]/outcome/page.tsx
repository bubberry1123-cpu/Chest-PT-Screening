'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPatientById, getScreeningsByPatient, saveOutcome, getOutcomesByPatient, deleteOutcomeSession } from '@/lib/localstore'
import {
  OUTCOME_GROUPS, OUTCOME_SESSIONS, SESSION_SHORT, getFlatItems,
  ERAS_PHASES, ERAS_OUTCOME_GROUPS, getErasFlatItems, ERAS_PHASE_SHORT,
  INBODY_GROUPS, INBODY_BALANCE_ITEMS, INBODY_BALANCE_OPTIONS, getInBodyFlatItems,
} from '@/lib/outcomeItems'
import { useIsAdmin } from '@/lib/useIsAdmin'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/Toast'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Patient, Screening, OutcomeMeasurement, OutcomeSession, OverallLevel } from '@/types'

type BtnState = 'idle' | 'saving' | 'saved'

export default function OutcomePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [latestScreening, setLatestScreening] = useState<Screening | null>(null)
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [session, setSession] = useState<OutcomeSession>('Initial')
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [assessmentDate, setAssessmentDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const isAdmin = useIsAdmin()
  const [btnState, setBtnState] = useState<BtnState>('idle')
  const [loading, setLoading] = useState(true)
  const { toast, showToast } = useToast()
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false)

  useEffect(() => {
    Promise.all([getPatientById(id), getScreeningsByPatient(id), getOutcomesByPatient(id)])
      .then(([p, s, o]) => {
        setPatient(p)
        setLatestScreening(s[0] ?? null)
        setOutcomes(o)
        const effectiveType = p?.assessmentType ?? s[0]?.assessmentType
        if (effectiveType === 'ERAS') {
          setSession('Prehabilitation' as OutcomeSession)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const isEras = (patient?.assessmentType ?? latestScreening?.assessmentType) === 'ERAS'

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
      setAssessmentDate(existing.assessmentDate ?? new Date().toISOString().split('T')[0])
    } else {
      setValues({})
      setNotes({})
      setAssessmentDate(new Date().toISOString().split('T')[0])
    }
    setBtnState('idle')
  }, [session, outcomes])

  const level = latestScreening?.overallLevel as OverallLevel | undefined
  const groups = isEras ? ERAS_OUTCOME_GROUPS : (level ? OUTCOME_GROUPS[level] : [])

  const handleSave = async () => {
    if (!level || !patient) return
    const allItems = isEras ? getErasFlatItems() : getFlatItems(level)
    const filledItems: Record<string, { value: number; note?: string }> = {}
    let hasAny = false
    for (const item of allItems) {
      const raw = values[item.key]
      if (raw !== undefined && raw !== '') {
        const trimmedNote = notes[item.key]?.trim()
        filledItems[item.key] = trimmedNote ? { value: Number(raw), note: trimmedNote } : { value: Number(raw) }
        hasAny = true
      }
    }
    if (isEras && session === 'Prehabilitation') {
      for (const item of getInBodyFlatItems()) {
        const raw = values[item.key]
        if (raw !== undefined && raw !== '') {
          filledItems[item.key] = { value: Number(raw) }
          hasAny = true
        }
      }
      for (const item of INBODY_BALANCE_ITEMS) {
        const raw = values[item.key]
        if (raw !== undefined && raw !== '') {
          filledItems[item.key] = { value: Number(raw) }
          hasAny = true
        }
      }
    }
    if (!hasAny) {
      showToast('Please fill in at least one field', 'error')
      return
    }
    setBtnState('saving')
    try {
      await saveOutcome({ patientId: id, patientHn: patient.hn, session, level, items: filledItems, assessmentDate })
      const updated = await getOutcomesByPatient(id)
      setOutcomes(updated)
      setBtnState('saved')
      showToast('Outcome saved successfully!', 'success')
      setTimeout(() => router.push(`/patients/${id}`), 800)
    } catch (err) {
      console.error('saveOutcome failed:', err)
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
  const sessionShortLabel = isEras
    ? (ERAS_PHASE_SHORT[session] ?? session)
    : (SESSION_SHORT[session] ?? session)

  return (
    <div className="max-w-2xl mx-auto">
      {toast && <Toast {...toast} />}

      <div className="flex items-center gap-2 mb-5">
        <Link href={`/patients/${id}`} className="text-slate-400 hover:text-slate-600 text-sm">← Back</Link>
      </div>

      <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-2xl p-3 mb-5 text-sm flex items-center justify-between">
        <div>
          <span className="font-semibold text-[#1D4ED8]">{patient.firstName} {patient.lastName}</span>
          <span className="text-blue-600 ml-2 font-mono">HN: {patient.hn}</span>
        </div>
        <div className="flex items-center gap-2">
          {isEras && (
            <span className="text-purple-700 font-semibold text-xs px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-full">
              ERAS
            </span>
          )}
          <span className="text-[#1D4ED8] font-semibold text-xs px-2.5 py-1 bg-[#F0F7FF] border border-[#BFDBFE] rounded-full">
            Level {latestScreening.overallLevel} — {latestScreening.levelName}
          </span>
        </div>
      </div>

      <h2 className="text-lg font-bold text-slate-800 mb-4">Outcome Measurement</h2>

      {/* Phase / Session selector */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {isEras ? 'Select Phase' : 'Select Session'}
        </p>
        {isEras ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ERAS_PHASES.map(phase => {
              const hasDone = outcomes.some(o => o.session === phase)
              const isActive = session === phase
              return (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setSession(phase as OutcomeSession)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-xs font-semibold transition-all text-center ${
                    isActive
                      ? 'bg-purple-700 border-purple-700 text-white shadow'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-purple-400 hover:bg-purple-50'
                  }`}>
                  {ERAS_PHASE_SHORT[phase]}
                  {hasDone && <span className={`ml-1 ${isActive ? 'text-purple-200' : 'text-emerald-500'}`}>✓</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <select
            value={session}
            onChange={e => setSession(e.target.value as OutcomeSession)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#185FA5] bg-white text-slate-700">
            {OUTCOME_SESSIONS.map(s => {
              const hasDone = outcomes.some(o => o.session === s)
              return (
                <option key={s} value={s}>
                  {s}{hasDone ? ' ✓' : ''}
                </option>
              )
            })}
          </select>
        )}

        {/* Assessment Date */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
          <label className="text-xs font-semibold text-slate-500 shrink-0">Assessment Date</label>
          <input
            type="date"
            value={assessmentDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => setAssessmentDate(e.target.value)}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#185FA5] bg-white text-slate-700"
          />
        </div>

        {hasDataForSession && (
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-emerald-600">✓ Has existing data — editing will overwrite</p>
            {isAdmin && (
              <button
                onClick={() => setConfirmDeleteSession(true)}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded transition-colors">
                Delete this {isEras ? 'phase' : 'session'}
              </button>
            )}
          </div>
        )}
        {confirmDeleteSession && (
          <ConfirmDialog
            title={`Delete ${isEras ? 'Phase' : 'Session'}`}
            message={`Delete all data for "${sessionShortLabel}"?\nThis cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={async () => {
              setConfirmDeleteSession(false)
              try {
                await deleteOutcomeSession(id, session)
                const updated = await getOutcomesByPatient(id)
                setOutcomes(updated)
              } catch {
                showToast('Failed to delete. Please try again.', 'error')
              }
            }}
            onCancel={() => setConfirmDeleteSession(false)}
          />
        )}
      </div>

      {/* Grouped form */}
      <div className="space-y-3 mb-5">
        {groups.map(group => {
          const isMulti = group.items.length > 1
          if (isMulti) {
            return (
              <div key={group.groupKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                          className="w-20 text-right border border-slate-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-blue-200"
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
            <div key={group.groupKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center px-5 py-3.5 gap-3">
                <label className="flex-1 font-medium text-slate-700 text-sm">
                  {group.label}
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
                    className="w-20 text-right border border-slate-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-blue-200"
                  />
                  <span className="text-sm text-slate-400 w-10 shrink-0">{item.unit}</span>
                </div>
              </div>
              {group.groupKey === 'dyspneaScale' && (
                <div className="px-5 pb-3 border-t border-slate-100">
                  <p className="text-[11px] font-medium text-slate-400 mt-2 mb-1">mMRC Grades</p>
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div><span className="inline-block w-5 font-semibold text-slate-600">0</span>Breathless only with strenuous exercise</div>
                    <div><span className="inline-block w-5 font-semibold text-slate-600">1–2</span>Short of breath when hurrying or walking up a slight hill</div>
                    <div><span className="inline-block w-5 font-semibold text-slate-600">3</span>Stops for breath after walking 100 meters</div>
                    <div><span className="inline-block w-5 font-semibold text-slate-600">4</span>Too breathless to leave the house / breathless at rest</div>
                  </div>
                </div>
              )}
              {item.showNotes && (
                <div className="px-5 pb-3.5 -mt-1">
                  <input
                    type="text"
                    value={notes[item.key] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [item.key]: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 text-slate-500 placeholder-slate-300 focus:outline-none focus:border-[#185FA5] bg-slate-50"
                  />
                </div>
              )}
            </div>
          )
        })}

        {isEras && session === 'Prehabilitation' && (
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200">
              <h4 className="font-bold text-indigo-800 text-sm">InBody</h4>
            </div>
            {INBODY_GROUPS.map(group => (
              <div key={group.groupKey}>
                <div className="px-5 py-2 bg-indigo-50/40 border-b border-indigo-100">
                  <p className="text-xs font-semibold text-indigo-600">{group.label}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.items.map(item => (
                    <div key={item.key} className="flex items-center px-5 py-3 gap-3">
                      <label className="flex-1 text-sm text-slate-600 pl-2">{item.label}</label>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          step={item.step ?? 1}
                          value={values[item.key] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [item.key]: e.target.value }))}
                          placeholder="–"
                          className="w-20 text-right border border-slate-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                        />
                        <span className="text-sm text-slate-400 w-12 shrink-0">{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="px-5 py-2 bg-indigo-50/40 border-t border-indigo-100 border-b border-indigo-100">
              <p className="text-xs font-semibold text-indigo-600">Body Balance Evaluation</p>
            </div>
            <div className="divide-y divide-slate-100">
              {INBODY_BALANCE_ITEMS.map(item => (
                <div key={item.key} className="flex items-center px-5 py-3 gap-3">
                  <label className="flex-1 text-sm text-slate-600 pl-2">{item.label}</label>
                  <select
                    value={values[item.key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [item.key]: e.target.value }))}
                    className="border border-slate-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white text-slate-700"
                  >
                    <option value="">–</option>
                    {INBODY_BALANCE_OPTIONS.map((opt, i) => (
                      <option key={i} value={String(i)}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 justify-between">
        <Link href={`/patients/${id}`}
          className="px-5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          ← Back
        </Link>
        <button
          onClick={handleSave}
          disabled={btnState === 'saving'}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            btnState === 'saved'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : btnState === 'saving'
                ? 'bg-[#0C447C] opacity-80 text-white cursor-not-allowed'
                : isEras
                  ? 'bg-purple-700 hover:bg-purple-800 text-white'
                  : 'bg-[#0C447C] hover:bg-[#185FA5] text-white'
          }`}>
          {btnState === 'saving' && (
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {btnState === 'saved' ? '✓ Saved' : btnState === 'saving' ? 'Saving...' : `Save ${sessionShortLabel}`}
        </button>
      </div>
    </div>
  )
}
