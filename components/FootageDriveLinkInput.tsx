'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FootageDriveLinkInput({
  deliveryId,
  initialLink,
}: {
  deliveryId: string
  initialLink: string | null
}) {
  const [link, setLink] = useState(initialLink ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    if (!link.trim()) return
    setSaving(true)
    const res = await fetch(`/api/footage/${deliveryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drive_link: link.trim() }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(`Could not save: ${d.error ?? res.status}`)
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <input
        type="url"
        placeholder="Paste Google Drive link…"
        value={link}
        onChange={e => setLink(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()}
        className="flex-1 min-w-0 bg-th/[0.05] border border-th/10 rounded px-2.5 py-1.5 text-xs text-th/80 placeholder:text-th/25 focus:outline-none focus:border-th/25 transition-colors"
      />
      <button
        onClick={save}
        disabled={saving || !link.trim()}
        className="shrink-0 px-2.5 py-1.5 bg-th/[0.07] hover:bg-th/[0.12] disabled:opacity-40 text-th/60 text-xs font-medium rounded transition-colors whitespace-nowrap"
      >
        {saving ? '…' : saved ? '✓' : 'Save'}
      </button>
    </div>
  )
}
