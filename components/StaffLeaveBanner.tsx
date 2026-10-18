import { fetchStaffLeave, LeaveEntry } from '@/lib/staff-leave'

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']
  if (start === end) return `${s.getDate()} ${months[s.getMonth()]}`
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]}`
  return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]}`
}

function daysFromNow(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T12:00:00')
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function UpcomingPill({ days }: { days: number }) {
  const label = days === 1 ? 'tomorrow' : `in ${days} days`
  const style = days <= 2
    ? 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
    : 'bg-th/[0.06] text-th/40 border border-th/10'
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}

export default async function StaffLeaveBanner() {
  const { today, upcoming } = await fetchStaffLeave()

  if (today.length === 0 && upcoming.length === 0) return null

  return (
    <div className="rounded-xl border border-th/[0.07] bg-brand-surface px-4 py-3.5 space-y-3">
      {today.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-th/30 uppercase tracking-wider mb-2">Offline today</p>
          <div className="flex flex-wrap gap-2">
            {today.map((e: LeaveEntry) => (
              <div
                key={`${e.name}-${e.startDate}`}
                className="flex items-center gap-2 bg-th/[0.05] border border-th/[0.08] rounded-lg px-3 py-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                <span className="text-sm font-medium text-th">{e.name}</span>
                {e.endDate !== e.startDate && (
                  <span className="text-xs text-th/35">until {formatDateRange(e.endDate, e.endDate)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className={today.length > 0 ? 'border-t border-th/[0.06] pt-3' : ''}>
          <p className="text-[10px] font-medium text-th/30 uppercase tracking-wider mb-2">Coming up</p>
          <div className="flex flex-col gap-1.5">
            {upcoming.map((e: LeaveEntry) => {
              const days = daysFromNow(e.startDate)
              return (
                <div key={`${e.name}-${e.startDate}`} className="flex items-center gap-3 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-th/25 shrink-0" />
                  <span className="font-medium text-th/80 w-28 shrink-0">{e.name}</span>
                  <span className="text-th/40 text-xs">{formatDateRange(e.startDate, e.endDate)}</span>
                  <UpcomingPill days={days} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
