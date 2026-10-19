'use client'

import { useState, useTransition, useMemo } from 'react'

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

const DRIVE_LABELS: Record<string, string> = {
  client_raw:      'Poddster Client Raw Files',
  post_production: 'Poddster PP Files',
}

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
  folder,
  onClose,
  onDone,
}: {
  folder: DriveFolder
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      setError('')
      const res = await fetch('/api/admin/drive/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folder.folder_id, admin_password: password }),
      })
      if (res.ok) {
        onDone(folder.id)
      } else {
        const j = await res.json()
        setError(j.error ?? 'Failed')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-brand-surface border border-th/[0.1] rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-th">Move to Trash</h2>
        <p className="text-sm text-th/60">
          This will move <span className="text-th font-medium">{folder.folder_name}</span> to Google Drive trash.
          It can be restored from Drive trash within 30 days.
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

function DriveSection({
  driveType,
  folders,
  ageDays,
}: {
  driveType: string
  folders: DriveFolder[]
  ageDays: number | null
}) {
  const [trashing, setTrashing] = useState<DriveFolder | null>(null)
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    let list = folders.filter(f => !removed.has(f.id))
    if (ageDays !== null) {
      list = list.filter(f => {
        const age = daysSince(f.created_at_drive)
        return age !== null && age >= ageDays
      })
    }
    return list.sort((a, b) => b.size_bytes - a.size_bytes)
  }, [folders, removed, ageDays])

  const topTen = useMemo(
    () => [...folders].filter(f => !removed.has(f.id)).sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 10),
    [folders, removed]
  )

  const totalBytes = visible.reduce((s, f) => s + f.size_bytes, 0)
  const lastScanned = folders[0]?.last_scanned_at

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
          <span className="text-th font-medium">{visible.length}</span> folders · <span className="text-th font-medium">{fmtBytes(totalBytes)}</span> total
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
      {visible.length === 0 ? (
        <p className="text-sm text-th/25 py-4 text-center">
          {ageDays !== null ? `No folders older than ${ageDays} days.` : 'No scan data yet — run a scan first.'}
        </p>
      ) : (
        <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 divide-y divide-th/[0.05]">
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
                  <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                    <span className="text-sm text-th truncate">{f.folder_name}</span>
                  </div>
                  <div className="px-4 py-3 text-right text-sm text-th/60 whitespace-nowrap">{fmtBytes(f.size_bytes)}</div>
                  <div className="px-4 py-3 text-right text-sm text-th/40 whitespace-nowrap">{f.file_count.toLocaleString()}</div>
                  <div className="px-4 py-3 text-right text-sm text-th/40 whitespace-nowrap">
                    {age !== null ? `${age}d` : '—'}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-end">
                    <button
                      onClick={() => setTrashing(f)}
                      className="text-xs text-th/25 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/10"
                      title="Move to trash"
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

      {trashing && (
        <TrashModal
          folder={trashing}
          onClose={() => setTrashing(null)}
          onDone={id => {
            setRemoved(prev => new Set([...prev, id]))
            setTrashing(null)
          }}
        />
      )}
    </div>
  )
}

export default function DriveManager({ folders }: { folders: DriveFolder[] }) {
  const [ageDays, setAgeDays] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const byDrive = useMemo(() => {
    const map: Record<string, DriveFolder[]> = {}
    for (const f of folders) {
      if (!map[f.drive_type]) map[f.drive_type] = []
      map[f.drive_type].push(f)
    }
    return map
  }, [folders])

  async function triggerScan() {
    setScanning(true)
    setScanMsg('')
    const res = await fetch('/api/admin/drive/scan', {
      method: 'POST',
      headers: { 'x-admin-secret': '' }, // server rejects empty — user must refresh after backend scan
    })
    if (res.ok) {
      setScanMsg('Scan complete — refresh page to see updated data.')
    } else {
      setScanMsg('Scan can only be triggered server-side. Refresh after the daily cron runs.')
    }
    setScanning(false)
  }

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

      {folders.length === 0 ? (
        <div className="rounded-lg border border-th/[0.06] bg-brand-surface px-5 py-12 text-center">
          <p className="text-sm text-th/40">No scan data yet.</p>
          <p className="text-xs text-th/25 mt-1">Run the daily cron or click &quot;Scan now&quot; to populate.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(['client_raw', 'post_production'] as const).map(dt =>
            byDrive[dt] ? (
              <DriveSection key={dt} driveType={dt} folders={byDrive[dt]} ageDays={ageDays} />
            ) : null
          )}
        </div>
      )}
    </div>
  )
}
