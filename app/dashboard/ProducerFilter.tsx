'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

interface Editor {
  email: string
  display_name: string | null
}

export function ProducerFilter({ editors, selected }: { editors: Editor[]; selected?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const select = (email: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (email) {
      params.set('editor', email)
    } else {
      params.delete('editor')
    }
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`)
    })
  }

  return (
    <div className={`flex items-center gap-1.5 flex-wrap transition-opacity ${isPending ? 'opacity-50' : ''}`}>
      <button
        onClick={() => select(null)}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          !selected
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
        }`}
      >
        All
      </button>
      {editors.map(e => {
        const name = e.display_name || e.email.split('@')[0]
        const isActive = selected === e.email
        return (
          <button
            key={e.email}
            onClick={() => select(e.email)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              isActive
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
            }`}
          >
            {name}
          </button>
        )
      })}
    </div>
  )
}
