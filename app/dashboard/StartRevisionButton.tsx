'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StartRevisionButton({
  projectId,
  currentVersion,
}: {
  projectId: string
  currentVersion: number
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function startRevision() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/revision`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={startRevision}
      disabled={loading}
      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 disabled:opacity-50 text-amber-300 text-xs font-medium rounded transition-colors whitespace-nowrap"
    >
      {loading ? 'Starting…' : `↩ Start V${currentVersion + 1}`}
    </button>
  )
}
