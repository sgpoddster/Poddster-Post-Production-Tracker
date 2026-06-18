'use client'

import { useState } from 'react'

type Result = {
  ok: boolean
  total: number
  saved: number
  skipped: number
  errors: number
  results: { job_id: string; client_name: string; result: 'saved' | 'skipped' | 'error'; url?: string }[]
}

export default function FrameioFolderBackfill() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/backfill-frameio-folders', { method: 'POST' })
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
        <h3 className="text-sm font-semibold text-th">Backfill Frame.io Folder Links</h3>
        <p className="text-xs text-th/40 mt-1">
          Finds all projects missing a Frame.io folder link and creates/locates the folder for each one. Safe to run multiple times.
        </p>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
      >
        {loading ? 'Running…' : 'Run Backfill'}
      </button>

      {error && <p className="text-xs text-brand-red">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-th/70">
            {result.total} jobs checked — {result.saved} saved, {result.skipped} skipped, {result.errors} errors.
          </p>
          {result.results.filter(r => r.result !== 'skipped').length > 0 && (
            <ul className="space-y-1">
              {result.results.filter(r => r.result !== 'skipped').map((r, i) => (
                <li key={i} className="text-xs text-th/50 flex items-center gap-2">
                  <span className={`font-mono ${r.result === 'error' ? 'text-brand-red' : 'text-th/70'}`}>
                    {r.job_id}
                  </span>
                  <span className="text-th/40">{r.client_name}</span>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-brand-red/70 hover:text-brand-red underline">
                      folder ↗
                    </a>
                  )}
                  {r.result === 'error' && <span className="text-brand-red">error</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
