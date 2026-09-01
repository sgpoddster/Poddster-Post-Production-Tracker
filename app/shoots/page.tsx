import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { analyseRange, toMinutes, PODDSTER_CONFIG, type DayAnalysis, type Booking, type StudioConfig } from '@/lib/capacity/capacity-engine'
import { getLiveConfig } from '@/lib/capacity/config-loader'
import { loadBookingsForRange } from '@/lib/capacity/bookings-loader'

/* ------------------------------------------------------------------ helpers */

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatHeader(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  const m = monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const f = friday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${m} – ${f}`
}

/** Percentage offset within the 10:00–18:00 display window. */
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

/* ------------------------------------------------------------------ colours */

const ROOM_STYLE: Record<string, { clip: string; buf: string; label: string; dot: string }> = {
  S1: {
    clip:  'bg-sky-500/80',
    buf:   'bg-sky-500/10 border border-dashed border-sky-500/25',
    label: 'text-sky-300',
    dot:   'bg-sky-500',
  },
  S2: {
    clip:  'bg-emerald-500/80',
    buf:   'bg-emerald-500/10 border border-dashed border-emerald-500/25',
    label: 'text-emerald-300',
    dot:   'bg-emerald-500',
  },
  S3: {
    clip:  'bg-violet-500/80',
    buf:   'bg-violet-500/10 border border-dashed border-violet-500/25',
    label: 'text-violet-300',
    dot:   'bg-violet-500',
  },
  S4: {
    clip:  'bg-amber-500/80',
    buf:   'bg-amber-500/10 border border-dashed border-amber-500/25',
    label: 'text-amber-300',
    dot:   'bg-amber-500',
  },
}

const FALLBACK_STYLE = {
  clip:  'bg-th/30',
  buf:   'bg-th/5 border border-dashed border-th/10',
  label: 'text-th/50',
  dot:   'bg-th/40',
}

/* ------------------------------------------------------------------ timeline */

type PlacedBooking = Booking & { roomId?: string }

function RoomRow({ room, bookings, config }: {
  room: { id: string; label: string },
  bookings: PlacedBooking[],
  config: StudioConfig,
}) {
  const style = ROOM_STYLE[room.id] ?? FALLBACK_STYLE
  const buf = config.buffers

  return (
    <div className="flex items-stretch gap-0 min-h-[44px]">
      {/* Room label */}
      <div className="w-24 shrink-0 flex items-center pr-3">
        <span className={`text-xs font-medium ${style.label}`}>{room.label}</span>
      </div>

      {/* Timeline track */}
      <div className="flex-1 relative rounded overflow-hidden bg-th/[0.04] min-h-[36px] self-center">
        {/* Hour gridlines */}
        {[10,11,12,13,14,15,16,17,18].map(h => (
          <div
            key={h}
            className="absolute top-0 h-full border-l border-th/[0.08] pointer-events-none"
            style={{ left: `${pct(h * 60)}%` }}
          />
        ))}

        {bookings.map(b => {
          const startMin = toMins(b.start)
          const endMin   = toMins(b.end)
          const bufBefore = Math.max(600, startMin - buf.beforeMinutes)
          const bufAfter  = Math.min(1080, endMin + buf.afterMinutes)

          const clipL = pct(startMin)
          const clipW = pct(endMin) - clipL
          const bbL   = pct(bufBefore)
          const bbW   = pct(startMin) - bbL
          const baL   = pct(endMin)
          const baW   = pct(bufAfter) - baL

          return (
            <div key={b.id}>
              {/* Buffer before */}
              {bbW > 0 && (
                <div
                  className={`absolute top-[3px] bottom-[3px] rounded-sm ${style.buf}`}
                  style={{ left: `${bbL}%`, width: `${bbW}%` }}
                />
              )}
              {/* Booking clip */}
              <div
                className={`absolute top-0 bottom-0 rounded flex items-center px-1.5 overflow-hidden ${style.clip}`}
                style={{ left: `${clipL}%`, width: `${Math.max(clipW, 0.5)}%` }}
              >
                <span className="text-[10px] text-white/90 font-medium truncate leading-tight">
                  {b.client ?? b.set}
                </span>
              </div>
              {/* Buffer after */}
              {baW > 0 && (
                <div
                  className={`absolute top-[3px] bottom-[3px] rounded-sm ${style.buf}`}
                  style={{ left: `${baL}%`, width: `${baW}%` }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DemandStrip({ slotTimes, demand, atCapacity, operators }: {
  slotTimes: string[]
  demand: number[]
  atCapacity: string[]
  operators: number
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
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-sm transition-all ${
                      over ? 'bg-brand-red' : cap ? 'bg-brand-red/50' : 'bg-th/20'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                )}
                {d > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-th/40 font-mono">
                    {d}
                  </span>
                )}
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
  const hasConflicts = day.conflicts.length > 0
  const hasOvercapacity = day.overCapacity.length > 0

  return (
    <div className="bg-brand-surface rounded-xl border border-brand-surface2 overflow-hidden">
      {/* Day header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-th/[0.05]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-th/90">{formatHeader(new Date(day.date + 'T00:00:00Z'))}</h2>
          {hasOvercapacity && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-brand-red/20 text-brand-red font-medium">Oversold</span>
          )}
          {hasConflicts && !hasOvercapacity && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/15 text-amber-400 font-medium">Conflict</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-th/35">
          {day.operatorsOff.length > 0 && (
            <span>{day.operatorsOff.join(', ')} off</span>
          )}
          <span>{day.bookings.length} shoot{day.bookings.length !== 1 ? 's' : ''}</span>
          <span>{day.operators} operator{day.operators !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4 space-y-1">
        {/* Hour labels */}
        <div className="flex gap-0 mb-2">
          <div className="w-24 shrink-0" />
          <div className="flex-1 relative h-4">
            {[10,11,12,13,14,15,16,17,18].map(h => (
              <span
                key={h}
                className="absolute text-[9px] text-th/25 -translate-x-1/2"
                style={{ left: `${pct(h * 60)}%` }}
              >
                {h}
              </span>
            ))}
          </div>
        </div>

        {/* Room rows */}
        {config.rooms.map(room => (
          <RoomRow
            key={room.id}
            room={room}
            bookings={bookingsByRoom[room.id] ?? []}
            config={config}
          />
        ))}

        {/* Demand strip */}
        {hasBookings && (
          <>
            <div className="pt-1">
              <DemandStrip
                slotTimes={day.slotTimes}
                demand={day.demand}
                atCapacity={day.atCapacity}
                operators={day.operators}
              />
            </div>
            <div className="flex gap-0 mt-0.5">
              <div className="w-24 shrink-0 flex items-center">
                <span className="text-[9px] text-th/25">operators</span>
              </div>
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
          <div className="flex items-center gap-0">
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
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Only admin for now (read-only page, but capacity data is sensitive)
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

  const prevMonday = new Date(monday)
  prevMonday.setUTCDate(monday.getUTCDate() - 7)
  const nextMonday = new Date(monday)
  nextMonday.setUTCDate(monday.getUTCDate() + 7)

  const fromDate = isoDate(monday)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  const toDate = isoDate(friday)

  // Load config + bookings
  let config: StudioConfig
  try { config = await getLiveConfig() }
  catch { config = PODDSTER_CONFIG }

  const bookings = await loadBookingsForRange(fromDate, toDate)

  // Analyse
  const days = analyseRange(bookings, config, fromDate, toDate)

  // Fill all 5 weekdays (so empty days still render)
  const weekDays: DayAnalysis[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const dateStr = isoDate(d)
    const found = days.find(da => da.date === dateStr)
    if (found) {
      weekDays.push(found)
    } else {
      // Synthesize an empty day structure
      weekDays.push({
        date: dateStr,
        weekday: i + 1,
        operators: config.operators.names.length,
        operatorsOff: [],
        bookings: [],
        slotTimes: [],
        engaged: {},
        demand: [],
        atCapacity: [],
        overCapacity: [],
        openSlots: {},
        conflicts: [],
      })
    }
  }

  // Weekly summary
  const totalShoots = days.reduce((n, d) => n + d.bookings.length, 0)
  const atCapDays = days.filter(d => d.atCapacity.length > 0).length
  const conflictDays = days.filter(d => d.conflicts.length > 0).length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-th/90">Shoots</h1>
          <p className="text-sm text-th/40 mt-0.5">Studio capacity view</p>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-2">
          <Link
            href={`/shoots?w=${isoDate(prevMonday)}`}
            className="text-sm px-3 py-1.5 rounded bg-th/[0.06] hover:bg-th/10 text-th/60 hover:text-th transition-colors"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-th/80 min-w-[160px] text-center">
            {formatWeekLabel(monday)}
          </span>
          <Link
            href={`/shoots?w=${isoDate(nextMonday)}`}
            className="text-sm px-3 py-1.5 rounded bg-th/[0.06] hover:bg-th/10 text-th/60 hover:text-th transition-colors"
          >
            →
          </Link>
          {isoDate(monday) !== isoDate(defaultMonday) && (
            <Link
              href="/shoots"
              className="text-xs px-3 py-1.5 rounded bg-th/[0.04] hover:bg-th/[0.08] text-th/40 hover:text-th/60 transition-colors ml-1"
            >
              Today
            </Link>
          )}
        </div>
      </div>

      {/* Weekly summary strip */}
      <div className="flex items-center gap-6 px-5 py-3 bg-brand-surface rounded-xl border border-brand-surface2 text-sm">
        <div>
          <span className="text-th/40 text-xs">Shoots</span>
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
