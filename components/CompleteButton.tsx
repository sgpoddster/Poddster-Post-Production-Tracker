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
      className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors whitespace-nowrap"
    >
      {loading ? 'Saving…' : '✓ Complete'}
    </button>
  )
}
