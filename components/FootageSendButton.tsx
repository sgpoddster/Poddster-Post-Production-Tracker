'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FootageSendButton({
  deliveryId,
  hasDriveLink,
}: {
  deliveryId: string
  hasDriveLink: boolean
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function send() {
    if (!hasDriveLink) { alert('Save a Drive link first'); return }
    if (!confirm('Send footage delivery email to the client?')) return
    setLoading(true)
    const res = await fetch(`/api/footage/${deliveryId}/send`, { method: 'POST' })
    setLoading(false)
    if (res.ok) {
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(`Could not send: ${d.error ?? res.status}`)
    }
  }

  return (
    <button
      onClick={send}
      disabled={loading || !hasDriveLink}
      className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded transition-colors whitespace-nowrap"
    >
      {loading ? '…' : '✉ Send 4K'}
    </button>
  )
}
