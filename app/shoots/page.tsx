import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import {
  analyseRange, toMinutes, toTime, resourceGroups,
  PODDSTER_CONFIG,
  type DayAnalysis, type Booking, type StudioConfig,
} from '@/lib/capacity/capacity-engine'
import { getLiveConfig } from '@/lib/capacity/config-loader'
import { loadBookingsForRange } from '@/lib/capacity/bookings-loader'

/* ------------------------------------------------------------------ helpers */

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }

function offsetDate(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function formatHeader(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function formatPinchDate(iso: string): { date: string; day: string } {
  const d = new Date(iso + 'T00:00:00Z')
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    day:  d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
  }
}

function formatWeekLabel(monday: Date): string {
  const friday = offsetDate(monday, 4)
  const m = monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const f = friday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${m} – ${f}`
}

function pct(minutes: number): number {
  return Math.max(0, Math.min(100, ((minutes - 600) / 480) * 100))
}

function toMins(t: string): number { return toMinutes(t) }

function roomIdForSet(config: StudioConfig, set: string): string | null {
  const lower = set.toLowerCase()
  for (const room of config.rooms) {
    if (room.sets.some(s => s.toLowerCase() === lower)) return room.id
  }
  return null
}

/* ------------------------------------------------------------------ pinch points */

type PinchPoint = {
  date: string
  start: string
  end: string
  hours: number
  rooms: { label: string; sets: string[] }[]
  operators: number
}

function computePinchPoints(days: DayAnalysis[], config: StudioConfig): PinchPoint[] {
  const groups = resourceGroups(config)
  const points: PinchPoint[] = []

  for (const day of days) {
    if (day.atCapacity.length === 0) continue

    const atCapSet = new Set(day.atCapacity)
    const slots = day.slotTimes

    let runStart: string | null = null
    let runEndMin = 0

    const flush = (startTime: string, endMin: number) => {
      const startMin = toMinutes(startTime)
      const hours = (endMin - startMin) / 60
      const endTime = toTime(endMin)

      const roomRows: { label: string; sets: string[] }[] = []
      for (const group of groups) {
        const sets: string[] = []
        for (const roomId of group) {
          for (const b of day.bookings as (Booking & { roomId?: string })[]) {
            const rid = b.roomId ?? roomIdForSet(config, b.set)
            if (rid !== roomId) continue
            if (toMinutes(b.start) < endMin && toMinutes(b.end) > startMin) {
              if (!sets.includes(b.set)) sets.push(b.set)
            }
          }
        }
        if (sets.length === 0) continue
        const roomLabels = group.map(id => config.rooms.find(r => r.id === id)!.label)
        const label = group.length > 1
          ? roomLabels.map(l => l.replace('Studio ', '')).join('/').replace(/^/, 'Studio ')
          : roomLabels[0]
        roomRows.push({ label, sets })
      }

      points.push({ date: day.date, start: startTime, end: endTime, hours, rooms: roomRows, operators: day.operators })
    }

    for (let i = 0; i < slots.length; i++) {
      if (atCapSet.has(slots[i])) {
        if (runStart === null) runStart = slots[i]
        runEndMin = toMinutes(slots[i]) + config.slotMinutes
      } else if (runStart !== null) {
        flush(runStart, runEndMin)
        runStart = null
      }
    }
    if (runStart !== null) flush(runStart, runEndMin)
  }

  return points
}

function hardDaySummary(pinchPoints: PinchPoint[]): string | null {
  if (pinchPoints.length === 0) return null
  const hoursByDate: Record<string, number> = {}
  for (const p of pinchPoints) {
    hoursByDate[p.date] = (hoursByDate[p.date] ?? 0) + p.hours
  }
  const sorted = Object.entries(hoursByDate).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return null
  const top = sorted.slice(0, Math.min(2, sorted.length))
  const parts = top.map(([date, h]) => {
    const { date: d, day } = formatPinchDate(date)
    return `${d} ${day} (${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h)`
  })
  return `${parts.join(' and ')} ${top.length > 1 ? 'are' : 'is'} the hardest — all rooms and all operators committed.`
}

/* ------------------------------------------------------------------ colours */

const ROOM_STYLE: Record<string, { clip: string; buf: string; label: string; dot: string }> = {
  S1: { clip: 'bg-sky-500/80',    buf: 'bg-sky-500/10 border border-dashed border-sky-500/25',    label: 'text-sky-300',    dot: 'bg-sky-500'    },
  S2: { clip: 'bg-emerald-500/80',buf: 'bg-emerald-500/10 border border-dashed border-emerald-500/25',label:'text-emerald-300',dot:'bg-emerald-500'},
  S3: { clip: 'bg-violet-500/80', buf: 'bg-violet-500/10 border border-dashed border-violet-500/25', label: 'text-violet-300', dot: 'bg-violet-500' },
  S4: { clip: 'bg-amber-500/80',  buf: 'bg-amber-500/10 border border-dashed border-amber-500/25',  label: 'text-amber-300',  dot: 'bg-amber-500'  },
}
const FALLBACK_STYLE = { clip: 'bg-th/30', buf: 'bg-th/5 border border-dashed border-th/10', label: 'text-th/50', dot: 'bg-th/40' }

/* ------------------------------------------------------------------ pinch points visual */

function PinchPointsVisual({ ppDays, config }: { ppDays: DayAnalysis[]; config: StudioConfig }) {
  const pinchDays = ppDays.filter(d => d.atCapacity.length > 0)
  const allPoints = computePinchPoints(ppDays, config)
  const summary   = hardDaySummary(allPoints)

  if (pinchDays.length === 0) return (
    <div className="bg-brand-surface rounded-xl border border-brand-surface2 px-5 py-4">
      <h2 className="text-sm font-semibold text-th/90 mb-1">Pinch points</h2>
      <p className="text-xs text-th/35">No fully-committed windows in the next 60 days.</p>
    </div>
  )

  return (
    <div className="bg-brand-surface rounded-xl border border-brand-surface2 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-th/[0.05] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-th/90">Pinch points</h2>
          <p className="text-xs text-th/35 mt-0.5">
            {pinchDays.length} day{pinchDays.length !== 1 ? 's' : ''} fully committed in the next 60 days
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-brand-red/15 text-brand-red font-medium">
          {allPoints.length} window{allPoints.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Visual */}
      <div className="px-5 pt-4 pb-3 space-y-1.5">
        {/* Time axis */}
        <div className="flex items-center gap-3">
          <div className="w-28 shrink-0" />
          <div className="flex-1 relative h-4">
            {[10,11,12,13,14,15,16,17,18].map(h => (
              <span key={h} className="absolute text-[9px] text-th/25 -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>
                {h}
              </span>
            ))}
          </div>
          <div className="w-10 shrink-0" />
        </div>

        {/* One row per pinch day */}
        {pinchDays.map(day => {
          const { date, day: dayName } = formatPinchDate(day.date)
          const atCapSet = new Set(day.atCapacity)
          const pinnedHours = day.atCapacity.length * config.slotMinutes / 60

          return (
            <div key={day.date} className="flex items-center gap-3">
              {/* Date label */}
              <div className="w-28 shrink-0 flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-th/80">{date}</span>
                <span className="text-[10px] text-th/30">{dayName}</span>
              </div>

              {/* Timeline strip */}
              <div className="flex-1 relative h-7 bg-th/[0.04] rounded overflow-hidden">
                {/* Hour gridlines */}
                {[10,11,12,13,14,15,16,17,18].map(h => (
                  <div key={h} className="absolute top-0 h-full border-l border-th/[0.08] pointer-events-none" style={{ left: `${pct(h * 60)}%` }} />
                ))}

                {/* Demand slots */}
                {day.slotTimes.map((t, i) => {
                  const d = day.demand[i] ?? 0
                  if (d === 0) return null
                  const atCap = atCapSet.has(t)
                  const slotL = pct(toMinutes(t))
                  const slotW = pct(toMinutes(t) + config.slotMinutes) - slotL
                  const colour = atCap
                    ? 'bg-brand-red/70'
                    : d >= day.operators - 1
                    ? 'bg-amber-400/45'
                    : 'bg-th/[0.14]'
                  return (
                    <div key={t} className={`absolute top-0 bottom-0 ${colour}`} style={{ left: `${slotL}%`, width: `${slotW}%` }} />
                  )
                })}
              </div>

              {/* Hours pinched */}
              <div className="w-10 shrink-0 text-right">
                <span className="text-[10px] font-mono text-brand-red/70">
                  {pinnedHours % 1 === 0 ? pinnedHours.toFixed(0) : pinnedHours.toFixed(1)}h
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend + summary */}
      <div className="px-5 py-3 border-t border-th/[0.05] flex flex-wrap items-center gap-5 text-[10px] text-th/35">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand-red/70 shrink-0" />
          <span>At capacity</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-400/45 shrink-0" />
          <span>2 of {config.operators.names.length} operators</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-th/[0.14] shrink-0" />
          <span>1 operator</span>
        </div>
        {summary && <span className="ml-auto text-th/25 hidden sm:block">· {summary}</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ timeline */

type PlacedBooking = Booking & { roomId?: string }

function RoomRow({ room, bookings, config }: {
  room: { id: string; label: string }
  bookings: PlacedBooking[]
  config: StudioConfig
}) {
  const style = ROOM_STYLE[room.id] ?? FALLBACK_STYLE
  const buf = config.buffers
  return (
    <div className="flex items-stretch gap-0 min-h-[44px]">
      <div className="w-24 shrink-0 flex items-center pr-3">
        <span className={`text-xs font-medium ${style.label}`}>{room.label}</span>
      </div>
      <div className="flex-1 relative rounded overflow-hidden bg-th/[0.04] min-h-[36px] self-center">
        {[10,11,12,13,14,15,16,17,18].map(h => (
          <div key={h} className="absolute top-0 h-full border-l border-th/[0.08] pointer-events-none" style={{ left: `${pct(h * 60)}%` }} />
        ))}
        {bookings.map(b => {
          const startMin = toMins(b.start)
          const endMin   = toMins(b.end)
          const bufBefore = Math.max(600, startMin - buf.beforeMinutes)
          const bufAfter  = Math.min(1080, endMin + buf.afterMinutes)
          const clipL = pct(startMin), clipW = pct(endMin) - clipL
          const bbL = pct(bufBefore), bbW = pct(startMin) - bbL
          const baL = pct(endMin), baW = pct(bufAfter) - baL
          return (
            <div key={b.id}>
              {bbW > 0 && <div className={`absolute top-[3px] bottom-[3px] rounded-sm ${style.buf}`} style={{ left: `${bbL}%`, width: `${bbW}%` }} />}
              <div className={`absolute top-0 bottom-0 rounded flex items-center px-1.5 overflow-hidden ${style.clip}`} style={{ left: `${clipL}%`, width: `${Math.max(clipW, 0.5)}%` }}>
                <span className="text-[10px] text-white/90 font-medium truncate leading-tight">{b.client ?? b.set}</span>
              </div>
              {baW > 0 && <div className={`absolute top-[3px] bottom-[3px] rounded-sm ${style.buf}`} style={{ left: `${baL}%`, width: `${baW}%` }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DemandStrip({ slotTimes, demand, atCapacity, operators }: {
  slotTimes: string[]; demand: number[]; atCapacity: string[]; operators: number
}) {
  const atCapSet = new Set(atCapacity)
  return (
    <div className="flex gap-0 mt-1">
      <div className="w-24 shrink-0" />
      <div className="flex-1 flex">
        {slotTimes.map((t, i) => {
          const d = demand[i] ?? 0
          const cap = atCapSet.has(t)
          const over = d > operators
          const heightPct = operators > 0 ? Math.min(100, (d / operators) * 100) : 0
          return (
            <div key={t} className="flex-1 flex flex-col items-center gap-0.5 px-px">
              <div className="w-full h-6 relative rounded-sm overflow-hidden bg-th/[0.04]">
                {d > 0 && (
                  <div className={`absolute bottom-0 left-0 right-0 rounded-sm ${over ? 'bg-brand-red' : cap ? 'bg-brand-red/50' : 'bg-th/20'}`} style={{ height: `${heightPct}%` }} />
                )}
                {d > 0 && <span className="absolute inset-0 flex items-center justify-center text-[9px] text-th/40 font-mono">{d}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayCard({ day, config }: { day: DayAnalysis; config: StudioConfig }) {
  const bookingsByRoom: Record<string, PlacedBooking[]> = {}
  for (const room of config.rooms) bookingsByRoom[room.id] = []
  for (const b of day.bookings as PlacedBooking[]) {
    const rid = b.roomId ?? roomIdForSet(config, b.set)
    if (rid && bookingsByRoom[rid]) bookingsByRoom[rid].push({ ...b, roomId: rid })
  }
  const hasBookings = day.bookings.length > 0

  return (
    <div className="bg-brand-surface rounded-xl border border-brand-surface2 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-th/[0.05]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-th/90">{formatHeader(new Date(day.date + 'T00:00:00Z'))}</h2>
          {day.overCapacity.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-brand-red/20 text-brand-red font-medium">Oversold</span>}
          {day.conflicts.length > 0 && day.overCapacity.length === 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/15 text-amber-400 font-medium">Conflict</span>}
          {day.atCapacity.length > 0 && day.overCapacity.length === 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-brand-red/10 text-brand-red/70 font-medium">Pinch</span>}
        </div>
        <div className="flex items-center gap-3 text-xs text-th/35">
          {day.operatorsOff.length > 0 && <span>{day.operatorsOff.join(', ')} off</span>}
          <span>{day.bookings.length} shoot{day.bookings.length !== 1 ? 's' : ''}</span>
          <span>{day.operators} operator{day.operators !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="px-5 py-4 space-y-1">
        <div className="flex gap-0 mb-2">
          <div className="w-24 shrink-0" />
          <div className="flex-1 relative h-4">
            {[10,11,12,13,14,15,16,17,18].map(h => (
              <span key={h} className="absolute text-[9px] text-th/25 -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>{h}</span>
            ))}
          </div>
        </div>
        {config.rooms.map(room => (
          <RoomRow key={room.id} room={room} bookings={bookingsByRoom[room.id] ?? []} config={config} />
        ))}
        {hasBookings && (
          <>
            <div className="pt-1">
              <DemandStrip slotTimes={day.slotTimes} demand={day.demand} atCapacity={day.atCapacity} operators={day.operators} />
            </div>
            <div className="flex gap-0 mt-0.5">
              <div className="w-24 shrink-0 flex items-center"><span className="text-[9px] text-th/25">operators</span></div>
              <div className="flex-1 flex">
                {day.slotTimes.map(t => (
                  <div key={t} className="flex-1 flex justify-center">
                    <span className="text-[8px] text-th/20">{t.slice(0,5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {!hasBookings && (
          <div className="flex items-center">
            <div className="w-24 shrink-0" />
            <p className="text-xs text-th/25 italic py-2">No shoots scheduled</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ legend */

function Legend({ config }: { config: StudioConfig }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {config.rooms.map(room => {
        const style = ROOM_STYLE[room.id] ?? FALLBACK_STYLE
        return (
          <div key={room.id} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${style.dot}`} />
            <span className="text-xs text-th/50">{room.label}</span>
            <span className="text-[10px] text-th/25">({room.sets.join('/')})</span>
          </div>
        )
      })}
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-th/25 bg-th/[0.04]" />
        <span className="text-xs text-th/50">30 min changeover</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default async function ShootsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Week navigation
  const params = await searchParams
  const today = new Date()
  const defaultMonday = mondayOf(today)
  let monday = defaultMonday

  if (params.w) {
    const parsed = new Date(params.w + 'T00:00:00Z')
    if (!isNaN(parsed.getTime())) monday = mondayOf(parsed)
  }

  const prevMonday = offsetDate(monday, -7)
  const nextMonday = offsetDate(monday, 7)
  const fromDate = isoDate(monday)
  const toDate   = isoDate(offsetDate(monday, 4))

  // Pinch-point range: today → +60 days
  const ppFrom = isoDate(today)
  const ppTo   = isoDate(offsetDate(today, 60))

  let config: StudioConfig
  try { config = await getLiveConfig() } catch { config = PODDSTER_CONFIG }

  // Load bookings for both ranges in parallel
  const [weekBookings, ppBookings] = await Promise.all([
    loadBookingsForRange(fromDate, toDate),
    loadBookingsForRange(ppFrom, ppTo),
  ])

  const days    = analyseRange(weekBookings, config, fromDate, toDate)
  const ppDays  = analyseRange(ppBookings, config, ppFrom, ppTo)
  const pinchPoints = computePinchPoints(ppDays, config)

  // Fill all 5 weekdays
  const weekDays: DayAnalysis[] = Array.from({ length: 5 }, (_, i) => {
    const dateStr = isoDate(offsetDate(monday, i))
    return days.find(da => da.date === dateStr) ?? {
      date: dateStr, weekday: i + 1,
      operators: config.operators.names.length, operatorsOff: [],
      bookings: [], slotTimes: [], engaged: {}, demand: [],
      atCapacity: [], overCapacity: [], openSlots: {}, conflicts: [],
    }
  })

  const totalShoots  = days.reduce((n, d) => n + d.bookings.length, 0)
  const atCapDays    = days.filter(d => d.atCapacity.length > 0).length
  const conflictDays = days.filter(d => d.conflicts.length > 0).length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-th/90">Shoots</h1>
          <p className="text-sm text-th/40 mt-0.5">Studio capacity — next 60 days</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/shoots?w=${isoDate(prevMonday)}`} className="text-sm px-3 py-1.5 rounded bg-th/[0.06] hover:bg-th/10 text-th/60 hover:text-th transition-colors">←</Link>
          <span className="text-sm font-medium text-th/80 min-w-[160px] text-center">{formatWeekLabel(monday)}</span>
          <Link href={`/shoots?w=${isoDate(nextMonday)}`} className="text-sm px-3 py-1.5 rounded bg-th/[0.06] hover:bg-th/10 text-th/60 hover:text-th transition-colors">→</Link>
          {isoDate(monday) !== isoDate(defaultMonday) && (
            <Link href="/shoots" className="text-xs px-3 py-1.5 rounded bg-th/[0.04] hover:bg-th/[0.08] text-th/40 hover:text-th/60 transition-colors ml-1">Today</Link>
          )}
        </div>
      </div>

      {/* Pinch points — always shows next 60 days regardless of week view */}
      <PinchPointsVisual ppDays={ppDays} config={config} />

      {/* Weekly summary strip */}
      <div className="flex items-center gap-6 px-5 py-3 bg-brand-surface rounded-xl border border-brand-surface2 text-sm">
        <div>
          <span className="text-th/40 text-xs">Shoots this week</span>
          <p className="font-semibold text-th/90">{totalShoots}</p>
        </div>
        <div className="w-px h-8 bg-th/[0.08]" />
        <div>
          <span className="text-th/40 text-xs">Days at capacity</span>
          <p className={`font-semibold ${atCapDays > 0 ? 'text-brand-red' : 'text-th/90'}`}>{atCapDays}</p>
        </div>
        <div className="w-px h-8 bg-th/[0.08]" />
        <div>
          <span className="text-th/40 text-xs">Conflicts</span>
          <p className={`font-semibold ${conflictDays > 0 ? 'text-amber-400' : 'text-th/90'}`}>{conflictDays}</p>
        </div>
        <div className="flex-1" />
        <Legend config={config} />
      </div>

      {/* Day cards */}
      <div className="space-y-3">
        {weekDays.map(day => (
          <DayCard key={day.date} day={day} config={config} />
        ))}
      </div>
    </div>
  )
}
