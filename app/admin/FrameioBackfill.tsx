'use client'

import { useState } from 'react'

export default function FrameioBackfill() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ updated: number; results: { internalId: string; version: number; link: string }[]; message?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/backfill-frameio-links', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Unknown error'); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-th/[0.06] bg-brand-surface p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-th">Backfill Frame.io Links</h3>
        <p className="text-xs text-th/40 mt-1">
          Scans Frame.io for uploaded files and saves player links to any delivered version rows that don&apos;t have one yet. Safe to run multiple times.
        </p>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
      >
        {loading ? 'Scanning Frame.io…' : 'Run Backfill'}
      </button>

      {error && (
        <p className="text-xs text-brand-red">{error}</p>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-th/70">
            {result.message ?? `Updated ${result.updated} version${result.updated === 1 ? '' : 's'}.`}
          </p>
          {result.results && result.results.length > 0 && (
            <ul className="space-y-1">
              {result.results.map((r, i) => (
                <li key={i} className="text-xs text-th/50 flex items-center gap-2">
                  <span className="font-mono text-th/70">{r.internalId} V{r.version}</span>
                  <a href={r.link} target="_blank" rel="noreferrer" className="text-brand-red/70 hover:text-brand-red underline truncate max-w-xs">
                    link ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
