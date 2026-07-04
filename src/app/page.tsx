'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getAllPatients, getAllScreenings, getAllOutcomes, deletePatient } from '@/lib/localstore'
import { useIsAdmin } from '@/lib/useIsAdmin'
import type { Patient, Screening, OutcomeMeasurement } from '@/types'
import ConfirmDialog from '@/components/ConfirmDialog'
import SeverityBadge from '@/components/SeverityBadge'
import { formatHn, normalizeHn } from '@/lib/hn'

type Tab = 'chestpt' | 'eras'

const ERAS_PHASE_COLUMNS = [
  { key: 'Prehabilitation', label: 'Pre-hab Date' },
  { key: 'Pre-op',          label: 'Pre-op Date' },
  { key: 'DC',              label: 'D/C Date' },
  { key: 'Follow-up',       label: 'F/U Date' },
] as const

function fmtDate(d?: Date | string | null): string {
  if (!d) return '–'
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return '–'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function nextDueDate(s?: Screening | null): Date | null {
  if (!s?.assessedAt) return null
  const d = new Date(s.assessedAt)
  d.setDate(d.getDate() + 14)
  return d
}

// Derive a follow-up status from the next-due date (14-day reassessment cycle)
function chestPtStatus(s?: Screening | null): { label: string; cls: string } {
  const due = nextDueDate(s)
  if (!due) return { label: 'Not Assessed', cls: 'bg-slate-100 text-slate-500' }
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000)
  if (days < 0)  return { label: 'Overdue',  cls: 'bg-red-100 text-red-700' }
  if (days <= 3) return { label: 'Due Soon', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'On Track', cls: 'bg-emerald-100 text-emerald-700' }
}

