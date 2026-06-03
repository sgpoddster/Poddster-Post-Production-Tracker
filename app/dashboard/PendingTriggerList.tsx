'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import TriggerButton from './TriggerButton'

export interface PendingItem {
  id: string
  job_id: string
  internal_id: string
  client_name: string | null
  type: 'episode' | 'highlight'
  highlight_number: number | null
  filming_date: string | null
  filming_time: string | null
  drive_link: string | null
  editorName: string
}

export default function PendingTriggerList({
  items,
  isAdmin,
  emptyText,
}: {
  items: PendingItem[]
  isAdmin: boolean
  emptyText: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // The Job ID currently being selected (selection is locked to one Job ID)
  const selectedJobId = selected.size > 0
    ? items.find(i => selected.has(i.id))?.job_id ?? null
    : null

  const toggle = (item: PendingItem) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  const clear = () => setSelected(new Set())

  async function triggerSelected() {
    if (selected.size === 0) return
    setSubmitting(true)
    const res = await fetch('/api/projects/trigger-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds: Array.from(selected) }),
    })
    setSubmitting(false)
    if (res.ok) {
      clear()
      router.refresh()
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-white/25 pl-4">{emptyText}</p>
  }

  return (
    <div className="space-y-3">
      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-2.5">
          <span className="text-xs text-white/70">
            <strong className="text-white">{selected.size}</strong> selected
            {selectedJobId && <span className="text-white/40 font-mono ml-2">Job {selectedJobId}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clear}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white/80 transition-colors">
              Clear
            </button>
            <button onClick={triggerSelected} disabled={submitting}
              className="px-4 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              {submitting ? 'Triggering…' : `▶ Trigger all selected (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
        {items.map(item => {
          const checked = selected.has(item.id)
          // Lock selection to a single Job ID
          const disabled = selected.size > 0 && item.job_id !== selectedJobId
          const typeLabel = item.type === 'episode' ? 'Episode' : `Highlight #${item.highlight_number}`

          return (
            <div key={item.id}
              className={`flex items-center gap-3 px-3 sm:px-5 py-3.5 sm:py-4 transition-colors group ${
                checked ? 'bg-brand-red/[0.06]' : 'hover:bg-white/[0.03]'
              }`}>
              {/* Checkbox */}
              <button
                onClick={() => !disabled && toggle(item)}
                disabled={disabled}
                title={disabled ? 'Different Job ID — clear selection to pick this one' : 'Select'}
                className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                  checked ? 'bg-brand-red border-brand-red'
                  : disabled ? 'border-white/10 opacity-30 cursor-not-allowed'
                  : 'border-white/25 hover:border-white/50'
                }`}
              >
                {checked && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              <Link href={`/projects/${item.id}`} className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <code className="hidden sm:block text-xs text-white/20 shrink-0 w-20 font-mono">{item.internal_id}</code>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-white group-hover:text-white/90 truncate block">
                    {item.client_name || '—'}
                  </span>
                  <div className="text-xs text-white/35 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{typeLabel}</span>
                    {item.filming_date && <><span className="text-white/15">·</span>{formatDate(item.filming_date)}{item.filming_time ? ` · ${item.filming_time}` : ''}</>}
                    <span className="text-white/15">·</span>
                    <span className="font-medium text-white/60">{item.editorName}</span>
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {item.drive_link && (
                  <a href={item.drive_link} target="_blank" rel="noreferrer"
                    className="hidden sm:block text-xs text-white/30 hover:text-white/60 transition-colors">Drive ↗</a>
                )}
                <TriggerButton projectId={item.id} isAdmin={isAdmin} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
