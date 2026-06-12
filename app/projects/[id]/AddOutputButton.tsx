'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddOutputButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'episode' | 'highlight'>('highlight')
  const [count, setCount] = useState(1)
  const [startFrom, setStartFrom] = useState(1)

  const prefix = type === 'episode' ? 'E' : 'H'
  const ids = Array.from({ length: count }, (_, i) => `${jobId}${prefix}${startFrom + i}`)
  const previewLabel = ids.length <= 3
    ? ids.map(id => <span key={id} className="font-mono text-th/60">{id}</span>)
    : [
        <span key="first" className="font-mono text-th/60">{ids[0]}</span>,
        <span key="dots" className="text-th/30"> … </span>,
        <span key="last" className="font-mono text-th/60">{ids[ids.length - 1]}</span>,
        <span key="count" className="text-th/40"> ({count} rows)</span>,
      ]

  async function add() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/projects/add-output', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, type, count, start_from: startFrom }),
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
          <div className="relative bg-brand-surface border border-th/10 rounded-xl w-full max-w-xs p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-th mb-1">Add Output</h3>
              <p className="text-xs text-th/40 flex items-center gap-1 flex-wrap">
                Adds {previewLabel}
              </p>
            </div>

            {/* Type toggle */}
            <div>
              <label className="text-[10px] text-th/30 uppercase tracking-wider">Type</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['episode', 'highlight'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`py-2.5 text-sm font-medium rounded border transition-colors ${
                      type === t
                        ? 'bg-brand-red border-brand-red text-white'
                        : 'bg-brand-surface2 border-th/10 text-th/60 hover:text-th hover:bg-th/10'
                    }`}
                  >
                    {t === 'episode' ? 'Episode' : 'Highlight'}
                  </button>
                ))}
              </div>
            </div>

            {/* Count + Start From */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-th/30 uppercase tracking-wider">How Many</label>
                <select
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value, 10))}
                  className="w-full mt-1 bg-brand-surface2 border border-th/10 rounded px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-brand-red/50"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-th/30 uppercase tracking-wider">Start From</label>
                <select
                  value={startFrom}
                  onChange={e => setStartFrom(parseInt(e.target.value, 10))}
                  className="w-full mt-1 bg-brand-surface2 border border-th/10 rounded px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-brand-red/50"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{type === 'episode' ? `E${n}` : `H${n}`}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={add}
              disabled={loading}
              className="w-full py-2.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              {loading ? 'Adding…' : `Add ${count} ${count === 1 ? (type === 'episode' ? 'Episode' : 'Highlight') : (type === 'episode' ? 'Episodes' : 'Highlights')}`}
            </button>

            {error && <p className="text-xs text-brand-red">{error}</p>}
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-th/30 hover:text-th/60 transition-colors w-full text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
