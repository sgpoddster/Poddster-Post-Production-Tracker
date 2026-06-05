'use client'

import { useState } from 'react'

// Collapsible group of rows that share a Job ID. Collapsed by default;
// click the summary header to expand the individual rows.
export function JobGroup({
  count,
  header,
  children,
}: {
  count: number
  header: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 sm:px-5 py-3.5 sm:py-4 hover:bg-white/[0.03] transition-colors text-left group"
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-white/30 group-hover:text-white/60 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <div className="flex-1 min-w-0">{header}</div>
        <span className="shrink-0 text-[10px] text-white/45 bg-white/[0.06] px-2 py-0.5 rounded-full">
          {count} items
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] bg-black/20 divide-y divide-white/[0.04]">
          {children}
        </div>
      )}
    </div>
  )
}
