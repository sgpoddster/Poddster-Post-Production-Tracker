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
    const res = await fetch(`/api/projects/${projectId}/revision`, { method: 'POST' })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Could not start revision: ${data.error ?? res.status}`)
      return
    }
    router.refresh()
  }

  return (
    <button
      onClick={startRevision}
      disabled={loading}
      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black text-xs font-medium rounded transition-colors whitespace-nowrap"
    >
      {loading ? 'Starting…' : `↩ Start V${currentVersion + 1}`}
    </button>
  )
}
