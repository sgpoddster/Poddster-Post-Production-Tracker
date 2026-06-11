'use client'

import { useEffect, useState } from 'react'
import { formatFullDate } from '@/lib/utils'

interface Props {
  dueDate: string           // 'YYYY-MM-DD'
  onHold?: boolean
  holdDate?: string | null  // 'YYYY-MM-DD' — the day it was frozen
}

export function CountdownTimer({ dueDate, onHold, holdDate }: Props) {
  const [diffDays, setDiffDays] = useState<number | null>(null)

  useEffect(() => {
    function compute() {
      if (onHold && holdDate) {
        const due  = new Date(dueDate  + 'T23:59:59')
        const held = new Date(holdDate + 'T23:59:59')
        setDiffDays(Math.floor((due.getTime() - held.getTime()) / 86_400_000))
      } else {
        const due = new Date(dueDate + 'T23:59:59')
        const now = new Date()
        setDiffDays(Math.floor((due.getTime() - now.getTime()) / 86_400_000))
      }
    }
    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [dueDate, onHold, holdDate])

  if (diffDays === null) return null

  // Compute label and classes regardless of hold state — same structure always
  let text: string
  let classes: string

  if (onHold) {
    text = diffDays < 0
      ? `${Math.abs(diffDays) + 1}d overdue`
      : diffDays === 0 ? 'Due today' : `${diffDays}d left`
    classes = 'text-black bg-orange-600/40 border-orange-500/50'
  } else if (diffDays < 0) {
    text = `${Math.abs(diffDays) + 1}d overdue`
    classes = 'text-white bg-brand-red border-brand-red'
  } else if (diffDays <= 2) {
    text = diffDays === 0 ? 'Due today' : `${diffDays}d left`
    classes = 'text-black bg-amber-400 border-amber-400'
  } else {
    text = `${diffDays}d left`
    classes = 'text-black bg-green-400 border-green-400'
  }

  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className={`w-24 text-center text-xs font-bold px-2.5 py-1 rounded border ${classes}`}>
        {text}
      </div>
      <span className="hidden lg:block w-44 text-xs text-th/35">{formatFullDate(dueDate)}</span>
    </div>
  )
}
