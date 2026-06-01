'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  onHold: boolean
  holdReason?: string | null
}

export default function OnHoldButton({ projectId, onHold, holdReason }: Props) {
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [reason, setReason] = useState('')
  const router = useRouter()

  async function putOnHold() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || null }),
    })
    setShowModal(false)
    setReason('')
    router.refresh()
    setLoading(false)
  }

  async function resume() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/resume`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  if (onHold) {
    return (
      <div className="flex items-center gap-2">
        {holdReason && (
          <span className="text-xs text-amber-400/60 italic max-w-[140px] truncate" title={holdReason}>
            {holdReason}
          </span>
        )}
        <button
          onClick={resume}
          disabled={loading}
          className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 border border-amber-400 disabled:opacity-40 text-black text-xs font-bold rounded transition-colors"
        >
          {loading ? '…' : '⏸ On Hold'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="px-3 py-1.5 bg-transparent hover:bg-white/10 border border-white/15 disabled:opacity-40 text-white/40 hover:text-white/70 text-xs font-medium rounded transition-colors"
      >
        ⏸ Hold
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-brand-surface border border-white/10 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div>
              <h3 className="text-sm font-semibold text-white">Put on hold</h3>
              <p className="text-xs text-white/40 mt-0.5">Optional — add a reason so the team knows why.</p>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Waiting for client feedback…"
              rows={3}
              className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25 resize-none"
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setShowModal(false); setReason('') }}
                className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={putOnHold}
                disabled={loading}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold rounded transition-colors"
              >
                {loading ? 'Saving…' : 'Put on hold'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
