'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  onHold: boolean
  holdReason?: string | null
}

export default function OnHoldButton({ projectId, onHold, holdReason }: Props) {
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [reason, setReason] = useState('')
  const [tooltipPos, setTooltipPos] = useState<{ top: number; right: number } | null>(null)
  const router = useRouter()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + window.scrollY + 6,
      right: window.innerWidth - rect.right,
    })
    setMenuOpen(true)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  async function putOnHold() {
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || null }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Failed to put on hold: ${data.error ?? res.status}`)
      return
    }
    setShowReasonModal(false)
    setReason('')
    router.refresh()
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

  const dropdown = menuOpen ? createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: menuPos.top,
        right: menuPos.right,
        zIndex: 9999,
      }}
      className="min-w-[180px] rounded-lg border border-th/10 bg-[var(--bg-float)] shadow-xl overflow-hidden"
    >
      {onHold ? (
        <button onClick={resume}
          className="w-full text-left px-3 py-2.5 text-sm text-th/70 hover:text-th hover:bg-th/[0.06] transition-colors">
          ▶ Take off hold
        </button>
      ) : (
        <button onClick={() => { setMenuOpen(false); setShowReasonModal(true) }}
          className="w-full text-left px-3 py-2.5 text-sm text-th/70 hover:text-th hover:bg-th/[0.06] transition-colors">
          ⏸ Put on hold
        </button>
      )}
      <button onClick={backToDraft}
        className="w-full text-left px-3 py-2.5 text-sm text-th/70 hover:text-th hover:bg-th/[0.06] border-t border-th/[0.06] transition-colors">
        ↩ Back to Draft
      </button>
    </div>,
    document.body,
  ) : null

  const tooltip = tooltipPos && onHold ? createPortal(
    <div
      style={{
        position: 'fixed',
        top: tooltipPos.top,
        right: tooltipPos.right,
        zIndex: 9999,
        transform: 'translateY(calc(-100% - 8px))',
      }}
      className="max-w-[240px] rounded-lg border border-amber-400/20 bg-[var(--bg-float)] shadow-xl px-3 py-2 text-xs text-amber-300/80 pointer-events-none"
    >
      <span className="block text-amber-400/50 uppercase tracking-wider text-[10px] mb-0.5">Hold reason</span>
      {holdReason || <span className="italic text-th/30">No reason given</span>}
    </div>,
    document.body,
  ) : null

  return (
    <div className="relative flex items-center gap-2">
      <button
        ref={buttonRef}
        onClick={() => menuOpen ? setMenuOpen(false) : openMenu()}
        disabled={loading}
        onMouseEnter={() => {
          if (!onHold || !buttonRef.current) return
          const rect = buttonRef.current.getBoundingClientRect()
          setTooltipPos({ top: rect.top, right: window.innerWidth - rect.right })
        }}
        onMouseLeave={() => setTooltipPos(null)}
        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-40 border whitespace-nowrap ${
          onHold
            ? 'bg-amber-400 hover:bg-amber-300 border-amber-400 text-black font-bold'
            : 'bg-th/[0.07] hover:bg-th/[0.13] border-th/25 text-th/60 hover:text-th/85'
        }`}
      >
        {loading ? '…' : onHold ? '⏸ On Hold ▾' : '⏸ Hold ▾'}
      </button>

      {tooltip}

      {dropdown}

      {showReasonModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-brand-surface border border-th/10 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div>
              <h3 className="text-sm font-semibold text-th">Put on hold</h3>
              <p className="text-xs text-th/40 mt-0.5">Optional — add a reason so the team knows why.</p>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Waiting for client feedback…"
              rows={3}
              className="w-full bg-brand-surface2 border border-th/10 rounded px-3 py-2 text-sm text-th placeholder-th/25 focus:outline-none focus:border-th/25 resize-none"
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowReasonModal(false); setReason('') }}
                className="px-3 py-1.5 text-th/40 hover:text-th/60 text-xs transition-colors">
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
