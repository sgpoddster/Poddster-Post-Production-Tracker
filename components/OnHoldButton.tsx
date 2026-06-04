'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  onHold: boolean
  holdReason?: string | null
}

export default function OnHoldButton({ projectId, onHold, holdReason }: Props) {
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [reason, setReason] = useState('')
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function putOnHold() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || null }),
    })
    setShowReasonModal(false)
    setReason('')
    router.refresh()
    setLoading(false)
  }

  async function resume() {
    setLoading(true)
    setMenuOpen(false)
    await fetch(`/api/projects/${projectId}/resume`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  async function backToDraft() {
    setMenuOpen(false)
    if (!confirm('Move this project back to Draft? Its version history and timers will be cleared until re-triggered.')) return
    setLoading(true)
    await fetch(`/api/projects/${projectId}/draft`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {onHold && holdReason && (
        <span className="text-xs text-amber-400/60 italic max-w-[140px] truncate" title={holdReason}>
          {holdReason}
        </span>
      )}

      <button
        onClick={() => setMenuOpen(o => !o)}
        disabled={loading}
        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-40 border whitespace-nowrap ${
          onHold
            ? 'bg-amber-400 hover:bg-amber-300 border-amber-400 text-black font-bold'
            : 'bg-transparent hover:bg-white/10 border-white/15 text-white/40 hover:text-white/70'
        }`}
      >
        {loading ? '…' : onHold ? '⏸ On Hold ▾' : '⏸ Hold ▾'}
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] rounded-lg border border-white/10 bg-[#1a1a2e] shadow-xl overflow-hidden">
          {onHold ? (
            <button onClick={resume}
              className="w-full text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors">
              ▶ Take off hold
            </button>
          ) : (
            <button onClick={() => { setMenuOpen(false); setShowReasonModal(true) }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors">
              ⏸ Put on hold
            </button>
          )}
          <button onClick={backToDraft}
            className="w-full text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] border-t border-white/[0.06] transition-colors">
            ↩ Back to Draft
          </button>
        </div>
      )}

      {showReasonModal && (
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
              <button onClick={() => { setShowReasonModal(false); setReason('') }}
                className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs transition-colors">
                Cancel
              </button>
              <button onClick={putOnHold} disabled={loading}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold rounded transition-colors">
                {loading ? 'Saving…' : 'Put on hold'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
