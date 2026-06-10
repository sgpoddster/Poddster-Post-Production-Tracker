'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddOutputButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'episode' | 'highlight'>('episode')
  const [num, setNum] = useState(1)

  async function add() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/projects/add-output', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, type, number: num }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to add output')
      setLoading(false)
      return
    }
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-th/[0.06] hover:bg-th/10 border border-th/10 text-th/60 hover:text-th text-xs font-medium rounded transition-colors"
      >
        + Add Output
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-brand-surface border border-th/10 rounded-xl w-full max-w-xs p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-th mb-1">Add Output</h3>
            <p className="text-xs text-th/40 mb-5">
              Adds <span className="font-mono text-th/60">{`${jobId}${type === 'episode' ? 'E' : 'H'}${num}`}</span>
            </p>

            {/* Type toggle */}
            <label className="text-[10px] text-th/30 uppercase tracking-wider">Type</label>
            <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
              {(['episode', 'highlight'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`py-2.5 text-sm font-medium rounded border transition-colors ${
                    type === t
                      ? 'bg-brand-red border-brand-red text-th'
                      : 'bg-brand-surface2 border-th/10 text-th/60 hover:text-th hover:bg-th/10'
                  }`}
                >
                  {t === 'episode' ? 'Episode' : 'Highlight'}
                </button>
              ))}
            </div>

            {/* Number */}
            <label className="text-[10px] text-th/30 uppercase tracking-wider">Number</label>
            <select
              value={num}
              onChange={e => setNum(parseInt(e.target.value, 10))}
              className="w-full mt-1 bg-brand-surface2 border border-th/10 rounded px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-brand-red/50"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{type === 'episode' ? `Episode ${n}` : `Highlight ${n}`}</option>
              ))}
            </select>

            <button
              onClick={add}
              disabled={loading}
              className="w-full mt-5 py-2.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-th text-sm font-medium rounded transition-colors"
            >
              {loading ? 'Adding…' : 'Add Output'}
            </button>

            {error && <p className="text-xs text-brand-red mt-3">{error}</p>}
            <button
              onClick={() => setOpen(false)}
              className="mt-3 text-xs text-th/30 hover:text-th/60 transition-colors w-full text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
