'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CompleteButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function markComplete() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/complete`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={markComplete}
      disabled={loading}
      className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 disabled:opacity-40 text-green-300 text-xs font-medium rounded transition-colors"
    >
      {loading ? 'Saving…' : '✓ Complete'}
    </button>
  )
}
