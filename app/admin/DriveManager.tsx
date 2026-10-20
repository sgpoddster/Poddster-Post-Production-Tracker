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
  paid_storage: boolean
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

const SHOOTS_DEFAULT = 10

function SortHeader({
  col, label, align, sortCol, sortDir, onSort,
}: {
  col: 'client' | 'storage' | 'age'
  label: string
  align: 'left' | 'right'
  sortCol: 'client' | 'storage' | 'age'
  sortDir: 'asc' | 'desc'
  onSort: (col: 'client' | 'storage' | 'age') => void
}) {
  const active = sortCol === col
  return (
    <button
      onClick={() => onSort(col)}
      className={`px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider flex items-center gap-1 transition-colors ${
        align === 'right' ? 'justify-end' : ''
      } ${active ? 'text-th/70' : 'text-th/30 hover:text-th/50'}`}
    >
      {label}
      <span className="text-[9px] opacity-70">
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </button>
  )
}

function PaidBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-400/15 text-amber-500 shrink-0 whitespace-nowrap">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0">
        <circle cx="4" cy="4" r="3.5" stroke="currentColor" strokeWidth="1"/>
        <path d="M4 2v.5M4 5.5V6M3 3.5c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1 .45-1 1" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      </svg>
      Paid
    </span>
  )
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

// ── Unified drive section (top-10 + search + shoots) ────────────────────────

