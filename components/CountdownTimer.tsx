'use client'

import { useEffect, useState } from 'react'

interface Props { dueDate: string }   // 'YYYY-MM-DD'

type TimerStatus = 'overdue' | 'today' | 'soon' | 'ok'

const colours: Record<TimerStatus, string> = {
  overdue: 'bg-red-100 text-red-700 border-red-200',
  today:   'bg-amber-100 text-amber-700 border-amber-200',
  soon:    'bg-orange-100 text-orange-700 border-orange-200',
  ok:      'bg-green-100 text-green-700 border-green-200',
}

export function CountdownTimer({ dueDate }: Props) {
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState<TimerStatus>('ok')

  useEffect(() => {
    function compute() {
      const due = new Date(dueDate + 'T23:59:59')
      const now = new Date()
      const diffMs = due.getTime() - now.getTime()
      const diffDays = Math.floor(diffMs / 86_400_000)

      if (diffMs < 0) {
        const daysLate = Math.ceil(-diffMs / 86_400_000)
        setStatus('overdue')
        setLabel(`${daysLate}d overdue`)
      } else if (diffDays === 0) {
        setStatus('today')
        const hrs = Math.floor(diffMs / 3_600_000)
        setLabel(hrs > 0 ? `${hrs}h left` : 'Due today')
      } else if (diffDays <= 2) {
        setStatus('soon')
        setLabel(`${diffDays}d left`)
      } else {
        setStatus('ok')
        setLabel(`${diffDays}d`)
      }
    }

    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [dueDate])

  if (!label) return null

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${colours[status]}`}>
      ⏱ {label}
    </span>
  )
}