export default function HomePage() {
  const isAdmin = useIsAdmin()
  const [patients, setPatients] = useState<Patient[]>([])
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([])
  const [tab, setTab] = useState<Tab>('chestpt')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmTarget, setConfirmTarget] = useState<Patient | null>(null)

  useEffect(() => {
    Promise.all([getAllPatients(), getAllScreenings(), getAllOutcomes()])
      .then(([p, s, o]) => { setPatients(p); setScreenings(s); setOutcomes(o); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Latest screening per patient (for Level / Last Assessment / Next Due + type fallback)
  const latestByPatient = useMemo(() => {
    const m: Record<string, Screening> = {}
    screenings.forEach(s => {
      if (!s.patientId || !s.assessedAt) return
      const cur = m[s.patientId]
      if (!cur || new Date(s.assessedAt).getTime() > new Date(cur.assessedAt!).getTime()) m[s.patientId] = s
    })
    return m
  }, [screenings])

  // Outcomes grouped per patient (for ERAS phase dates)
  const outcomesByPatient = useMemo(() => {
    const m: Record<string, OutcomeMeasurement[]> = {}
    outcomes.forEach(o => { (m[o.patientId] ??= []).push(o) })
    return m
  }, [outcomes])

  // Category: ERAS if patient (or its latest screening) is marked ERAS; else Chest PT.
  // Legacy patients with no assessmentType fall through to Chest PT.
  const isEras = (p: Patient) =>
    (p.assessmentType ?? latestByPatient[p.id ?? '']?.assessmentType) === 'ERAS'

  const chestptPatients = useMemo(() => patients.filter(p => !isEras(p)), [patients, latestByPatient])
  const erasPatients    = useMemo(() => patients.filter(p =>  isEras(p)), [patients, latestByPatient])

  const tabPatients = tab === 'eras' ? erasPatients : chestptPatients

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim()
    if (!t) return tabPatients
    const tHn = normalizeHn(search)
    return tabPatients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(t) ||
      (tHn !== '' && normalizeHn(p.hn).includes(tHn))
    )
  }, [tabPatients, search])

  const switchTab = (t: Tab) => { setTab(t); setSearch('') }

  const confirmDelete = async () => {
    if (!confirmTarget) return
    try {
      await deletePatient(confirmTarget.id!)
      setPatients(prev => prev.filter(x => x.id !== confirmTarget.id))
    } catch {
      alert('ลบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setConfirmTarget(null)
    }
  }

  const erasPhaseDate = (p: Patient, key: string): string => {
    const o = (outcomesByPatient[p.id ?? ''] ?? []).find(x => x.session === key)
    return fmtDate(o?.assessmentDate)
  }

  const newHref  = tab === 'eras' ? '/patients/new?type=eras' : '/patients/new'
  const newLabel = tab === 'eras' ? '+ New ERAS Patient' : '+ New Chest PT Assessment'

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'chestpt', label: 'Chest PT', count: chestptPatients.length },
    { id: 'eras',    label: 'ERAS',     count: erasPatients.length },
  ]

  const actionsCell = (p: Patient) => (
    <td className="px-4 py-3 text-right">
      <div className="flex items-center justify-end gap-3">
        <Link href={`/patients/${p.id}`} className="text-[#0C447C] hover:text-[#185FA5] font-medium text-sm">
          ดูข้อมูล →
        </Link>
        {isAdmin && (
          <button onClick={() => setConfirmTarget(p)}
            className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors">
            ลบ
          </button>
        )}
      </div>
    </td>
  )

  return (
    <div>
      {confirmTarget && (
        <ConfirmDialog
          title="ลบผู้ป่วย"
          message={`ลบผู้ป่วย "${confirmTarget.firstName} ${confirmTarget.lastName}" (HN: ${formatHn(confirmTarget.hn)}) และข้อมูลทั้งหมด?\nการกระทำนี้ไม่สามารถกู้คืนได้`}
          confirmLabel="ลบ"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800">รายการผู้ป่วย</h2>
          <p className="text-slate-500 text-sm">ค้นหาผู้ป่วยหรือเริ่มการประเมินใหม่</p>
        </div>
        <Link
          href={newHref}
          className="bg-[#0C447C] hover:bg-[#185FA5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow transition-colors text-center"
        >
          {newLabel}
        </Link>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-[#0C447C] text-[#0C447C]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                active ? 'bg-[#0C447C] text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder={`ค้นหา ชื่อ / นามสกุล / HN ใน ${tab === 'eras' ? 'ERAS' : 'Chest PT'}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-2 focus:ring-blue-100 bg-white"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">🔍</div>
          <p>{search ? 'ไม่พบผู้ป่วยที่ค้นหา' : `ยังไม่มีผู้ป่วย ${tab === 'eras' ? 'ERAS' : 'Chest PT'} ในระบบ`}</p>
          <Link href={newHref} className="mt-4 inline-block text-[#185FA5] underline text-sm">
            {newLabel}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-max">
            <thead className="bg-slate-50 border-b border-slate-200">
              {tab === 'chestpt' ? (
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">HN</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อ-นามสกุล</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Ward</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Level</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Last Assessment</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Next Due</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              ) : (
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">HN</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อ-นามสกุล</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Ward</th>
                  {ERAS_PHASE_COLUMNS.map(c => (
                    <th key={c.key} className="text-left px-4 py-3 font-semibold text-slate-600">{c.label}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                const s = latestByPatient[p.id ?? '']
                if (tab === 'chestpt') {
                  const due = nextDueDate(s)
                  const overdue = due ? due.getTime() < Date.now() : false
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 font-mono">{formatHn(p.hn)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{p.firstName} {p.lastName}</td>
                      <td className="px-4 py-3 text-slate-600">{p.location || '–'}</td>
                      <td className="px-4 py-3">{s ? <SeverityBadge level={s.overallLevel} /> : <span className="text-slate-400">–</span>}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(s?.assessedAt)}</td>
                      <td className={`px-4 py-3 font-medium ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                        {fmtDate(due)}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const st = chestPtStatus(s)
                          return <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span>
                        })()}
                      </td>
                      {actionsCell(p)}
                    </tr>
                  )
                }
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 font-mono">{formatHn(p.hn)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-slate-600">{p.location || '–'}</td>
                    {ERAS_PHASE_COLUMNS.map(c => (
                      <td key={c.key} className="px-4 py-3 text-slate-600">{erasPhaseDate(p, c.key)}</td>
                    ))}
                    {actionsCell(p)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
