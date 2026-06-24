'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FootageExtendButton({ deliveryId }: { deliveryId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function extend() {
    if (!confirm('Mark Poddster Cloud as purchased and extend expiry by 6 months?')) return
    setLoading(true)
    const res = await fetch(`/api/footage/${deliveryId}/extend`, { method: 'POST' })
    setLoading(false)
    if (res.ok) {
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(`Could not extend: ${d.error ?? res.status}`)
    }
  }

  return (
    <button
      onClick={extend}
      disabled={loading}
      className="shrink-0 px-2 py-0.5 text-[11px] text-th/30 hover:text-sky-400 transition-colors whitespace-nowrap"
      title="Poddster Cloud purchased — extend expiry by 6 months"
    >
      {loading ? '…' : '☁ +6mo'}
    </button>
  )
}
