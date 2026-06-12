'use client'

import { useState } from 'react'

export function FunFactButton() {
  const [open, setOpen]     = useState(false)
  const [fact, setFact]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleOpen() {
    setOpen(true)
    if (fact) return   // already loaded today's fact
    setLoading(true)
    const res = await fetch('/api/fun-fact')
    const data = await res.json()
    setFact(data.fact ?? 'Could not load fact — try again later.')
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Fun fact of the day"
        className="p-2 rounded-lg text-th/30 hover:text-th/60 hover:bg-th/[0.06] transition-colors text-sm"
      >
        💡
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm bg-[var(--bg-float)] border border-th/10 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] text-th/30 uppercase tracking-widest font-semibold mb-1">Fun fact of the day</p>
                <span className="text-2xl">💡</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-th/25 hover:text-th/60 transition-colors mt-0.5"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-th/80 leading-relaxed">
              {loading ? (
                <span className="text-th/30 italic">Loading…</span>
              ) : (
                fact
              )}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
