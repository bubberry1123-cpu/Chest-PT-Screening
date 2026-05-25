'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllPatients, searchPatients, deletePatient } from '@/lib/localstore'
import { useIsAdmin } from '@/lib/useIsAdmin'
import type { Patient } from '@/types'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function HomePage() {
  const isAdmin = useIsAdmin()
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmTarget, setConfirmTarget] = useState<Patient | null>(null)

  useEffect(() => {
    getAllPatients()
      .then(data => { setPatients(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSearch = async (term: string) => {
    setSearch(term)
    try {
      const data = term.trim() === '' ? await getAllPatients() : await searchPatients(term)
      setPatients(data)
    } catch { /* ค้นหาไม่ได้ แสดงผลเดิม */ }
  }

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

  return (
    <div>
      {confirmTarget && (
        <ConfirmDialog
          title="ลบผู้ป่วย"
          message={`ลบผู้ป่วย "${confirmTarget.firstName} ${confirmTarget.lastName}" (HN: ${confirmTarget.hn}) และข้อมูลทั้งหมด?\nการกระทำนี้ไม่สามารถกู้คืนได้`}
          confirmLabel="ลบ"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800">รายการผู้ป่วย</h2>
          <p className="text-slate-500 text-sm">ค้นหาผู้ป่วยหรือเริ่มการประเมินใหม่</p>
        </div>
        <Link
          href="/patients/new"
          className="bg-[#0C447C] hover:bg-[#185FA5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow transition-colors text-center"
        >
          + ประเมินผู้ป่วยใหม่
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="ค้นหา ชื่อ / นามสกุล / HN..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#185FA5] focus:ring-2 focus:ring-blue-100 bg-white"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
      ) : patients.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">🔍</div>
          <p>{search ? 'ไม่พบผู้ป่วยที่ค้นหา' : 'ยังไม่มีผู้ป่วยในระบบ'}</p>
          <Link href="/patients/new" className="mt-4 inline-block text-[#185FA5] underline text-sm">
            เพิ่มผู้ป่วยใหม่
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อ-นามสกุล</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">HN</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Location</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">อายุ</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">สัญชาติ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono">{p.hn}</td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{p.location}</td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{p.age} ปี</td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{p.nationality}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
