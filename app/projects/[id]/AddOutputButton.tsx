'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddOutputButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(type: 'episode' | 'highlight') {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/projects/add-output', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, type }),
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
        className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-medium rounded transition-colors"
      >
        + Add Output
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-brand-surface border border-white/10 rounded-xl w-full max-w-xs p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">Add Output</h3>
            <p className="text-xs text-white/40 mb-5">
              Auto-sequenced from existing outputs for job <span className="font-mono text-white/60">{jobId}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => add('episode')}
                disabled={loading}
                className="py-3 bg-brand-surface2 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
              >
                Episode
              </button>
              <button
                onClick={() => add('highlight')}
                disabled={loading}
                className="py-3 bg-brand-surface2 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
              >
                Highlight
              </button>
            </div>
            {error && <p className="text-xs text-brand-red mt-3">{error}</p>}
            <button
              onClick={() => setOpen(false)}
              className="mt-4 text-xs text-white/30 hover:text-white/60 transition-colors w-full text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
