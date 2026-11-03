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
    let res = await fetch(`/api/footage/${deliveryId}/send`, { method: 'POST' })
    let d = res.ok ? {} : await res.json().catch(() => ({}))

    // No email on the booking or any previous one — ask for it, save it, and send
    if (!res.ok && d.code === 'no_email') {
      const email = prompt(`${d.error}. Enter the client's email to send to (it will be saved):`)?.trim()
      if (!email) { setLoading(false); return }
      res = await fetch(`/api/footage/${deliveryId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      d = res.ok ? {} : await res.json().catch(() => ({}))
    }

    setLoading(false)
    if (res.ok) {
      router.refresh()
    } else {
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
