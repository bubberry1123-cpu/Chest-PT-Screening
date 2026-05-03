'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllPatients, searchPatients, deletePatient } from '@/lib/localstore'
import { useIsAdmin } from '@/lib/useIsAdmin'
import type { Patient } from '@/types'

export default function HomePage() {
  const isAdmin = useIsAdmin()
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllPatients().then(data => {
      setPatients(data)
      setLoading(false)
    })
  }, [])

  const handleSearch = async (term: string) => {
    setSearch(term)
    if (term.trim() === '') {
      const data = await getAllPatients()
      setPatients(data)
    } else {
      const data = await searchPatients(term)
      setPatients(data)
    }
  }

  const handleDelete = async (p: Patient) => {
    if (!window.confirm(`ลบผู้ป่วย "${p.firstName} ${p.lastName}" (HN: ${p.hn}) และข้อมูลทั้งหมด?`)) return
    await deletePatient(p.id!)
    setPatients(prev => prev.filter(x => x.id !== p.id))
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">รายการผู้ป่วย</h2>
          <p className="text-slate-500 text-sm">ค้นหาผู้ป่วยหรือเริ่มการประเมินใหม่</p>
        </div>
        <Link
          href="/patients/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow transition-colors text-center"
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
          className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
      ) : patients.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">🔍</div>
          <p>{search ? 'ไม่พบผู้ป่วยที่ค้นหา' : 'ยังไม่มีผู้ป่วยในระบบ'}</p>
          <Link href="/patients/new" className="mt-4 inline-block text-blue-600 underline text-sm">
            เพิ่มผู้ป่วยใหม่
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
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
                      <Link href={`/patients/${p.id}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                        ดูข้อมูล →
                      </Link>
                      {isAdmin && (
                        <button onClick={() => handleDelete(p)}
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
