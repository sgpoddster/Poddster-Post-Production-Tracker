'use client'

import { useState } from 'react'

const DEFAULT_SHOWN = 30

export default function FootageShowMore({ children, total }: { children: React.ReactNode[]; total: number }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? children : children.slice(0, DEFAULT_SHOWN)
  const hidden  = total - DEFAULT_SHOWN

  return (
    <>
      {visible}
      {!showAll && hidden > 0 && (
        <div className="px-5 py-3 border-t border-th/[0.05]">
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-th/40 hover:text-th/70 transition-colors"
          >
            Show {hidden} more ↓
          </button>
        </div>
      )}
    </>
  )
}
