'use client'

import { useState, useEffect, useCallback } from 'react'
import { parseCalendarEvent, CalendarPrefill, RawCalendarEvent } from '@/lib/calendarParser'

type RangeOption = { label: string; days: number }
const RANGE_OPTIONS: RangeOption[] = [
  { label: '7 days',   days: 7   },
  { label: '1 month',  days: 30  },
  { label: '3 months', days: 90  },
  { label: '6 months', days: 180 },
  { label: '1 year',   days: 365 },
]

interface Props {
  onSelect: (data: CalendarPrefill) => void
  onClose:  () => void
}

interface DisplayEvent {
  id: string
  summary: string
  startISO: string
  endISO: string
  description: string | null
  parsed: CalendarPrefill
}

export default function CalendarPicker({ onSelect, onClose }: Props) {
  const [rangeIdx, setRangeIdx]   = useState(2)             // default: 3 months
  const [events, setEvents]       = useState<DisplayEvent[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')

  function changeRange(idx: number) {
    setRangeIdx(idx)
    setSearch('')   // clear search so the new range isn't filtered by the old query
  }

  const fetchEvents = useCallback(async (days: number) => {
    setLoading(true)
    setError(null)

    const to   = new Date()
    to.setDate(to.getDate() + 14)
    const from = new Date()
    from.setDate(from.getDate() - days)

    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
    })

    let json: { events?: RawCalendarEvent[]; errors?: string[]; error?: string; setupNeeded?: boolean; serviceAccountEmail?: string }
    try {
      const res = await fetch(`/api/calendar/events?${params}`)
      json = await res.json()
    } catch {
      setError('Could not reach the calendar API.')
      setLoading(false)
      return
    }

    if (json.error) {
      if (json.setupNeeded && json.serviceAccountEmail) {
        setError(`Calendar setup needed: share all three Poddster calendars with ${json.serviceAccountEmail} (viewer access).`)
      } else {
        setError(json.error)
      }
      setLoading(false)
      return
    }

    const rawItems = json.events ?? []
    const results: DisplayEvent[] = []

    for (const ev of rawItems) {
      if (!ev.start) continue
      results.push({
        id:          ev.id,
        summary:     ev.summary ?? '(No title)',
        startISO:    ev.start.dateTime ?? ev.start.date ?? '',
        endISO:      ev.end?.dateTime  ?? ev.end?.date  ?? '',
        description: ev.description ?? null,
        parsed:      parseCalendarEvent(ev),
      })
    }

    // Deduplicate — the same booking can appear on more than one calendar
    const seen = new Set<string>()
    const unique: DisplayEvent[] = []
    for (const ev of results) {
      const key = `${ev.summary}|${ev.startISO}|${ev.endISO}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(ev)
    }

    // Only show PP bookings (episodes or highlights)
    const ppOnly = unique.filter(ev => ev.parsed.episodeCount > 0 || ev.parsed.highlightCount > 0)

    ppOnly.sort((a, b) => b.startISO.localeCompare(a.startISO))
    setEvents(ppOnly)
    setLoading(false)
  }, [])

  // Fetch on first open and whenever range changes
  useEffect(() => {
    fetchEvents(RANGE_OPTIONS[rangeIdx].days)
  }, [rangeIdx, fetchEvents])

  const filtered = search.trim()
    ? events.filter(ev =>
        ev.summary.toLowerCase().includes(search.trim().toLowerCase())
      )
    : events

  return (
    <>
      {/* Backdrop — sits behind the picker but in front of the main modal */}
      <div className="absolute inset-0 z-10 bg-black/50 rounded-xl" onClick={onClose} />

      {/* Picker panel */}
      <div className="absolute inset-x-0 top-0 z-20 bg-brand-surface border border-th/10 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-th/[0.06] shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-th">Pick from Calendar</h3>
            <p className="text-xs text-th/35 mt-0.5">Select a booking to pre-fill the form</p>
          </div>
          <button onClick={onClose} className="text-th/30 hover:text-th/60 text-lg leading-none">✕</button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 border-b border-th/[0.06] shrink-0 space-y-3">
          {/* Range buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-th/30 mr-1">Show past:</span>
            {RANGE_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => changeRange(i)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  i === rangeIdx
                    ? 'bg-brand-red/20 border border-brand-red/40 text-brand-red'
                    : 'bg-th/5 border border-th/10 text-th/40 hover:text-th/70 hover:bg-th/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
              placeholder="Search by client name…"
              className="w-full bg-brand-surface2 border border-th/10 rounded px-3 py-1.5 pr-7 text-sm text-th/80 placeholder-th/25 focus:outline-none focus:border-brand-red/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-th/30 hover:text-th/60 text-sm leading-none"
              >✕</button>
            )}
          </div>
          {search.trim() && !loading && (
            <p className="text-xs text-th/30">
              {filtered.length} match{filtered.length !== 1 ? 'es' : ''} for &ldquo;{search.trim()}&rdquo;
            </p>
          )}
        </div>

        {/* Event list */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="py-12 text-center text-sm text-th/30 animate-pulse">
              Loading calendar…
            </div>
          )}
          {error && (
            <div className="px-5 py-6 text-sm text-amber-400 bg-amber-500/10">
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-th/25">
              No bookings found in this range.
            </div>
          )}
          {!loading && !error && filtered.map(ev => (
            <EventRow
              key={`${ev.id}|${ev.summary}|${ev.startISO}`}
              event={ev}
              onSelect={() => onSelect(ev.parsed)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function EventRow({ event, onSelect }: { event: DisplayEvent; onSelect: () => void }) {
  const [showDebug, setShowDebug] = useState(false)

  const d       = new Date(event.startISO)
  const dateStr = isNaN(d.getTime()) ? event.startISO.slice(0, 10) : d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const p = event.parsed

  return (
    <div className="border-b border-th/[0.04] last:border-0">
      <div className="flex items-start gap-2 px-5 py-3.5 hover:bg-th/[0.04] transition-colors group">
        <button onClick={onSelect} className="flex-1 text-left min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-th/80 group-hover:text-th truncate">
                {event.summary}
              </div>
              <div className="text-xs text-th/35 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
                {p.duration && <span>· {p.duration}h</span>}
                {p.setup
                  ? <span className="text-green-400/60">· {p.setup}</span>
                  : <span className="text-th/15">· no setup</span>
                }
                {p.seats != null
                  ? <span className="text-green-400/60">· {p.seats} seats</span>
                  : <span className="text-th/15">· no seats</span>
                }
                {(p.episodeCount > 0 || p.highlightCount > 0) && (
                  <span>
                    ·{p.episodeCount > 0 ? ` ${p.episodeCount}ep` : ''}
                    {p.highlightCount > 0 ? ` ${p.highlightCount}hl` : ''}
                  </span>
                )}
                {p.orderId && <span className="text-th/20">· {p.orderId}</span>}
              </div>
            </div>
            <span className="text-xs text-brand-red opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
              Select →
            </span>
          </div>
        </button>
        {/* Debug toggle — lets us see the raw description */}
        <button
          onClick={e => { e.stopPropagation(); setShowDebug(v => !v) }}
          title="Show raw description"
          className="shrink-0 mt-0.5 text-th/15 hover:text-th/40 transition-colors text-xs px-1"
        >
          {showDebug ? '▲' : '▼'}
        </button>
      </div>
      {showDebug && (
        <div className="mx-5 mb-3 rounded bg-th/[0.03] border border-th/[0.06] px-3 py-2">
          <div className="text-xs text-th/25 mb-1 font-mono">raw description:</div>
          <pre className="text-xs text-th/50 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {event.description
              ? JSON.stringify(event.description).slice(1, -1)  // show escape chars as-is
              : '(no description)'}
          </pre>
          <div className="mt-2 pt-2 border-t border-th/[0.05] text-xs text-th/25 font-mono">
            parsed → setup: <span className="text-th/50">{p.setup ?? 'null'}</span>
            {' · '}seats: <span className="text-th/50">{p.seats ?? 'null'}</span>
            {' · '}orderId: <span className="text-th/50">{p.orderId ?? 'null'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
