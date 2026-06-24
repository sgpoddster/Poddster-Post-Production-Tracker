'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FootageUndoButton({ deliveryId }: { deliveryId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function undo() {
    if (!confirm('Reset this delivery back to unsent?')) return
    setLoading(true)
    const res = await fetch(`/api/footage/${deliveryId}/undo`, { method: 'POST' })
    setLoading(false)
    if (res.ok) {
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(`Could not undo: ${d.error ?? res.status}`)
    }
  }

  return (
    <button
      onClick={undo}
      disabled={loading}
      className="shrink-0 px-2 py-0.5 text-[11px] text-th/30 hover:text-th/60 transition-colors whitespace-nowrap"
      title="Reset to unsent (testing only)"
    >
      {loading ? '…' : '↺ Undo'}
    </button>
  )
}
