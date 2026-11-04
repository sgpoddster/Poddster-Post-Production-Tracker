'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Booking email (from the calendar), the matched client's emails from Admin → Clients,
// and one-off extra people for this booking only.
export default function FootageRecipients({
  deliveryId,
  email,
  extraEmails,
  clientName,
  clientEmails,
}: {
  deliveryId: string
  email: string | null
  extraEmails: string[]
  clientName: string | null
  clientEmails: string[]
}) {
  const [editingPrimary, setEditingPrimary] = useState(false)
  const [primary, setPrimary] = useState(email ?? '')
  const [adding, setAdding] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function patch(body: { email?: string; extra_emails?: string[] }) {
    setSaving(true)
    const res = await fetch(`/api/footage/${deliveryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(`Could not save: ${d.error ?? res.status}`)
      return false
    }
    router.refresh()
    return true
  }

  async function savePrimary() {
    if (primary.trim() === (email ?? '')) { setEditingPrimary(false); return }
    if (await patch({ email: primary.trim() })) setEditingPrimary(false)
  }

  async function addExtra() {
    const v = newEmail.trim()
    if (!v) { setAdding(false); return }
    if (await patch({ extra_emails: [...extraEmails, v] })) {
      setNewEmail('')
      setAdding(false)
    }
  }

  async function removeExtra(e: string) {
    if (!confirm(`Stop sending footage to ${e}?`)) return
    await patch({ extra_emails: extraEmails.filter(x => x !== e) })
  }

  const inputCls = 'min-w-0 w-56 bg-th/[0.05] border border-th/10 rounded px-2 py-1 text-xs text-th/80 placeholder:text-th/25 focus:outline-none focus:border-th/25'

  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
      {editingPrimary ? (
        <input
          autoFocus
          type="email"
          value={primary}
          placeholder="Booking email…"
          onChange={e => setPrimary(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') savePrimary(); if (e.key === 'Escape') { setPrimary(email ?? ''); setEditingPrimary(false) } }}
          onBlur={savePrimary}
          disabled={saving}
          className={inputCls}
        />
      ) : email ? (
        <button
          onClick={() => setEditingPrimary(true)}
          title="Booking email — click to edit"
          className="px-2 py-0.5 rounded bg-th/[0.06] text-th/60 hover:text-th/80 transition-colors"
        >
          ✉ {email}
        </button>
      ) : (
        <button
          onClick={() => setEditingPrimary(true)}
          className={clientEmails.length
            ? 'px-2 py-0.5 rounded text-th/35 hover:text-th/70 hover:bg-th/[0.05] transition-colors'
            : 'px-2 py-0.5 rounded bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 transition-colors'}
        >
          {clientEmails.length ? '+ Booking email' : '⚠ No email — add'}
        </button>
      )}

      {clientEmails
        .filter(e => e.toLowerCase() !== (email ?? '').toLowerCase())
        .map(e => (
          <span
            key={`c-${e}`}
            title={`From Admin → Clients: ${clientName} — edit it there`}
            className="px-2 py-0.5 rounded bg-green-500/10 text-green-300/80"
          >
            👤 {e}
          </span>
        ))}

      {extraEmails.map(e => (
        <span key={e} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-blue-500/10 text-blue-300/80">
          {e}
          <button
            onClick={() => removeExtra(e)}
            disabled={saving}
            title={`Remove ${e}`}
            className="px-1 text-th/40 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          type="email"
          value={newEmail}
          placeholder="Extra recipient email…"
          onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addExtra(); if (e.key === 'Escape') { setNewEmail(''); setAdding(false) } }}
          onBlur={addExtra}
          disabled={saving}
          className={inputCls}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="px-2 py-0.5 rounded text-th/35 hover:text-th/70 hover:bg-th/[0.05] transition-colors"
        >
          + Add recipient
        </button>
      )}
    </div>
  )
}
