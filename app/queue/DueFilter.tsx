'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const OPTIONS = [
  { value: '0',   label: 'Today' },
  { value: '1',   label: '+1 day' },
  { value: '2',   label: '+2 days' },
  { value: 'all', label: 'All' },
]

export function DueFilter({ selected }: { selected: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const set = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete('due')
    else params.set('due', value)
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`)
    })
  }

  const current = selected || 'all'

  return (
    <div className={`inline-flex rounded-lg border border-th/10 bg-th/[0.04] p-0.5 ${isPending ? 'opacity-50' : ''}`}>
      {OPTIONS.map(opt => {
        const active = current === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => set(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              active ? 'bg-th/15 text-th' : 'text-th/45 hover:text-th/70'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
