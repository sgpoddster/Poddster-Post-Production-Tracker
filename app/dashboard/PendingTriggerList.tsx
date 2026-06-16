'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import TriggerButton from './TriggerButton'
import { JobGroup } from '@/components/JobGroup'

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

function groupByJobId(items: PendingItem[]): PendingItem[][] {
  const map = new Map<string, PendingItem[]>()
  for (const item of items) {
    if (!map.has(item.job_id)) map.set(item.job_id, [])
    map.get(item.job_id)!.push(item)
  }
  return Array.from(map.values())
}

function summarise(items: PendingItem[]): string {
  const eps = items.filter(i => i.type === 'episode').length
  const hls = items.filter(i => i.type === 'highlight').length
  const parts: string[] = []
  if (eps) parts.push(`${eps} Episode${eps > 1 ? 's' : ''}`)
  if (hls) parts.push(`${hls} Highlight${hls > 1 ? 's' : ''}`)
  return parts.join(' + ')
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
    if (res.ok) { clear(); router.refresh() }
  }

  if (items.length === 0) {
    return <p className="text-sm text-th/25 pl-4">{emptyText}</p>
  }

  const groups = groupByJobId(items)

  function renderItem(item: PendingItem) {
    const checked = selected.has(item.id)
    const disabled = selected.size > 0 && item.job_id !== selectedJobId
    const typeLabel = item.type === 'episode' ? 'Episode' : `Highlight #${item.highlight_number}`

    return (
      <div key={item.id}
        className={`flex items-center gap-2 px-3 sm:px-5 py-3.5 sm:py-4 transition-colors group ${
          checked ? 'bg-brand-red/[0.06]' : 'hover:bg-th/[0.03]'
        }`}>
        <button
          onClick={() => !disabled && toggle(item)}
          disabled={disabled}
          title={disabled ? 'Different Job ID — clear selection to pick this one' : 'Select'}
          className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors ${
            checked ? 'bg-brand-red border-brand-red'
            : disabled ? 'border-th/10 opacity-30 cursor-not-allowed'
            : 'border-th/25 hover:border-th/50'
          }`}
        >
          {checked && (
            <svg className="w-3 h-3 text-th" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <Link href={`/projects/${item.id}`} className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <code className="hidden sm:block text-sm text-th/45 shrink-0 w-20 font-mono">{item.internal_id}</code>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-th group-hover:text-th/90 truncate">
                {item.client_name || '—'}
              </span>
              {item.filming_date && (
                <span className="text-xs text-th/40">
                  {formatDate(item.filming_date)}
                  {item.filming_time && <span className="ml-1">{item.filming_time.split(' - ')[0]}</span>}
                </span>
              )}
            </div>
            <div className="text-xs text-th/35 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{typeLabel}</span>
              <span className="text-th/15">·</span>
              <span className="font-medium text-th/60">{item.editorName}</span>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <TriggerButton projectId={item.id} isAdmin={isAdmin} />
        </div>
      </div>
    )
  }

  function GroupHeader({ group }: { group: PendingItem[] }) {
    const first = group[0]
    return (
      <div className="flex items-center gap-4 w-full">
        <code className="hidden sm:block text-sm text-th/45 shrink-0 w-20 font-mono">{first.job_id}</code>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-th truncate">{first.client_name || '—'}</span>
            {first.filming_date && (
              <span className="text-xs text-th/40">
                {formatDate(first.filming_date)}
                {first.filming_time && <span className="ml-1">{first.filming_time.split(' - ')[0]}</span>}
              </span>
            )}
          </div>
          <div className="text-xs text-th/35 mt-0.5">
            {summarise(group)}
            <span className="text-th/15 mx-1.5">·</span>
            <span className="font-medium text-th/60">{first.editorName}</span>
          </div>
        </div>
        <div className="shrink-0">
          <span className="text-[10px] text-th/35 bg-th/[0.06] px-2 py-0.5 rounded-full whitespace-nowrap">{group.length} items</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-2.5">
          <span className="text-xs text-th/70">
            <strong className="text-th">{selected.size}</strong> selected
            {selectedJobId && <span className="text-th/40 font-mono ml-2">Job {selectedJobId}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clear} className="px-3 py-1.5 text-xs text-th/50 hover:text-th/80 transition-colors">
              Clear
            </button>
            <button onClick={triggerSelected} disabled={submitting}
              className="px-4 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              {submitting ? 'Triggering…' : `▶ Trigger all selected (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden divide-y divide-th/[0.06]">
        {groups.map(group =>
          group.length === 1 ? (
            renderItem(group[0])
          ) : (
            <JobGroup key={group[0].job_id} header={<GroupHeader group={group} />}>
              {group.map(item => renderItem(item))}
            </JobGroup>
          )
        )}
      </div>
    </div>
  )
}
