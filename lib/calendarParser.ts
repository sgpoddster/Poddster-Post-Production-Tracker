/**
 * Parses a raw Google Calendar event into fields suitable for pre-filling
 * the New Project form. All values are best-effort — nothing is mandatory.
 */

export interface CalendarPrefill {
  rawSummary: string
  rawDescription: string | null
  // clientName / clientCode intentionally omitted — the booking only has the
  // booker's personal name & email, not the company account. Always entered manually.
  filmingDate: string        // 'YYYY-MM-DD'
  filmingHour: string        // '07' – '21'
  filmingMins: string        // '00' | '30'
  duration: string           // '1' | '1.5' … '12' | ''
  episodeCount: number
  highlightCount: number
  setup: string | null       // room name, e.g. "Core", "Nova", "Nest"
  seats: number | null       // number of guests/pax
  orderId: string | null     // booking Order ID, e.g. "PX5FUDJR"
  notes: string | null
}

export interface RawCalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
}

// ─── public entry point ───────────────────────────────────────────────────────

// Strip HTML tags and normalise line endings so regex parsers work regardless
// of whether the Calendar API returned plain text or HTML-formatted descriptions.
function normaliseDesc(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/<br\s*\/?>/gi, '\n')   // <br> → newline
    .replace(/<[^>]+>/g, '')          // strip all other tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r\n/g, '\n')           // normalise CRLF
}

export function parseCalendarEvent(ev: RawCalendarEvent): CalendarPrefill {
  const summary     = ev.summary ?? ''
  const description = ev.description ?? null
  const desc        = normaliseDesc(description)

  // ── date / time / duration ────────────────────────────────────────────────
  const startISO = ev.start.dateTime ?? ev.start.date ?? ''
  const endISO   = ev.end.dateTime   ?? ev.end.date   ?? ''

  const { filmingDate, filmingHour, filmingMins } = parseDateTime(startISO)
  const duration = calcDuration(startISO, endISO)

  // ── episode / highlight counts ────────────────────────────────────────────
  const { episodeCount, highlightCount } = extractDeliverables(desc)

  // ── setup (room name) ─────────────────────────────────────────────────────
  const setup = extractSetup(ev.location ?? null, summary, desc)

  // ── seats ─────────────────────────────────────────────────────────────────
  const seats = extractSeats(desc)

  // ── order ID ──────────────────────────────────────────────────────────────
  const orderId = extractOrderId(desc)

  // ── notes ────────────────────────────────────────────────────────────────
  const notes = extractNotes(desc)

  return {
    rawSummary: summary,
    rawDescription: description,
    filmingDate,
    filmingHour,
    filmingMins,
    duration,
    episodeCount,
    highlightCount,
    setup,
    seats,
    orderId,
    notes,
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseDateTime(iso: string) {
  if (!iso) return { filmingDate: '', filmingHour: '', filmingMins: '00' }

  // "2026-05-08T11:30:00+08:00"  or  "2026-05-08"
  const d = new Date(iso)
  const filmingDate = iso.slice(0, 10)                             // 'YYYY-MM-DD'
  const filmingHour = String(d.getHours()).padStart(2, '0')        // '11'
  const rawMins     = d.getMinutes()
  const filmingMins = rawMins < 15 ? '00' : '30'                  // snap to nearest :00/:30

  return { filmingDate, filmingHour, filmingMins }
}

function calcDuration(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return ''
  const ms   = new Date(endISO).getTime() - new Date(startISO).getTime()
  const hrs  = ms / (1000 * 60 * 60)
  if (hrs <= 0 || hrs > 12) return ''
  // Round to nearest 0.5
  const rounded = Math.round(hrs * 2) / 2
  return String(rounded)
}


function extractDeliverables(desc: string): { episodeCount: number; highlightCount: number } {
  let episodeCount   = 0
  let highlightCount = 0

  if (!desc) return { episodeCount, highlightCount }

  // ── episodes ──────────────────────────────────────────────────────────────
  // Triggers: "Professional Edit" (in services) or "Standard Episode Edit" (in addons)
  // Always counts as 1 episode per session regardless of any multiplier.
  if (/professional\s+edit/i.test(desc) || /standard\s+episode\s+edit/i.test(desc)) {
    episodeCount = 1
  }

  // ── highlights ────────────────────────────────────────────────────────────
  // Formats seen in real data (col K / L of the tracker):
  //   "3 Standard Highlights (1)"  →  3 × 1 = 3
  //   "3 Standard Highlights (3)"  →  3 × 3 = 9
  //   "Standard Highlight (1)"     →  1 × 1 = 1   (singular, no leading count)
  // Formula: base × multiplier, summed across all matches in the string.
  const hlRe = /(?:(\d+)\s+)?Standard\s+Highlights?\s+\((\d+)\)/gi
  let m: RegExpExecArray | null
  while ((m = hlRe.exec(desc)) !== null) {
    const base       = m[1] ? parseInt(m[1], 10) : 1
    const multiplier = parseInt(m[2], 10)
    highlightCount  += base * multiplier
  }

  return { episodeCount, highlightCount }
}

function extractNotes(desc: string): string | null {
  if (!desc) return null
  // "Notes: blah blah"
  const m = desc.match(/notes?\s*:\s*([^\n\r]+)/i)
  return m ? m[1].trim() : null
}

// Extract booking Order ID from description.
// Booking system writes "Order ID: PX5FUDJR"
function extractOrderId(desc: string): string | null {
  if (!desc) return null
  const m = desc.match(/^\s*Order\s+ID\s*:\s*([A-Z0-9]+)/im)
  return m ? m[1].trim() : null
}

// Extract room/setup from the booking description.
// The booking system writes "Setup: Core" (or Nova, Nest, Iris, River, etc.)
// as a line in the description — that's the authoritative source.
function extractSetup(_location: string | null, _summary: string, desc: string): string | null {
  if (!desc) return null
  // Primary: "Setup: Core" — allow leading whitespace after <br> conversion
  const m = desc.match(/^\s*Setup\s*:\s*(.+)$/im)
  if (m) return m[1].trim()
  return null
}

// Extract number of seats/guests/pax from booking description.
// Booking system writes "Seats: 2" as a line in the description.
// Also handles: "No. of Pax: 3", "Guests: 2", "4 pax", "4 guests"
function extractSeats(desc: string): number | null {
  if (!desc) return null
  const patterns = [
    /^\s*Seats\s*:\s*(\d+)/im,                        // " Seats: 2"  (primary - allow leading space)
    /(?:no\.?\s*of\s*pax|pax|guests?)\s*:\s*(\d+)/i, // "No. of Pax: 3"
    /(\d+)\s*(?:pax|guests?)/i,                       // "4 pax" / "4 guests"
  ]
  for (const re of patterns) {
    const m = desc.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > 0 && n < 100) return n
    }
  }
  return null
}
