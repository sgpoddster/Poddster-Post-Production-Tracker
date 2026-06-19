'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export default function StartRevisionButton({
  projectId,
  currentVersion,
}: {
  projectId: string
  currentVersion: number
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState(todayStr())
  const router = useRouter()

  async function startRevision() {
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/revision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submittedDate: date }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Could not start revision: ${data.error ?? res.status}`)
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black text-xs font-medium rounded transition-colors whitespace-nowrap"
      >
        ↩ V{currentVersion + 1}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 bg-brand-surface2 border border-th/10 rounded px-2 py-1.5">
      {/* Quick-pick chips */}
      <button
        onClick={() => setDate(todayStr())}
        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
          date === todayStr() ? 'bg-amber-400 text-black' : 'text-th/50 hover:text-th/80 hover:bg-th/[0.08]'
        }`}
      >
        Today
      </button>
      <button
        onClick={() => setDate(yesterdayStr())}
        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
          date === yesterdayStr() ? 'bg-amber-400 text-black' : 'text-th/50 hover:text-th/80 hover:bg-th/[0.08]'
        }`}
      >
        Yesterday
      </button>
      <input
        type="date"
        value={date}
        max={todayStr()}
        onChange={e => setDate(e.target.value)}
        className="bg-transparent text-xs text-th/70 focus:outline-none w-28"
      />
      <button
        onClick={startRevision}
        disabled={loading}
        className="px-2.5 py-1 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black text-[11px] font-semibold rounded transition-colors whitespace-nowrap"
      >
        {loading ? '…' : '↩ Go'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-th/25 hover:text-th/50 text-xs transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
