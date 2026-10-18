import { fetchStaffLeave } from '@/lib/staff-leave'
import { createClient } from '@/lib/supabase/server'

const EDITOR_EMAILS = [
  'ben@poddster.com',
  'rusette@poddster.com',
  'claudine@poddster.com',
  'dain@poddster.com',
  'jake@poddster.com',
  'kirk@poddster.com',
  'mark@poddster.com',
  'martin@poddster.com',
  'sam@poddster.com',
]

// Fallback names for editors not yet in user_profiles
const FALLBACK_NAMES: Record<string, string> = {
  'sam@poddster.com': 'Sam Lim',
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']
  if (start === end) return `${s.getDate()} ${months[s.getMonth()]}`
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]}`
  return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]}`
}

export default async function StaffLeaveBanner() {
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('email, display_name')
    .in('email', EDITOR_EMAILS)

  const editorsByEmail: Record<string, string> = { ...FALLBACK_NAMES }
  for (const p of profiles ?? []) {
    if (p.email && p.display_name) {
      editorsByEmail[p.email.toLowerCase()] = p.display_name
    }
  }

  const { today, upcoming } = await fetchStaffLeave(editorsByEmail)

  const offlineToday = new Set(today.map(e => e.name))
  const offlineSoon = new Map(upcoming.map(e => [e.name, e]))

  // Sort: offline today first, then upcoming, then online
  const editors = EDITOR_EMAILS
    .map(email => ({ email, name: editorsByEmail[email] ?? email }))
    .filter(e => e.name)
    .sort((a, b) => {
      const aOff = offlineToday.has(a.name) ? 0 : offlineSoon.has(a.name) ? 1 : 2
      const bOff = offlineToday.has(b.name) ? 0 : offlineSoon.has(b.name) ? 1 : 2
      return aOff - bOff
    })

  return (
    <div className="rounded-xl border border-th/[0.07] bg-brand-surface px-4 py-3.5">
      <p className="text-[10px] font-medium text-th/30 uppercase tracking-wider mb-2.5">Producer availability</p>
      <div className="flex flex-wrap gap-2">
        {editors.map(({ name }) => {
          const isOffToday = offlineToday.has(name)
          const upcoming = offlineSoon.get(name)

          if (isOffToday) {
            const entry = today.find(e => e.name === name)!
            return (
              <div key={name} className="flex items-center gap-2 rounded-lg px-3 py-1.5 border"
                style={{ background: 'rgba(226,75,74,0.08)', borderColor: 'rgba(226,75,74,0.2)' }}>
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                <span className="text-sm font-medium text-th/80 whitespace-nowrap">{name}</span>
                {entry.endDate !== entry.startDate && (
                  <span className="text-xs whitespace-nowrap" style={{ color: 'rgba(226,75,74,0.65)' }}>
                    until {formatDateRange(entry.endDate, entry.endDate)}
                  </span>
                )}
              </div>
            )
          }

          if (upcoming) {
            return (
              <div key={name} className="flex items-center gap-2 rounded-lg px-3 py-1.5 bg-th/[0.04] border border-amber-400/15">
                <span className="w-2 h-2 rounded-full bg-amber-400/60 shrink-0" />
                <span className="text-sm font-medium text-th/70 whitespace-nowrap">{name}</span>
                <span className="text-xs text-th/35 whitespace-nowrap">{formatDateRange(upcoming.startDate, upcoming.endDate)}</span>
              </div>
            )
          }

          return (
            <div key={name} className="flex items-center gap-2 rounded-lg px-3 py-1.5 bg-th/[0.04] border border-th/[0.07]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#3ddc97' }} />
              <span className="text-sm font-medium text-th/60 whitespace-nowrap">{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
