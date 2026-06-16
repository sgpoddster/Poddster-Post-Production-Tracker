'use client'

import { useTimeFormat } from './TimeFormatProvider'

export function TimeFormatToggle() {
  const { hour12, toggle } = useTimeFormat()

  return (
    <button
      onClick={toggle}
      title={hour12 ? 'Switch to 24-hour time' : 'Switch to 12-hour time'}
      className="p-2 rounded-lg text-th/40 hover:text-th/80 hover:bg-th/[0.06] transition-colors text-[11px] font-medium tracking-wide tabular-nums"
    >
      {hour12 ? '12h' : '24h'}
    </button>
  )
}
