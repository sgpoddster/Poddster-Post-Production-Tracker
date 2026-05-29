'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  onHold: boolean
}

export default function OnHoldButton({ projectId, onHold }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function toggle() {
    setLoading(true)
    const endpoint = onHold ? 'resume' : 'hold'
    await fetch(`/api/projects/${projectId}/${endpoint}`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return onHold ? (
    // Active hold state — solid amber so it's impossible to miss
    <button
      onClick={toggle}
      disabled={loading}
      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 border border-amber-400 disabled:opacity-40 text-black text-xs font-bold rounded transition-colors"
    >
      {loading ? '…' : '⏸ On Hold'}
    </button>
  ) : (
    // Idle state — plain ghost button, doesn't compete with action buttons
    <button
      onClick={toggle}
      disabled={loading}
      className="px-3 py-1.5 bg-transparent hover:bg-white/10 border border-white/15 disabled:opacity-40 text-white/40 hover:text-white/70 text-xs font-medium rounded transition-colors"
    >
      {loading ? '…' : '⏸ Hold'}
    </button>
  )
}
