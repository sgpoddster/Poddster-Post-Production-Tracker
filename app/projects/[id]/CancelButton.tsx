'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelButton({ projectId }: { projectId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function cancel() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/cancel`, { method: 'POST' })
    router.push('/dashboard')
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/40">Cancel project?</span>
        <button
          onClick={cancel}
          disabled={loading}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
        >
          {loading ? '…' : 'Yes, cancel'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
        >
          Keep
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-3 py-1.5 bg-transparent hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-white/30 hover:text-red-400 text-xs font-medium rounded transition-colors"
    >
      ✕ Cancel Project
    </button>
  )
}
