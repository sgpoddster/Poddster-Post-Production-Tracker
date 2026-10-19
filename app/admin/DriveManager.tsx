'use client'

import { useState, useMemo } from 'react'

type DriveFolder = {
  id: string
  drive_type: 'client_raw' | 'post_production'
  folder_id: string
  folder_name: string
  client_code: string | null
  size_bytes: number
  file_count: number
  created_at_drive: string | null
  last_scanned_at: string
}

type DriveShoot = {
  id: string
  drive_type: 'client_raw' | 'post_production'
  folder_id: string
  folder_name: string
  client_folder_id: string
  client_name: string
  client_code: string | null
  year: string | null
  size_bytes: number
  file_count: number
  created_at_drive: string | null
  last_scanned_at: string
}

const DRIVE_LABELS: Record<string, string> = {
  client_raw:      'Poddster Client Raw Files',
  post_production: 'Poddster PP Files',
}

const CLIENT_LIST_DEFAULT = 10

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function TrashModal({
  name,
  onClose,
  onConfirm,
}: {
  name: string
  onClose: () => void
  onConfirm: (password: string) => Promise<string | null>
}) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [pending, setPending]   = useState(false)

  async function submit() {
    setPending(true)
    setError('')
    const err = await onConfirm(password)
    if (err) { setError(err); setPending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-brand-surface border border-th/[0.1] rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-th">Move to Trash</h2>
        <p className="text-sm text-th/60">
          This will move <span className="text-th font-medium">{name}</span> to Google Drive trash.
          It can be restored within 30 days.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs text-th/40 font-medium">Admin password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="w-full rounded-lg border border-th/[0.12] bg-th/[0.04] px-3 py-2 text-sm text-th outline-none focus:border-brand-red/50"
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-th/50 hover:text-th transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!password || pending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Moving…' : 'Move to Trash'}
          </button>
        </div>
      </div>
    </div>
  )
}

function useTrash() {
  const [modal, setModal]     = useState<{ folderId: string; name: string } | null>(null)
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  async function doTrash(folderId: string, password: string): Promise<string | null> {
    const res = await fetch('/api/admin/drive/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId, admin_password: password }),
    })
    if (res.ok) {
      setRemoved(prev => new Set([...prev, folderId]))
      setModal(null)
      return null
    }
    const j = await res.json().catch(() => ({}))
    return j.error ?? 'Failed'
  }

  return { modal, setModal, removed, doTrash }
}

// ── Client folders section ───────────────────────────────────────────────────

