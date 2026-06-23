'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UndoToDraftButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function undo() {
    if (!confirm('Move this project back to Draft? This will delete the current version row.')) return
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/undo-to-draft`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(`Could not revert to draft: ${d.error ?? res.status}`)
      setLoading(false)
      return
    }
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={undo}
      disabled={loading}
      className="px-3 py-1.5 bg-th/[0.07] hover:bg-th/[0.13] border border-th/25 disabled:opacity-40 text-th/60 hover:text-th/85 text-xs font-medium rounded transition-colors whitespace-nowrap"
    >
      {loading ? '…' : '↩ Draft'}
    </button>
  )
}
