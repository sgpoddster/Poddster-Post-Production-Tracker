'use client'

import { useState, useEffect } from 'react'

export function CollapsibleSection({
  dot,
  title,
  count,
  empty,
  storageKey,
  noContainer = false,
  children,
}: {
  dot: string
  title: string
  count: number
  empty: string
  storageKey: string
  noContainer?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  // Remember collapsed state across visits
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(`dash-sec-${storageKey}`) === 'closed') setOpen(false)
  }, [storageKey])

  const toggle = () =>
    setOpen(o => {
      const next = !o
      try { localStorage.setItem(`dash-sec-${storageKey}`, next ? 'open' : 'closed') } catch {}
      return next
    })

  return (
    <section>
      <button
        onClick={toggle}
        className="flex items-center gap-2.5 mb-4 w-full text-left group"
      >
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest group-hover:text-white/70 transition-colors">
          {title}
        </h2>
        <span className="text-xs text-white/25">{count}</span>
        <svg
          className={`ml-auto w-3.5 h-3.5 text-white/30 group-hover:text-white/50 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        noContainer ? (
          children
        ) : count === 0 ? (
          <p className="text-sm text-white/25 pl-4">{empty}</p>
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
            {children}
          </div>
        )
      )}
    </section>
  )
}
