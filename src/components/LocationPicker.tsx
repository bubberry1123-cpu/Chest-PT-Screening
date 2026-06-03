'use client'
import { useState } from 'react'
import { WARDS } from '@/lib/wards'

interface LocationPickerProps {
  value: string
  onChange: (v: string) => void
  touched?: boolean
}

export default function LocationPicker({ value, onChange, touched }: LocationPickerProps) {
  const [mode, setMode] = useState<'opd' | 'ward' | ''>(() => {
    if (value === 'OPD') return 'opd'
    if (value) return 'ward'
    return ''
  })

  const isInvalid = touched && !value

  const handleOPD = () => {
    setMode('opd')
    onChange('OPD')
  }

  const handleWardClick = () => {
    setMode('ward')
    if (value === 'OPD') onChange('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleOPD}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
            mode === 'opd'
              ? 'bg-teal-600 border-teal-600 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:border-teal-400 hover:bg-teal-50'
          }`}
        >
          OPD
        </button>
        <button
          type="button"
          onClick={handleWardClick}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
            mode === 'ward'
              ? 'bg-[#0C447C] border-[#0C447C] text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:border-[#185FA5] hover:bg-blue-50'
          }`}
        >
          Ward
        </button>
      </div>
      {mode === 'ward' && (
        <select
          value={value === 'OPD' ? '' : value}
          onChange={e => onChange(e.target.value)}
          className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none bg-white ${
            isInvalid
              ? 'border-red-400 bg-red-50 focus:border-red-400'
              : 'border-slate-300 focus:border-[#185FA5]'
          }`}
        >
          <option value="">Select Ward</option>
          {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      )}
      {isInvalid && mode === '' && (
        <div className="text-xs text-red-500">Please select OPD or a Ward</div>
      )}
    </div>
  )
}
