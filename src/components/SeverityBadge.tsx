import { LEVEL_CONFIG } from '@/lib/scoring'

const colorMap = {
  green:  { bg: 'bg-green-100',  border: 'border-green-500',  text: 'text-green-800',  dot: 'bg-green-500'  },
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  orange: { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-800', dot: 'bg-orange-500' },
  red:    { bg: 'bg-red-100',    border: 'border-red-500',    text: 'text-red-800',    dot: 'bg-red-500'    },
}

interface Props {
  level: 1 | 2 | 3 | 4
  size?: 'sm' | 'lg'
}

export default function SeverityBadge({ level, size = 'sm' }: Props) {
  const cfg = LEVEL_CONFIG[level]
  const c = colorMap[cfg.color]

  if (size === 'lg') {
    return (
      <div className={`${c.bg} ${c.border} ${c.text} border-2 rounded-xl p-5 text-center`}>
        <div className="flex items-center justify-center gap-2">
          <span className={`w-4 h-4 rounded-full ${c.dot} inline-block`} />
          <span className="text-2xl font-bold">Level {level} — {cfg.label}</span>
        </div>
      </div>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${c.bg} ${c.text} border ${c.border}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      Level {level}
    </span>
  )
}