function DriveSection({
  driveType,
  folders,
  shoots,
  ageDays,
}: {
  driveType: string
  folders: DriveFolder[]
  shoots: DriveShoot[]
  ageDays: number | null
}) {
  const [inputValue, setInputValue]       = useState('')
  const [selected, setSelected]           = useState<DriveFolder | null>(null)
  const [dropdownOpen, setDropdownOpen]   = useState(false)
  const [sortCol, setSortCol]             = useState<'client' | 'storage' | 'age'>('client')
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc')
  const [expandedIds, setExpandedIds]     = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded]     = useState(false)
  const { modal, setModal, removed, doTrash } = useTrash()

  function toggleSort(col: 'client' | 'storage' | 'age') {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'storage' ? 'desc' : 'asc')
    }
  }

  function toggleExpand(clientFolderId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(clientFolderId)) next.delete(clientFolderId)
      else next.add(clientFolderId)
      return next
    })
  }

  const allFolders = useMemo(
    () => folders.filter(f => !removed.has(f.folder_id)),
    [folders, removed]
  )

  const topTen      = allFolders.slice(0, 10)
  const lastScanned = folders[0]?.last_scanned_at
  const totalBytes  = allFolders.reduce((s, f) => s + f.size_bytes, 0)

  const suggestions = useMemo(() => {
    const q = inputValue.trim().toLowerCase()
    if (!q || selected) return []
    return allFolders.filter(f => f.folder_name.toLowerCase().includes(q)).slice(0, 8)
  }, [allFolders, inputValue, selected])

  function selectClient(f: DriveFolder) {
    setSelected(f)
    setInputValue(f.folder_name)
    setDropdownOpen(false)
  }

  function clearSelection() {
    setSelected(null)
    setInputValue('')
  }

  // Grouped shoots — filtered, then grouped by client, sorted at group level
  const clientGroups = useMemo(() => {
    let list = shoots.filter(s => !removed.has(s.folder_id))
    if (ageDays !== null) {
      list = list.filter(s => {
        const age = daysSince(s.created_at_drive)
        return age !== null && age >= ageDays
      })
    }
    if (selected) list = list.filter(s => s.client_folder_id === selected.folder_id)

    // Group by client_folder_id
    const map = new Map<string, { clientName: string; sessions: DriveShoot[]; totalBytes: number; oldestDate: string | null }>()
    for (const s of list) {
      if (!map.has(s.client_folder_id)) {
        map.set(s.client_folder_id, { clientName: s.client_name, sessions: [], totalBytes: 0, oldestDate: null })
      }
      const g = map.get(s.client_folder_id)!
      g.sessions.push(s)
      g.totalBytes += s.size_bytes
      if (s.created_at_drive && (!g.oldestDate || s.created_at_drive < g.oldestDate)) {
        g.oldestDate = s.created_at_drive
      }
    }

    // Sort sessions within each group by age asc
    for (const g of map.values()) {
      g.sessions.sort((a, b) => (a.created_at_drive ?? '').localeCompare(b.created_at_drive ?? ''))
    }

    // Sort groups
    const groups = Array.from(map.entries()).map(([id, g]) => ({ id, ...g }))
    groups.sort((a, b) => {
      let cmp = 0
      if (sortCol === 'client') cmp = a.clientName.localeCompare(b.clientName)
      else if (sortCol === 'storage') cmp = a.totalBytes - b.totalBytes
      else cmp = (a.oldestDate ?? '').localeCompare(b.oldestDate ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return groups
  }, [shoots, removed, ageDays, selected, sortCol, sortDir])

  const totalSessions = clientGroups.reduce((n, g) => n + g.sessions.length, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
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
          <span className="text-th font-medium">{allFolders.length}</span> clients ·{' '}
          <span className="text-th font-medium">{fmtBytes(totalBytes)}</span> total
        </div>
      </div>

      {/* Top 10 strip */}
      {topTen.length > 0 && (
        <div className="rounded-lg border border-th/[0.06] bg-th/[0.02] px-4 py-3 space-y-2">
          <p className="text-[10px] font-medium text-th/30 uppercase tracking-wider">Top 10 by storage</p>
          <div className="space-y-1.5">
            {topTen.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2 cursor-pointer group/row" onClick={() => selectClient(f)}>
                <span className="text-[10px] text-th/25 w-4 shrink-0 text-right">{i + 1}</span>
                <span className="text-xs text-th/70 group-hover/row:text-th truncate flex-1 transition-colors">{f.folder_name}</span>
                {f.paid_storage && <PaidBadge />}
                <span className="text-xs text-th/40 shrink-0">{fmtBytes(f.size_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search / selected client */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setSelected(null); setDropdownOpen(true) }}
              onFocus={() => !selected && setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              placeholder="Search client…"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-th placeholder:text-th/25 outline-none transition-colors ${
                selected
                  ? 'border-brand-red/30 bg-brand-red/5'
                  : 'border-th/[0.1] bg-th/[0.04] focus:border-th/20'
              }`}
            />
            {dropdownOpen && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-th/[0.1] bg-brand-surface shadow-xl overflow-hidden">
                {suggestions.map(f => (
                  <button
                    key={f.id}
                    onMouseDown={() => selectClient(f)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-th/80 hover:bg-th/[0.06] hover:text-th transition-colors text-left gap-4"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="truncate">{f.folder_name}</span>
                      {f.paid_storage && <PaidBadge />}
                    </span>
                    <span className="text-xs text-th/35 shrink-0">{fmtBytes(f.size_bytes)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <button
              onClick={clearSelection}
              className="px-3 py-2 text-xs rounded-lg border border-th/[0.1] text-th/40 hover:text-th hover:border-th/20 transition-colors whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>

        {inputValue.trim() && !selected && suggestions.length === 0 && (
          <p className="text-sm text-th/25 text-center py-2 mt-1">No clients match &quot;{inputValue}&quot;</p>
        )}
      </div>

      {/* Selected client summary */}
      {selected && (
        <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] divide-y divide-th/[0.05]">
            <div className="contents text-[10px] font-medium text-th/30 uppercase tracking-wider">
              <div className="px-4 py-2.5">Client</div>
              <div className="px-4 py-2.5 text-right">Storage</div>
              <div className="px-4 py-2.5 text-right">Files</div>
              <div className="px-4 py-2.5" />
            </div>
            <div className="contents">
              <div className="px-4 py-3 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm text-th truncate">{selected.folder_name}</span>
                  {selected.paid_storage && <PaidBadge />}
                </span>
              </div>
              <div className="px-4 py-3 text-right text-sm text-th/60 whitespace-nowrap">{fmtBytes(selected.size_bytes)}</div>
              <div className="px-4 py-3 text-right text-sm text-th/40 whitespace-nowrap">{selected.file_count.toLocaleString()}</div>
              <div className="px-4 py-3 flex items-center justify-end">
                <button
                  onClick={() => setModal({ folderId: selected.folder_id, name: selected.folder_name })}
                  className="text-xs text-th/25 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/10"
                >
                  Trash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sessions — grouped by client */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-medium text-th/30 uppercase tracking-wider">
              {selected ? `Sessions — ${selected.folder_name}` : 'Sessions by client'}
            </p>
            {!selected && clientGroups.length > 0 && (
              <button
                onClick={() => {
                  if (allExpanded) { setExpandedIds(new Set()); setAllExpanded(false) }
                  else { setExpandedIds(new Set(clientGroups.map(g => g.id))); setAllExpanded(true) }
                }}
                className="text-[10px] text-th/40 hover:text-th transition-colors"
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
          <span className="text-xs text-th/30">{clientGroups.length} clients · {totalSessions} sessions</span>
        </div>

        {clientGroups.length === 0 ? (
          <p className="text-sm text-th/25 py-4 text-center">
            {shoots.length === 0 ? 'No shoot data yet — run a scan first.' : 'No sessions match.'}
          </p>
        ) : (
          <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] border-b border-th/[0.05]">
              <SortHeader col="client" label="Client" align="left" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <div className="px-4 py-2.5 text-[10px] font-medium text-th/30 uppercase tracking-wider text-right">Sessions</div>
              <SortHeader col="storage" label="Storage" align="right" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader col="age" label="Oldest" align="right" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <div className="px-4 py-2.5" />
            </div>

            {clientGroups.map(g => {
              const isOpen = selected ? true : (allExpanded || expandedIds.has(g.id))
              const oldestAge = daysSince(g.oldestDate)
              const ageColor = oldestAge !== null && oldestAge > 90 ? 'text-red-400'
                : oldestAge !== null && oldestAge > 60 ? 'text-amber-400' : 'text-th/40'
              return (
                <div key={g.id} className="border-b border-th/[0.05] last:border-0">
                  {/* Client row */}
                  <button
                    onClick={() => !selected && toggleExpand(g.id)}
                    className={`w-full grid grid-cols-[1fr_auto_auto_auto_auto] items-center text-left transition-colors ${
                      selected ? 'cursor-default' : 'hover:bg-th/[0.03]'
                    }`}
                  >
                    <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                      {!selected && (
                        <span className="text-th/25 text-[10px] shrink-0">{isOpen ? '▼' : '▶'}</span>
                      )}
                      <span className="text-sm font-medium text-th truncate">{g.clientName}</span>
                    </div>
                    <div className="px-4 py-3 text-right text-xs text-th/40 whitespace-nowrap">{g.sessions.length}</div>
                    <div className="px-4 py-3 text-right text-sm text-th/60 whitespace-nowrap">{fmtBytes(g.totalBytes)}</div>
                    <div className={`px-4 py-3 text-right text-sm whitespace-nowrap font-medium ${ageColor}`}>
                      {oldestAge !== null ? `${oldestAge}d` : '—'}
                    </div>
                    <div className="px-4 py-3" />
                  </button>

                  {/* Session rows */}
                  {isOpen && (
                    <div className="border-t border-th/[0.04] bg-th/[0.015]">
                      {g.sessions.map(s => {
                        const age = daysSince(s.created_at_drive)
                        const sc = age !== null && age > 90 ? 'text-red-400'
                          : age !== null && age > 60 ? 'text-amber-400' : 'text-th/40'
                        return (
                          <div key={s.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center border-b border-th/[0.04] last:border-0">
                            <div className="pl-10 pr-4 py-2.5 min-w-0">
                              <span className="text-sm text-th/80 truncate block">{s.folder_name}</span>
                              <span className="text-[10px] text-th/30">{s.year ?? '—'}</span>
                            </div>
                            <div className="px-4 py-2.5" />
                            <div className="px-4 py-2.5 text-right text-sm text-th/50 whitespace-nowrap">{fmtBytes(s.size_bytes)}</div>
                            <div className={`px-4 py-2.5 text-right text-sm whitespace-nowrap font-medium ${sc}`}>
                              {age !== null ? `${age}d` : '—'}
                            </div>
                            <div className="px-4 py-2.5 flex items-center justify-end">
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
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

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
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      const shootCount = Object.values(j.summary ?? {}).reduce((s: number, v: unknown) => s + ((v as { shoots?: number }).shoots ?? 0), 0)
      setScanMsg(`Scan complete (${shootCount} shoots found) — reloading…`)
      setTimeout(() => window.location.reload(), 1200)
    } else {
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
          <label className="text-xs text-th/40">Show sessions older than</label>
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
            <DriveSection
              key={dt}
              driveType={dt}
              folders={foldersByDrive[dt] ?? []}
              shoots={shootsByDrive[dt] ?? []}
              ageDays={ageDays}
            />
          ))}
        </div>
      )}
    </div>
  )
}