function ClientSection({
  driveType,
  folders,
  ageDays,
}: {
  driveType: string
  folders: DriveFolder[]
  ageDays: number | null
}) {
  const [showAll, setShowAll]   = useState(false)
  const { modal, setModal, removed, doTrash } = useTrash()

  const filtered = useMemo(() => {
    let list = folders.filter(f => !removed.has(f.folder_id))
    if (ageDays !== null) {
      list = list.filter(f => {
        const age = daysSince(f.created_at_drive)
        return age !== null && age >= ageDays
      })
    }
    return list // already sorted by size desc from DB
  }, [folders, removed, ageDays])

  const topTen   = filtered.slice(0, 10)
  const visible  = showAll ? filtered : filtered.slice(0, CLIENT_LIST_DEFAULT)
  const lastScanned = folders[0]?.last_scanned_at
  const totalBytes  = filtered.reduce((s, f) => s + f.size_bytes, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-th">{DRIVE_LABELS[driveType] ?? driveType}</h3>
          {lastScanned && (
            <p className="text-xs text-th/30 mt-0.5">
              Last scanned {new Date(lastScanned).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>
        <div className="text-xs text-th/40">
          <span className="text-th font-medium">{filtered.length}</span> folders ·{' '}
          <span className="text-th font-medium">{fmtBytes(totalBytes)}</span> total
        </div>
      </div>

      {/* Top 10 strip */}
      {topTen.length > 0 && (
        <div className="rounded-lg border border-th/[0.06] bg-th/[0.02] px-4 py-3 space-y-2">
          <p className="text-[10px] font-medium text-th/30 uppercase tracking-wider">Top 10 by storage</p>
          <div className="space-y-1.5">
            {topTen.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <span className="text-[10px] text-th/25 w-4 shrink-0 text-right">{i + 1}</span>
                <span className="text-xs text-th/70 truncate flex-1">{f.folder_name}</span>
                <span className="text-xs text-th/40 shrink-0">{fmtBytes(f.size_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-th/25 py-4 text-center">
          {ageDays !== null ? `No folders older than ${ageDays} days.` : 'No scan data yet.'}
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] divide-y divide-th/[0.05]">
              <div className="contents text-[10px] font-medium text-th/30 uppercase tracking-wider">
                <div className="px-4 py-2.5">Folder</div>
                <div className="px-4 py-2.5 text-right">Storage</div>
                <div className="px-4 py-2.5 text-right">Files</div>
                <div className="px-4 py-2.5 text-right">Age</div>
                <div className="px-4 py-2.5" />
              </div>
              {visible.map(f => {
                const age = daysSince(f.created_at_drive)
                return (
                  <div key={f.id} className="contents group">
                    <div className="px-4 py-3 min-w-0">
                      <span className="text-sm text-th truncate block">{f.folder_name}</span>
                    </div>
                    <div className="px-4 py-3 text-right text-sm text-th/60 whitespace-nowrap">{fmtBytes(f.size_bytes)}</div>
                    <div className="px-4 py-3 text-right text-sm text-th/40 whitespace-nowrap">{f.file_count.toLocaleString()}</div>
                    <div className="px-4 py-3 text-right text-sm text-th/40 whitespace-nowrap">{age !== null ? `${age}d` : '—'}</div>
                    <div className="px-4 py-3 flex items-center justify-end">
                      <button
                        onClick={() => setModal({ folderId: f.folder_id, name: f.folder_name })}
                        className="text-xs text-th/25 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/10"
                      >
                        Trash
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {filtered.length > CLIENT_LIST_DEFAULT && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="text-xs text-th/40 hover:text-th transition-colors"
            >
              {showAll
                ? `Show less`
                : `Show all ${filtered.length} folders`}
            </button>
          )}
        </>
      )}

      {modal && (
        <TrashModal
          name={modal.name}
          onClose={() => setModal(null)}
          onConfirm={pw => doTrash(modal.folderId, pw)}
        />
      )}
    </div>
  )
}

// ── Shoot folders section ────────────────────────────────────────────────────

function ShootSection({
  driveType,
  shoots,
  ageDays,
}: {
  driveType: string
  shoots: DriveShoot[]
  ageDays: number | null
}) {
  const { modal, setModal, removed, doTrash } = useTrash()

  const filtered = useMemo(() => {
    let list = shoots.filter(s => !removed.has(s.folder_id))
    if (ageDays !== null) {
      list = list.filter(s => {
        const age = daysSince(s.created_at_drive)
        return age !== null && age >= ageDays
      })
    }
    // Oldest first (created_at_drive asc already from DB, but re-sort after filter)
    return list.sort((a, b) => {
      if (!a.created_at_drive) return 1
      if (!b.created_at_drive) return -1
      return a.created_at_drive.localeCompare(b.created_at_drive)
    })
  }, [shoots, removed, ageDays])

  if (filtered.length === 0 && ageDays !== null) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-th">
            {DRIVE_LABELS[driveType] ?? driveType} — Shoot Folders
          </h3>
          <p className="text-xs text-th/30 mt-0.5">Individual sessions, oldest first</p>
        </div>
        <div className="text-xs text-th/40">
          <span className="text-th font-medium">{filtered.length}</span> sessions
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-th/25 py-4 text-center">No shoot folders found — run a scan first.</p>
      ) : (
        <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] divide-y divide-th/[0.05]">
            <div className="contents text-[10px] font-medium text-th/30 uppercase tracking-wider">
              <div className="px-4 py-2.5">Session</div>
              <div className="px-4 py-2.5">Client</div>
              <div className="px-4 py-2.5 text-right">Year</div>
              <div className="px-4 py-2.5 text-right">Storage</div>
              <div className="px-4 py-2.5 text-right">Age</div>
              <div className="px-4 py-2.5" />
            </div>
            {filtered.map(s => {
              const age = daysSince(s.created_at_drive)
              const ageColor = age !== null && age > 90
                ? 'text-red-400'
                : age !== null && age > 60
                  ? 'text-amber-400'
                  : 'text-th/40'
              return (
                <div key={s.id} className="contents group">
                  <div className="px-4 py-3 min-w-0">
                    <span className="text-sm text-th truncate block">{s.folder_name}</span>
                  </div>
                  <div className="px-4 py-3 min-w-0">
                    <span className="text-xs text-th/60 truncate block">{s.client_name}</span>
                  </div>
                  <div className="px-4 py-3 text-right text-xs text-th/40 whitespace-nowrap">{s.year ?? '—'}</div>
                  <div className="px-4 py-3 text-right text-sm text-th/60 whitespace-nowrap">{fmtBytes(s.size_bytes)}</div>
                  <div className={`px-4 py-3 text-right text-sm whitespace-nowrap font-medium ${ageColor}`}>
                    {age !== null ? `${age}d` : '—'}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-end">
                    <button
                      onClick={() => setModal({ folderId: s.folder_id, name: s.folder_name })}
                      className="text-xs text-th/25 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/10"
                    >
                      Trash
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modal && (
        <TrashModal
          name={modal.name}
          onClose={() => setModal(null)}
          onConfirm={pw => doTrash(modal.folderId, pw)}
        />
      )}
    </div>
  )
}

// ── Root component ───────────────────────────────────────────────────────────

export default function DriveManager({
  folders,
  shoots,
}: {
  folders: DriveFolder[]
  shoots: DriveShoot[]
}) {
  const [ageDays, setAgeDays]   = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg]   = useState('')

  async function triggerScan() {
    setScanning(true)
    setScanMsg('')
    const res = await fetch('/api/admin/drive/scan', { method: 'POST' })
    if (res.ok) {
      setScanMsg('Scan complete — reloading…')
      window.location.reload()
    } else {
      const j = await res.json().catch(() => ({}))
      setScanMsg(j.error ?? 'Scan failed')
      setScanning(false)
    }
  }

  const foldersByDrive = useMemo(() => {
    const map: Record<string, DriveFolder[]> = {}
    for (const f of folders) {
      if (!map[f.drive_type]) map[f.drive_type] = []
      map[f.drive_type].push(f)
    }
    return map
  }, [folders])

  const shootsByDrive = useMemo(() => {
    const map: Record<string, DriveShoot[]> = {}
    for (const s of shoots) {
      if (!map[s.drive_type]) map[s.drive_type] = []
      map[s.drive_type].push(s)
    }
    return map
  }, [shoots])

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-th/40">Show folders older than</label>
          <select
            value={ageDays ?? ''}
            onChange={e => setAgeDays(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-th/[0.1] bg-th/[0.04] px-3 py-1.5 text-sm text-th outline-none"
          >
            <option value="">All ages</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="120">120 days</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {scanMsg && <span className="text-xs text-th/40">{scanMsg}</span>}
          <button
            onClick={triggerScan}
            disabled={scanning}
            className="px-3 py-1.5 text-sm rounded-lg border border-th/[0.1] text-th/50 hover:text-th hover:border-th/20 disabled:opacity-40 transition-colors"
          >
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      </div>

      {folders.length === 0 && shoots.length === 0 ? (
        <div className="rounded-lg border border-th/[0.06] bg-brand-surface px-5 py-12 text-center">
          <p className="text-sm text-th/40">No scan data yet.</p>
          <p className="text-xs text-th/25 mt-1">Click &quot;Scan now&quot; to populate.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {(['client_raw', 'post_production'] as const).map(dt => (
            <div key={dt} className="space-y-8">
              {foldersByDrive[dt] && (
                <ClientSection driveType={dt} folders={foldersByDrive[dt]} ageDays={ageDays} />
              )}
              {shootsByDrive[dt] && (
                <ShootSection driveType={dt} shoots={shootsByDrive[dt]} ageDays={ageDays} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
