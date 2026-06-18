'use client'

import { useState, useEffect, Children } from 'react'

export function CollapsibleSection({
  dot,
  title,
  count,
  empty,
  storageKey,
  noContainer = false,
  defaultLimit,
  actions,
  children,
}: {
  dot: string
  title: string
  count: number
  empty: string
  storageKey: string
  noContainer?: boolean
  defaultLimit?: number
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  // Remember collapsed state across visits
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(`dash-sec-${storageKey}`) === 'closed') setOpen(false)
  }, [storageKey])

  // Reset showAll when section is collapsed
  const toggle = () =>
    setOpen(o => {
      const next = !o
      if (!next) setShowAll(false)
      try { localStorage.setItem(`dash-sec-${storageKey}`, next ? 'open' : 'closed') } catch {}
      return next
    })

  const childArray = Children.toArray(children)
  const limited = defaultLimit && !showAll && childArray.length > defaultLimit
  const visible = limited ? childArray.slice(0, defaultLimit) : childArray
  const hiddenCount = childArray.length - (defaultLimit ?? 0)

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 text-left group flex-1 min-w-0"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <h2 className="text-xs font-semibold text-th/50 uppercase tracking-widest group-hover:text-th/70 transition-colors">
            {title}
          </h2>
          <span className="text-xs text-th/25">{count}</span>
          <svg
            className={`ml-2 w-3.5 h-3.5 text-th/30 group-hover:text-th/50 transition-transform shrink-0 ${open ? '' : '-rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {actions}
      </div>

      {open && (
        noContainer ? (
          children
        ) : count === 0 ? (
          <p className="text-sm text-th/25 pl-4">{empty}</p>
        ) : (
          <>
            <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden divide-y divide-th/[0.06]">
              {visible}
            </div>
            {limited && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-3 w-full text-xs text-th/40 hover:text-th/60 transition-colors py-2"
              >
                Show {hiddenCount} more…
              </button>
            )}
            {showAll && defaultLimit && childArray.length > defaultLimit && (
              <button
                onClick={() => setShowAll(false)}
                className="mt-3 w-full text-xs text-th/40 hover:text-th/60 transition-colors py-2"
              >
                Show fewer
              </button>
            )}
          </>
        )
      )}
    </section>
  )
}
