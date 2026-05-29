'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RoleToggle({
  userId, currentRole, isSelf
}: {
  userId: string; currentRole: string; isSelf: boolean
}) {
  const [role, setRole] = useState(currentRole)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function updateRole(newRole: string) {
    if (isSelf || loading) return
    setLoading(true)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    setRole(newRole)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1 bg-brand-surface2 rounded p-1">
      {(['producer', 'admin'] as const).map(r => (
        <button
          key={r}
          onClick={() => updateRole(r)}
          disabled={isSelf || loading}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize
            ${role === r
              ? r === 'admin'
                ? 'bg-brand-red text-white'
                : 'bg-white/10 text-white'
              : 'text-white/30 hover:text-white/60'
            }
            ${isSelf ? 'opacity-40 cursor-not-allowed' : ''}
          `}
        >
          {r}
        </button>
      ))}
    </div>
  )
}
