'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UndoButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function undo() {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/undo`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={undo}
      disabled={loading}
      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white/40 hover:text-white/60 text-xs font-medium rounded transition-colors"
    >
      {loading ? '…' : '↩ Undo'}
    </button>
  )
}
