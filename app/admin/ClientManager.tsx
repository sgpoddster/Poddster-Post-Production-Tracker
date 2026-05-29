'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Client {
  id: string
  name: string
  code: string | null
  email: string | null
  email_2: string | null
  email_3: string | null
}

const empty = { name: '', code: '', email: '', email_2: '', email_3: '' }

function ClientEmails({ client }: { client: Client }) {
  const emails = [client.email, client.email_2, client.email_3].filter(Boolean)
  if (!emails.length) return <span className="text-white/20 text-xs italic">No email</span>
  return (
    <div className="flex flex-col gap-0.5">
      {emails.map((e, i) => (
        <span key={i} className="text-xs text-white/40">{e}</span>
      ))}
    </div>
  )
}

function EditRow({ client, onSave, onCancel }: {
  client: Client
  onSave: (updated: Client) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name:    client.name,
    code:    client.code    ?? '',
    email:   client.email   ?? '',
    email_2: client.email_2 ?? '',
    email_3: client.email_3 ?? '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.name.trim()) return
    setLoading(true)
    const res = await fetch('/api/admin/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, ...form }),
    })
    if (res.ok) {
      const { client: updated } = await res.json()
      onSave(updated)
    }
    setLoading(false)
  }

  return (
    <div className="px-5 py-4 space-y-3 bg-white/[0.02]">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-white/30 uppercase tracking-wider">Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="Client name"
            className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-white/30 uppercase tracking-wider">Code</label>
          <input value={form.code} onChange={set('code')} placeholder="e.g. ABC"
            className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] text-white/30 uppercase tracking-wider">Email addresses</label>
        {(['email', 'email_2', 'email_3'] as const).map((key, i) => (
          <input key={key} value={form[key]} onChange={set(key)}
            placeholder={i === 0 ? 'Primary email' : `Alternative email ${i + 1}`}
            className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={loading || !form.name.trim()}
          className="px-4 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-xs font-medium rounded transition-colors">
          {loading ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ClientManager({ initialClients }: { initialClients: Client[] }) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState(empty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setNew = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNewForm(f => ({ ...f, [k]: e.target.value }))

  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.name.trim()) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to add client')
      setLoading(false)
      return
    }
    const { client } = await res.json()
    setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)))
    setNewForm(empty)
    setAdding(false)
    setLoading(false)
    router.refresh()
  }

  async function deleteClient(id: string) {
    if (!confirm('Remove this client?')) return
    await fetch('/api/admin/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setClients(prev => prev.filter(c => c.id !== id))
    router.refresh()
  }

  function handleSaved(updated: Client) {
    setClients(prev =>
      prev.map(c => c.id === updated.id ? updated : c)
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    setEditingId(null)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
        {clients.length === 0 && (
          <p className="px-5 py-4 text-sm text-white/25">No clients yet.</p>
        )}
        {clients.map(c => (
          <div key={c.id}>
            {editingId === c.id ? (
              <EditRow client={c} onSave={handleSaved} onCancel={() => setEditingId(null)} />
            ) : (
              <div className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{c.name}</span>
                      {c.code && <span className="text-xs text-white/35 font-mono">{c.code}</span>}
                    </div>
                    <div className="mt-0.5">
                      <ClientEmails client={c} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => setEditingId(c.id)}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => deleteClient(c.id)}
                    className="text-xs text-white/25 hover:text-brand-red transition-colors">
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new client */}
      {!adding ? (
        <button onClick={() => setAdding(true)}
          className="text-xs text-white/40 hover:text-white/70 transition-colors px-1">
          + Add client
        </button>
      ) : (
        <form onSubmit={addClient} className="rounded-lg border border-white/[0.08] bg-brand-surface p-4 space-y-3">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">New client</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider">Name *</label>
              <input value={newForm.name} onChange={setNew('name')} placeholder="Client name" required
                className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider">Code</label>
              <input value={newForm.code} onChange={setNew('code')} placeholder="e.g. ABC"
                className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-white/30 uppercase tracking-wider">Email addresses</label>
            {(['email', 'email_2', 'email_3'] as const).map((key, i) => (
              <input key={key} value={newForm[key]} onChange={setNew(key)}
                placeholder={i === 0 ? 'Primary email' : `Alternative email ${i + 1}`}
                className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={loading || !newForm.name.trim()}
              className="px-4 py-1.5 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-xs font-medium rounded transition-colors">
              {loading ? 'Adding…' : 'Add client'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setNewForm(empty) }}
              className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs transition-colors">
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-brand-red">{error}</p>}
        </form>
      )}
    </div>
  )
}
