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
  isAdmin?: boolean
}

export default function EditProjectModal({ project, editors, clients, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const currentVerDueDate = (project.versions ?? []).find(
    v => v.version_number === project.current_version
  )?.due_date ?? null

  type FormState = {
    client_name: string
    filming_date: string; filming_time: string
    setup: string; seats: string; shoot_duration: string
    drive_link: string
    assigned_editor: string
    editor: string
    current_version: string
    notes: string
    due_date_override: string
  }

  const [form, setForm] = useState<FormState>({
    client_name: project.client_name ?? '',
    filming_date: project.filming_date ?? '',
    filming_time: project.filming_time ?? '',
    setup: project.setup ?? '',
    seats: project.seats != null ? String(project.seats) : '',
    shoot_duration: project.shoot_duration ?? '',
    drive_link: project.drive_link ?? '',
    assigned_editor: project.assigned_editor ?? '',
    editor: project.editor ?? '',
    current_version: String(project.current_version ?? 1),
    notes: project.notes ?? '',
    due_date_override: currentVerDueDate ?? '',
  })

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(f => ({ ...f, [key]: e.target.value }))
    }
  }

  // When client is selected from dropdown, auto-fill name
  function handleClientSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const client = clients.find(c => c.id === e.target.value)
    if (client) {
      setForm(f => ({ ...f, client_name: client.name }))
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      seats: form.seats ? parseInt(form.seats, 10) : null,
      current_version: parseInt(form.current_version, 10) || 1,
      due_date_override: form.due_date_override || null,
    }
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
        title="Edit project"
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-th/10 text-th/35 hover:text-th/70 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L18 8.625" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-[var(--bg-float)] border border-th/10 rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="px-6 py-5 border-b border-th/[0.07]">
              <h2 className="text-base font-semibold text-th">Edit Project</h2>
              <p className="text-xs text-th/35 mt-0.5">{project.internal_id}</p>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Client lookup */}
              <div>
                <label className="block text-xs text-th/40 mb-1.5">Client (quick-fill)</label>
                <select
                  onChange={handleClientSelect}
                  defaultValue=""
                  className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                >
                  <option value="" disabled>Select to fill name…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-th/40 mb-1.5">Client Name</label>
                  <input
                    value={form.client_name}
                    onChange={field('client_name')}
                    placeholder="e.g. Benjamin Loh (QW2)"
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 placeholder-th/25 focus:outline-none focus:border-th/25"
                  />
                </div>
                <div>
                  <label className="block text-xs text-th/40 mb-1.5">Version</label>
                  <select
                    value={form.current_version}
                    onChange={field('current_version')}
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                      <option key={v} value={v}>{v === 1 ? 'V1 · First Cut' : `V${v} · Revision`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-th/40 mb-1.5">Filming Date</label>
                  <input
                    type="date"
                    value={form.filming_date}
                    onChange={field('filming_date')}
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                  />
                </div>
                <div>
                  <label className="block text-xs text-th/40 mb-1.5">Filming Time</label>
                  <input
                    value={form.filming_time}
                    onChange={field('filming_time')}
                    placeholder="e.g. 10:00 - 11:00"
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-th/40 mb-1.5">Shoot Duration (hours)</label>
                <select
                  value={form.shoot_duration}
                  onChange={field('shoot_duration')}
                  className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                >
                  <option value="">— Select —</option>
                  {[1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8].map(h => (
                    <option key={h} value={String(h)}>{h === 1 ? '1 hour' : `${h} hours`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-th/40 mb-1.5">Room / Setup</label>
                <input
                  value={form.setup}
                  onChange={field('setup')}
                  placeholder="e.g. Nova, Nest, River"
                  className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                />
              </div>
              <div>
                <label className="block text-xs text-th/40 mb-1.5">No. of Seats</label>
                <input
                  type="number"
                  value={form.seats}
                  onChange={field('seats')}
                  placeholder="e.g. 4"
                  className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                />
              </div>

              <div>
                <label className="block text-xs text-th/40 mb-1.5">Drive Link</label>
                <input
                  value={form.drive_link}
                  onChange={field('drive_link')}
                  placeholder="https://drive.google.com/…"
                  className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-th/40 mb-1.5">Producer</label>
                  <select
                    value={form.assigned_editor}
                    onChange={field('assigned_editor')}
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
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
                  <label className="block text-xs text-th/40 mb-1.5">Editor</label>
                  <select
                    value={form.editor}
                    onChange={field('editor')}
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
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
                <label className="block text-xs text-th/40 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={field('notes')}
                  rows={3}
                  className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25 resize-none"
                />
              </div>

              {isAdmin && (
                <div className="border-t border-th/[0.06] pt-4">
                  <label className="block text-xs text-th/40 mb-1.5">
                    Due Date Override
                    <span className="ml-2 text-amber-400/60 font-normal">Admin only</span>
                  </label>
                  <input
                    type="date"
                    value={form.due_date_override}
                    onChange={field('due_date_override')}
                    className="w-full bg-th/[0.05] border border-th/10 rounded-lg px-3 py-2 text-sm text-th/80 focus:outline-none focus:border-th/25"
                  />
                  {currentVerDueDate && form.due_date_override !== currentVerDueDate && (
                    <p className="text-[11px] text-th/35 mt-1.5">
                      Was: {currentVerDueDate}
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, due_date_override: currentVerDueDate }))}
                        className="ml-2 text-th/50 hover:text-th/80 underline transition-colors"
                      >
                        Reset
                      </button>
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-th/[0.07] flex items-center justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-xs text-th/40 hover:text-th/70 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-brand-red hover:bg-brand-red/90 disabled:opacity-40 text-th text-xs font-semibold rounded-lg transition-colors"
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
