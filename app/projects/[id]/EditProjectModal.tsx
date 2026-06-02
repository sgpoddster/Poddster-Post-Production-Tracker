'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Project } from '@/lib/types'

interface Editor {
  email: string
  display_name: string | null
}

interface Client {
  id: string
  name: string
  code: string
}

interface Props {
  project: Project
  editors: Editor[]
  clients: Client[]
}

export default function EditProjectModal({ project, editors, clients }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  type FormState = {
    client_name: string; client_code: string
    filming_date: string; filming_time: string
    setup: string; seats: string; shoot_duration: string
    drive_link: string
    assigned_editor: string
    editor: string
    notes: string
  }

  const [form, setForm] = useState<FormState>({
    client_name: project.client_name ?? '',
    client_code: project.client_code ?? '',
    filming_date: project.filming_date ?? '',
    filming_time: project.filming_time ?? '',
    setup: project.setup ?? '',
    seats: project.seats != null ? String(project.seats) : '',
    shoot_duration: project.shoot_duration ?? '',
    drive_link: project.drive_link ?? '',
    assigned_editor: project.assigned_editor ?? '',
    editor: project.editor ?? '',
    notes: project.notes ?? '',
  })

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(f => ({ ...f, [key]: e.target.value }))
    }
  }

  // When client is selected from dropdown, auto-fill name + code
  function handleClientSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const client = clients.find(c => c.id === e.target.value)
    if (client) {
      setForm(f => ({ ...f, client_name: client.name, client_code: client.code }))
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = { ...form, seats: form.seats ? parseInt(form.seats, 10) : null }
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Save failed')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-transparent hover:bg-white/10 border border-white/15 text-white/50 hover:text-white/80 text-xs font-medium rounded transition-colors"
      >
        ✎ Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="px-6 py-5 border-b border-white/[0.07]">
              <h2 className="text-base font-semibold text-white">Edit Project</h2>
              <p className="text-xs text-white/35 mt-0.5">{project.internal_id}</p>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Client lookup */}
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Client (quick-fill)</label>
                <select
                  onChange={handleClientSelect}
                  defaultValue=""
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                >
                  <option value="" disabled>Select to fill name & code…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Client Name</label>
                  <input
                    value={form.client_name}
                    onChange={field('client_name')}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Client Code</label>
                  <input
                    value={form.client_code}
                    onChange={field('client_code')}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Filming Date</label>
                  <input
                    type="date"
                    value={form.filming_date}
                    onChange={field('filming_date')}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Filming Time</label>
                  <input
                    value={form.filming_time}
                    onChange={field('filming_time')}
                    placeholder="e.g. 10:00 - 11:00"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Shoot Duration (hours)</label>
                <select
                  value={form.shoot_duration}
                  onChange={field('shoot_duration')}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                >
                  <option value="">— Select —</option>
                  {[1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8].map(h => (
                    <option key={h} value={String(h)}>{h === 1 ? '1 hour' : `${h} hours`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Room / Setup</label>
                <input
                  value={form.setup}
                  onChange={field('setup')}
                  placeholder="e.g. Nova, Nest, River"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">No. of Seats</label>
                <input
                  type="number"
                  value={form.seats}
                  onChange={field('seats')}
                  placeholder="e.g. 4"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Drive Link</label>
                <input
                  value={form.drive_link}
                  onChange={field('drive_link')}
                  placeholder="https://drive.google.com/…"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Producer</label>
                  <select
                    value={form.assigned_editor}
                    onChange={field('assigned_editor')}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                  >
                    <option value="">— unassigned —</option>
                    {editors.map(e => (
                      <option key={e.email} value={e.email}>
                        {e.display_name || e.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Editor</label>
                  <select
                    value={form.editor}
                    onChange={field('editor')}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
                  >
                    <option value="">— Same as producer —</option>
                    {editors.map(e => (
                      <option key={e.email} value={e.email}>
                        {e.display_name || e.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={field('notes')}
                  rows={3}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-brand-red hover:bg-brand-red/90 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
