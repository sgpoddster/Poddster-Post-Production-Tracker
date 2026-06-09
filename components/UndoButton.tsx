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
      className="px-3 py-1.5 bg-white/[0.07] hover:bg-white/[0.13] border border-white/25 disabled:opacity-40 text-white/60 hover:text-white/85 text-xs font-medium rounded transition-colors whitespace-nowrap"
    >
      {loading ? '…' : '↩ Undo'}
    </button>
  )
}
