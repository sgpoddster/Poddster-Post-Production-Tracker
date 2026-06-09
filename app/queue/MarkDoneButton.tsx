'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MarkDoneButton({
  projectId,
  versionId,
}: {
  projectId: string
  versionId?: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function markDone() {
    if (!versionId) return
    setLoading(true)
    await fetch(`/api/projects/${projectId}/version/done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId }),
    })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={markDone}
      disabled={loading || !versionId}
      className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 disabled:opacity-40 text-green-300 text-xs font-medium rounded transition-colors whitespace-nowrap"
    >
      {loading ? 'Saving…' : '✓ Done'}
    </button>
  )
}
