'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Holiday {
  id: string
  date: string        // YYYY-MM-DD
  name: string | null
}

function fmt(date: string) {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function HolidayManager({ initial }: { initial: Holiday[] }) {
  const router = useRouter()
  const [holidays, setHolidays] = useState<Holiday[]>(initial)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to add')
      setLoading(false)
      return
    }
    const { holiday } = await res.json()
    setHolidays(prev =>
      [...prev.filter(h => h.date !== holiday.date), holiday].sort((a, b) => a.date.localeCompare(b.date))
    )
    setDate('')
    setName('')
    setLoading(false)
    router.refresh()
  }

  async function remove(id: string) {
    await fetch('/api/admin/holidays', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setHolidays(prev => prev.filter(h => h.id !== id))
    router.refresh()
  }

  // Group by year, descending years
  const byYear = new Map<string, Holiday[]>()
  for (const h of holidays) {
    const y = h.date.slice(0, 4)
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(h)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40">
        Closed days are skipped when counting working-day deadlines (5 for first cuts, 3 for revisions),
        just like weekends.
      </p>

      {/* Add form */}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-lg border border-white/[0.08] bg-brand-surface p-3">
        <div className="space-y-1">
          <label className="text-[10px] text-white/30 uppercase tracking-wider">Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required
            className="bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/25" />
        </div>
        <div className="space-y-1 flex-1 min-w-[160px]">
          <label className="text-[10px] text-white/30 uppercase tracking-wider">Name (optional)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. National Day"
            className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
        </div>
        <button type="submit" disabled={loading || !date}
          className="px-4 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-xs font-medium rounded transition-colors">
          {loading ? 'Adding…' : '+ Add closed day'}
        </button>
        {error && <p className="text-xs text-brand-red w-full">{error}</p>}
      </form>

      {holidays.length === 0 && (
        <p className="text-sm text-white/25 px-1">No closed days added yet.</p>
      )}

      {/* Per-year lists */}
      {years.map(year => (
        <div key={year} className="space-y-2">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest">
            {year} <span className="text-white/25">{byYear.get(year)!.length}</span>
          </h3>
          <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
            {byYear.get(year)!.map(h => (
              <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white">{fmt(h.date)}</span>
                  {h.name && <span className="text-xs text-white/40">{h.name}</span>}
                </div>
                <button onClick={() => remove(h.id)}
                  className="text-xs text-white/25 hover:text-brand-red transition-colors">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
