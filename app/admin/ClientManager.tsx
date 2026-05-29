'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Client { id: string; name: string; code: string | null }

export default function ClientManager({ initialClients }: { initialClients: Client[] }) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), code: code.trim() || null }),
    })

    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to add client')
      setLoading(false)
      return
    }

    const { client } = await res.json()
    setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)))
    setName('')
    setCode('')
    setLoading(false)
    router.refresh()
  }

  async function deleteClient(id: string) {
    await fetch('/api/admin/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setClients(prev => prev.filter(c => c.id !== id))
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {/* Existing clients */}
      <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
        {clients.length === 0 && (
          <p className="px-5 py-4 text-sm text-white/25">No clients yet. Add one below.</p>
        )}
        {clients.map(c => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-white">{c.name}</span>
              {c.code && <span className="text-xs text-white/35 font-mono">{c.code}</span>}
            </div>
            <button
              onClick={() => deleteClient(c.id)}
              className="text-xs text-white/25 hover:text-brand-red transition-colors"
            >Remove</button>
          </div>
        ))}
      </div>

      {/* Add new client */}
      <form onSubmit={addClient} className="flex items-center gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Client Name & Code"
          className="flex-1 bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-brand-red/50"
        />
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-4 py-2 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-sm font-medium rounded transition-colors shrink-0"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-brand-red">{error}</p>}
    </div>
  )
}
