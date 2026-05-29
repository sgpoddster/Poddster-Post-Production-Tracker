'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CalendarPicker from './CalendarPicker'
import { CalendarPrefill } from '@/lib/calendarParser'

interface Client {
  id: string
  name: string
  code: string | null
}

interface Props {
  onClose: () => void
  clients: Client[]
  editors: { email: string; display_name: string | null }[]
  currentUserEmail: string
}

export default function NewProjectModal({ onClose, clients, editors, currentUserEmail }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCalPicker, setShowCalPicker] = useState(false)

  const [form, setForm] = useState({
    client_id: '',
    filming_date: '',
    filming_hour: '',
    filming_mins: '00',
    shoot_duration: '',
    setup: '',
    seats: '' as string,
    order_id: '',
    drive_link: '',
    assigned_editor: '',
    notes: '',
    episode_count: 1,
    highlight_count: 0,
  })

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function applyCalendarEvent(data: CalendarPrefill) {
    // Client name/code is always entered manually — the booking only has
    // the booker's personal name/email, not the company account name.
    setForm(f => ({
      ...f,
      ...(data.filmingDate             && { filming_date:    data.filmingDate }),
      ...(data.filmingHour             && { filming_hour:    data.filmingHour }),
      ...(data.filmingMins             && { filming_mins:    data.filmingMins }),
      ...(data.duration                && { shoot_duration:  data.duration }),
      ...(data.setup                   && { setup:           data.setup }),
      ...(data.seats != null           && { seats:           String(data.seats) }),
      ...(data.orderId                 && { order_id:        data.orderId }),
      ...(data.episodeCount   > 0      && { episode_count:   data.episodeCount }),
      ...(data.highlightCount > 0      && { highlight_count: data.highlightCount }),
      ...(data.notes                   && { notes:           data.notes }),
    }))
    setShowCalPicker(false)
  }

  const selectedClient = clients.find(c => c.id === form.client_id)
  const totalRows = form.episode_count + form.highlight_count

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id) { setError('Please select a client'); return }
    setLoading(true)
    setError(null)

    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name:       selectedClient?.name,
        client_code:       selectedClient?.code,
        order_id:          form.order_id || null,
        filming_date:      form.filming_date || null,
        filming_time:      form.filming_hour ? `${form.filming_hour}:${form.filming_mins}` : null,
        shoot_duration:    form.shoot_duration || null,
        setup:             form.setup || null,
        seats:             form.seats ? parseInt(form.seats, 10) : null,
        drive_link:        form.drive_link || null,
        assigned_editor:   form.assigned_editor || null,
        notes:             form.notes || null,
        episode_count:     form.episode_count,
        highlight_count:   form.highlight_count,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-brand-surface border border-white/10 rounded-xl w-full max-w-lg shadow-2xl">

        {/* Calendar picker overlay (sits inside the card) */}
        {showCalPicker && (
          <CalendarPicker
            onSelect={applyCalendarEvent}
            onClose={() => setShowCalPicker(false)}
          />
        )}

        <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">New Project</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCalPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              📅 Import from Calendar
            </button>
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none">✕</button>
          </div>
        </div>

        <form onSubmit={submit} className="px-6 py-6 space-y-5">

          {/* Client dropdown */}
          <div>
            <Label>Client *</Label>
            <select
              value={form.client_id}
              onChange={e => set('client_id', e.target.value)}
              className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-brand-red/50"
            >
              <option value="">— Select client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.code ? ` (${c.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filming */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label>Filming Date</Label>
              <Input type="date" value={form.filming_date} onChange={v => set('filming_date', v)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Start Time</Label>
              <div className="flex gap-2">
                <select
                  value={form.filming_hour}
                  onChange={e => set('filming_hour', e.target.value)}
                  className="flex-1 bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-brand-red/50"
                >
                  <option value="">Hour</option>
                  {Array.from({ length: 15 }, (_, i) => i + 7).map(h => (
                    <option key={h} value={String(h).padStart(2, '0')}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <select
                  value={form.filming_mins}
                  onChange={e => set('filming_mins', e.target.value)}
                  className="w-20 bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-brand-red/50"
                >
                  <option value="00">:00</option>
                  <option value="30">:30</option>
                </select>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Room / Setup</Label>
              <Input value={form.setup} onChange={v => set('setup', v)} placeholder="e.g. Nova, Nest, River" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>No. of Seats</Label>
              <Input type="number" value={form.seats} onChange={v => set('seats', v)} placeholder="e.g. 4" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Shoot Duration</Label>
              <select
                value={form.shoot_duration}
                onChange={e => set('shoot_duration', e.target.value)}
                className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-brand-red/50"
              >
                <option value="">— Select —</option>
                {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12].map(h => (
                  <option key={h} value={String(h)}>
                    {h === 1 ? '1 hour' : `${h} hours`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Drive link */}
          <div>
            <Label>Drive Link</Label>
            <Input value={form.drive_link} onChange={v => set('drive_link', v)} placeholder="https://drive.google.com/…" />
          </div>

          {/* Episodes & Highlights */}
          <div>
            <Label>Deliverables</Label>
            <div className="grid grid-cols-2 gap-4 mt-1">
              <div>
                <p className="text-xs text-white/40 mb-2">Episodes</p>
                <Counter value={form.episode_count} min={0} onChange={v => set('episode_count', v)} />
              </div>
              <div>
                <p className="text-xs text-white/40 mb-2">Highlights</p>
                <Counter value={form.highlight_count} min={0} onChange={v => set('highlight_count', v)} />
              </div>
            </div>
            {totalRows > 0 && (
              <p className="text-xs text-white/30 mt-2.5">
                → {totalRows} row{totalRows !== 1 ? 's' : ''} will be created
                {selectedClient && ` for ${selectedClient.name}`}
              </p>
            )}
          </div>

          {/* Producer */}
          <div>
            <Label>Assign Producer</Label>
            <select
              value={form.assigned_editor}
              onChange={e => set('assigned_editor', e.target.value)}
              className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-brand-red/50"
            >
              <option value="">— Unassigned —</option>
              {editors.map(ed => (
                <option key={ed.email} value={ed.email}>
                  {ed.display_name || ed.email}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Any notes for the producer…"
              className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-brand-red/50 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-brand-red bg-brand-red/10 border border-brand-red/20 rounded px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-white/40 hover:text-white/70 transition-colors"
            >Cancel</button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 bg-brand-red hover:bg-brand-red-dim disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              {loading ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-white/40 mb-1.5">{children}</label>
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-brand-surface2 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-brand-red/50"
    />
  )
}

function Counter({ value, min = 0, onChange }: {
  value: number; min?: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded bg-brand-surface2 text-white/60 hover:text-white transition-colors flex items-center justify-center text-lg leading-none"
      >−</button>
      <span className="w-8 text-center text-sm font-medium text-white">{value}</span>
      <button type="button"
        onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded bg-brand-surface2 text-white/60 hover:text-white transition-colors flex items-center justify-center text-lg leading-none"
      >+</button>
    </div>
  )
}
