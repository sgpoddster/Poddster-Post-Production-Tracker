'use client'

import { useTimeFormat } from './TimeFormatProvider'

// Renders an ISO timestamp as a time string in Singapore timezone,
// respecting the user's 12h/24h preference.
export function TimeDisplay({ isoString }: { isoString: string | null }) {
  const { hour12 } = useTimeFormat()
  if (!isoString) return null
  const formatted = new Date(isoString).toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).replace(' ', '')
  return <>{formatted}</>
}
