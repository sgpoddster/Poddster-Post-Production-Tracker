'use client'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

export function SortControl({ paramKey, dateLabel }: { paramKey: string; dateLabel: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const current = searchParams.get(paramKey) ?? 'date'

  function onChange(val: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (val === 'date') params.delete(paramKey)
    else params.set(paramKey, val)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  return (
    <select
      value={current}
      onChange={e => onChange(e.target.value)}
      className="text-[11px] text-th/40 bg-brand-surface border border-th/[0.08] rounded px-2 py-1 hover:border-th/20 transition-colors cursor-pointer focus:outline-none"
    >
      <option value="date">{dateLabel}</option>
      <option value="name">Client Name</option>
      <option value="producer">Producer</option>
    </select>
  )
}
