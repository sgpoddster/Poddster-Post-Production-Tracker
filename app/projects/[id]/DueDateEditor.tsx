'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'

interface Props {
  projectId: string
  versionId: string
  dueDate: string | null
}

export default function DueDateEditor({ projectId, versionId, dueDate }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(dueDate ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function save() {
    if (!value) return
    setSaving(true)
    await fetch(`/api/projects/${projectId}/version/due-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, dueDate: value }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  function cancel() {
    setValue(dueDate ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="bg-th/[0.07] border border-th/20 rounded px-2 py-0.5 text-xs text-th/80 focus:outline-none focus:border-th/40"
        />
        <button
          onClick={save}
          disabled={saving || !value}
          className="text-xs text-green-400 hover:text-green-300 disabled:opacity-40 transition-colors font-medium"
        >
          {saving ? '…' : '✓'}
        </button>
        <button onClick={cancel} className="text-xs text-th/30 hover:text-th/60 transition-colors">
          ✕
        </button>
      </span>
    )
  }

  return (
    <span
      className="group inline-flex items-center gap-1 cursor-pointer"
      onClick={() => setEditing(true)}
    >
      <span>{dueDate ? `Due ${formatDate(dueDate)}` : 'No due date'}</span>
      <span className="text-th/20 group-hover:text-th/50 transition-colors text-xs">✎</span>
    </span>
  )
}
