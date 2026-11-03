'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FootageSendButton({
  deliveryId,
  hasDriveLink,
  recipients,
}: {
  deliveryId: string
  hasDriveLink: boolean
  recipients: string[]
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function send() {
    if (!hasDriveLink) { alert('Save a Drive link first'); return }
    if (!recipients.length) { alert('Add the client\'s email first'); return }
    if (!confirm(`Send footage delivery email to:\n\n${recipients.join('\n')}`)) return
    setLoading(true)
    const res = await fetch(`/api/footage/${deliveryId}/send`, { method: 'POST' })
    const d = res.ok ? {} : await res.json().catch(() => ({}))
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
