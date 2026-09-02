'use client'

import { useEffect, useRef, useState } from 'react'

interface LeaveEntry {
  id: string
  date: string
  operator: string
  note: string | null
}

interface Props {
  operators: string[]
  onClose: () => void
}

export default function OperatorLeaveModal({ operators, onClose }: Props) {
  const [entries, setEntries] = useState<LeaveEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedOp, setSelectedOp] = useState(operators[0] ?? '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [note, setNote] = useState('')

  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchEntries()
  }, [])

  async function fetchEntries() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/shoots/operator-leave')
    if (!res.ok) { setError('Failed to load'); setLoading(false); return }
    const json = await res.json()
    setEntries(json.entries ?? [])
    setLoading(false)
  }

  // Expand fromDate..toDate into individual YYYY-MM-DD strings (skipping weekends)
  function expandDates(from: string, to: string): string[] {
    if (!from) return []
    const end = to || from
    const dates: string[] = []
    const cur = new Date(from + 'T00:00:00')
    const last = new Date(end + 'T00:00:00')
    while (cur <= last) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) {
        dates.push(cur.toISOString().slice(0, 10))
      }
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!fromDate || !selectedOp) return
    setSaving(true)
    setError(null)
    const dates = expandDates(fromDate, toDate)
    if (!dates.length) { setError('No weekdays in range'); setSaving(false); return }
    const res = await fetch('/api/shoots/operator-leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dates, operator: selectedOp, note: note || undefined }),
    })
    if (!res.ok) {
      const j = await res.json()
      setError(j.error ?? 'Failed to save')
    } else {
      setFromDate(''); setToDate(''); setNote('')
      await fetchEntries()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/shoots/operator-leave/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to delete'); return }
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  // Group entries by operator
  const byOp: Record<string, LeaveEntry[]> = {}
  for (const e of entries) {
    ;(byOp[e.operator] ??= []).push(e)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="font-semibold text-zinc-900 dark:text-white text-base">Operator Availability</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Add form */}
          <form onSubmit={handleAdd} className="space-y-3">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Mark as unavailable
            </p>
            <div className="flex gap-2">
              <select
                value={selectedOp}
                onChange={e => setSelectedOp(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm px-3 py-2 text-zinc-900 dark:text-white"
              >
                {operators.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">From</label>
                <input
                  type="date"
                  value={fromDate}
                  min={today}
                  onChange={e => setFromDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm px-3 py-2 text-zinc-900 dark:text-white"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">To (optional)</label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate || today}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm px-3 py-2 text-zinc-900 dark:text-white"
                />
              </div>
            </div>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {saving ? 'Saving…' : 'Add absence'}
            </button>
          </form>

          {/* Existing entries */}
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Upcoming absences
            </p>
            {loading ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-zinc-400">No absences recorded.</p>
            ) : (
              <div className="space-y-3">
                {operators.map(op => {
                  const opEntries = byOp[op]
                  if (!opEntries?.length) return null
                  return (
                    <div key={op}>
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{op}</p>
                      <div className="space-y-1">
                        {opEntries.map(entry => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2"
                          >
                            <div>
                              <span className="text-sm text-zinc-800 dark:text-zinc-200">
                                {formatDate(entry.date)}
                              </span>
                              {entry.note && (
                                <span className="text-xs text-zinc-400 ml-2">{entry.note}</span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="text-zinc-400 hover:text-red-500 text-sm ml-3 transition-colors"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
