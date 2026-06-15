'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  versionId: string
  frameioLink: string | null
}

export default function FrameioLinkEditor({ projectId, versionId, frameioLink }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(frameioLink ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function save() {
    setSaving(true)
    await fetch(`/api/projects/${projectId}/version/frameio-link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, frameioLink: value.trim() || null }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  function cancel() {
    setValue(frameioLink ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 w-full mt-1">
        <input
          type="url"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="https://app.frame.io/..."
          autoFocus
          className="flex-1 bg-th/[0.07] border border-th/20 rounded px-2 py-0.5 text-xs text-th/80 placeholder:text-th/25 focus:outline-none focus:border-th/40 min-w-0"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-xs text-green-400 hover:text-green-300 disabled:opacity-40 transition-colors font-medium shrink-0"
        >
          {saving ? '…' : '✓'}
        </button>
        <button onClick={cancel} className="text-xs text-th/30 hover:text-th/60 transition-colors shrink-0">
          ✕
        </button>
      </span>
    )
  }

  if (frameioLink) {
    return (
      <span className="inline-flex items-center gap-1.5 mt-1">
        <a
          href={frameioLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-red/70 hover:text-brand-red transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View in Frame.io
        </a>
        <button
          onClick={() => setEditing(true)}
          className="text-th/20 hover:text-th/50 transition-colors text-xs"
          title="Edit link"
        >
          ✎
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-1 text-th/15 hover:text-th/40 transition-colors block text-xs"
      title="Add Frame.io link"
    >
      ✎
    </button>
  )
}
