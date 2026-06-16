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
        <span className="text-xs text-th/40">Cancel project?</span>
        <button
          onClick={cancel}
          disabled={loading}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-th text-xs font-semibold rounded transition-colors"
        >
          {loading ? '…' : 'Yes, cancel'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-th/40 hover:text-th/70 text-xs transition-colors"
        >
          Keep
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Cancel project"
      className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/10 text-th/20 hover:text-red-400 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}
