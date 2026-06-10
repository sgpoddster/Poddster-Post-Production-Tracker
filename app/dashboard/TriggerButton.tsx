'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  isAdmin?: boolean
}

export default function TriggerButton({ projectId, isAdmin }: Props) {
  const [loading, setLoading]         = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [submittedDate, setSubmittedDate]   = useState(todayStr())
  const router = useRouter()

  function todayStr() {
    return new Date().toISOString().split('T')[0]
  }

  async function trigger(date?: string) {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submittedDate: date ?? todayStr() }),
    })
    router.refresh()
    setLoading(false)
    setShowDatePicker(false)
  }

  // Non-admin: single button, triggers immediately from today
  if (!isAdmin) {
    return (
      <button
        onClick={() => trigger()}
        disabled={loading}
        className="px-3 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-th text-xs font-medium rounded transition-colors"
      >
        {loading ? 'Starting…' : '▶ Trigger'}
      </button>
    )
  }

  // Admin: button expands to show a date picker for backdating
  if (!showDatePicker) {
    return (
      <button
        onClick={() => setShowDatePicker(true)}
        disabled={loading}
        className="px-3 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-th text-xs font-medium rounded transition-colors"
      >
        {loading ? 'Starting…' : '▶ Trigger'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-brand-surface2 border border-th/10 rounded px-2 py-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-th/30 leading-none">Submission date</span>
        <input
          type="date"
          value={submittedDate}
          max={todayStr()}
          onChange={e => setSubmittedDate(e.target.value)}
          className="bg-transparent text-xs text-th/80 focus:outline-none w-32"
        />
      </div>
      <button
        onClick={() => trigger(submittedDate)}
        disabled={loading}
        className="px-2.5 py-1 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-th text-xs font-medium rounded transition-colors"
      >
        {loading ? '…' : '▶ Go'}
      </button>
      <button
        onClick={() => setShowDatePicker(false)}
        className="text-th/25 hover:text-th/50 text-xs transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
