'use client'

import { useState } from 'react'

// Collapsible group of rows that share a Job ID. Collapsed by default.
// The header slot receives a pre-built node that already matches the single-row
// layout, so client name / countdown / controls stay in the same columns.
export function JobGroup({
  header,
  children,
}: {
  header: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 sm:px-5 py-3.5 sm:py-4 hover:bg-th/[0.03] transition-colors text-left group flex items-center gap-3 sm:gap-4"
      >
        {/* Chevron — fixed same width as the hidden internal-id code column on mobile */}
        <svg
          className={`w-3 h-3 shrink-0 text-th/30 group-hover:text-th/60 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {/* Everything else — fills like the Link block in a single row */}
        <div className="flex-1 min-w-0">{header}</div>
      </button>

      {open && (
        <div className="border-t border-th/[0.06] divide-y divide-th/[0.04] bg-th/[0.035]">
          {children}
        </div>
      )}
    </div>
  )
}
