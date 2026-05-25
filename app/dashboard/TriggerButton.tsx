'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TriggerButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function trigger() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/trigger`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={trigger}
      disabled={loading}
      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
    >
      {loading ? 'Starting…' : '▶ Trigger'}
    </button>
  )
}
