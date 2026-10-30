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
  const [loading, setLoading] = useState<'convert' | 'convert-and-send' | null>(null)
  const router = useRouter()

  async function triggerConvert(send: boolean) {
    if (!hasDriveLink) { alert('Save a Drive link first'); return }
    const label = send ? 'Convert footage to 1080p and send to client?' : 'Convert footage to 1080p only (no email sent)?'
    if (!confirm(`${label} This may take 30–60 minutes for large sessions.`)) return
    setLoading(send ? 'convert-and-send' : 'convert')
    const url = `/api/footage/${deliveryId}/convert${send ? '' : '?send=false'}`
    const res = await fetch(url, { method: 'POST' })
    setLoading(null)
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
        ✓ 1080p ready
      </span>
    )
  }

  const isRetry = conversionStatus === 'error'

  return (
    <>
      <button
        onClick={() => triggerConvert(false)}
        disabled={loading !== null || !hasDriveLink}
        className="shrink-0 px-3 py-1.5 bg-th/[0.08] hover:bg-th/[0.14] border border-th/[0.12] disabled:opacity-40 text-th/60 hover:text-th/80 text-xs font-medium rounded transition-colors whitespace-nowrap"
      >
        {loading === 'convert' ? '…' : isRetry ? '↺ Retry' : 'Convert'}
      </button>
      <button
        onClick={() => triggerConvert(true)}
        disabled={loading !== null || !hasDriveLink}
        className="shrink-0 px-3 py-1.5 bg-green-400 hover:bg-green-300 disabled:opacity-40 text-black text-xs font-bold rounded transition-colors whitespace-nowrap"
      >
        {loading === 'convert-and-send' ? '…' : isRetry ? '↺ Retry & Send' : 'Convert & Send'}
      </button>
    </>
  )
}
