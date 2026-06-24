'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FootageConvertButton({
  deliveryId,
  hasDriveLink,
  conversionStatus,
}: {
  deliveryId: string
  hasDriveLink: boolean
  conversionStatus: 'processing' | 'done' | 'error' | null
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function convert() {
    if (!hasDriveLink) { alert('Save a Drive link first'); return }
    if (!confirm('Convert footage to 1080p and send to client? This may take 30–60 minutes for large sessions.')) return
    setLoading(true)
    const res = await fetch(`/api/footage/${deliveryId}/convert`, { method: 'POST' })
    setLoading(false)
    if (res.ok || res.status === 202) {
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(`Could not start conversion: ${d.error ?? res.status}`)
    }
  }

  if (conversionStatus === 'processing') {
    return (
      <span className="shrink-0 px-3 py-1.5 bg-blue-500/15 text-blue-400 text-xs font-medium rounded whitespace-nowrap">
        Converting…
      </span>
    )
  }

  if (conversionStatus === 'done') {
    return (
      <span className="shrink-0 px-2 py-0.5 bg-purple-500/15 text-purple-400 text-[11px] font-medium rounded whitespace-nowrap">
        ✓ 1080p sent
      </span>
    )
  }

  return (
    <button
      onClick={convert}
      disabled={loading || !hasDriveLink}
      className="shrink-0 px-3 py-1.5 bg-green-400 hover:bg-green-300 disabled:opacity-40 text-black text-xs font-bold rounded transition-colors whitespace-nowrap"
    >
      {loading ? '…' : conversionStatus === 'error' ? '↺ Retry 1080p' : 'Convert & Send'}
    </button>
  )
}
