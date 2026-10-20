'use client'

import { useState, useMemo, useRef, useEffect } from 'react'

interface Project {
  project_id:         string
  project_name:       string
  storage_bytes:      number
  updated_at_frameio: string | null
  created_at_frameio: string | null
  last_scanned_at:    string
}

interface Session {
  folder_id:          string
  project_id:         string
  folder_name:        string
  created_at_frameio: string | null
}

interface Props {
  projects: Project[]
  sessions: Session[]
}

function fmtBytes(b: number) {
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'
  if (b >= 1e9)  return (b / 1e9).toFixed(2) + ' GB'
  if (b >= 1e6)  return (b / 1e6).toFixed(1) + ' MB'
  return b + ' B'
}

function ageDays(iso: string | null) {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d < 1)  return 'Today'
  if (d === 1) return '1 day'
  if (d < 30)  return `${d}d`
  if (d < 365) return `${Math.floor(d / 30)}mo`
  return `${(d / 365).toFixed(1)}y`
}

type SortCol = 'name' | 'storage' | 'age'

function SortHeader({
  col, label, current, asc, onToggle,
}: {
  col: SortCol; label: string; current: SortCol; asc: boolean; onToggle: (c: SortCol) => void
}) {
  const active = col === current
  return (
    <button
      onClick={() => onToggle(col)}
      className={`flex items-center gap-0.5 text-xs font-medium transition-colors ${active ? 'text-th' : 'text-th/35 hover:text-th/60'}`}
    >
      {label}
      <span className="text-[10px] ml-0.5">
        {active ? (asc ? '▲' : '▼') : '⇅'}
      </span>
    </button>
  )
}

export default function FrameioManager({ projects: initialProjects, sessions: initialSessions }: Props) {
  const [projects, setProjects]     = useState<Project[]>(initialProjects)
  const [sessions, setSessions]     = useState<Session[]>(initialSessions)
  const [scanning, setScanning]     = useState(false)
  const [scanError, setScanError]   = useState('')
  const [scanNote, setScanNote]     = useState('')

  const [inputValue, setInputValue] = useState('')
  const [selected, setSelected]     = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [sortCol, setSortCol]       = useState<SortCol>('storage')
  const [sortAsc, setSortAsc]       = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  // Keep local state in sync if server data changes (e.g. after scan)
  useEffect(() => { setProjects(initialProjects) }, [initialProjects])
  useEffect(() => { setSessions(initialSessions) }, [initialSessions])

  const suggestions = useMemo(() => {
    if (!inputValue || selected) return []
    const q = inputValue.toLowerCase()
    return projects
      .filter(p => p.project_name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [inputValue, selected, projects])

  function selectClient(name: string) {
    setSelected(name)
    setInputValue(name)
    setDropdownOpen(false)
  }

  function clearSelection() {
    setSelected(null)
    setInputValue('')
    setDropdownOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function toggleSort(col: SortCol) {
    if (col === sortCol) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortedProjects = useMemo(() => {
    const list = selected
      ? projects.filter(p => p.project_name === selected)
      : [...projects]
    list.sort((a, b) => {
      let diff = 0
      if (sortCol === 'storage') diff = a.storage_bytes - b.storage_bytes
      else if (sortCol === 'name') diff = a.project_name.localeCompare(b.project_name)
      else if (sortCol === 'age') {
        const ta = a.updated_at_frameio ? new Date(a.updated_at_frameio).getTime() : 0
        const tb = b.updated_at_frameio ? new Date(b.updated_at_frameio).getTime() : 0
        diff = ta - tb
      }
      return sortAsc ? diff : -diff
    })
    return list
  }, [projects, selected, sortCol, sortAsc])

  const sessionsByProject = useMemo(() => {
    const map: Record<string, Session[]> = {}
    for (const s of sessions) {
      if (!map[s.project_id]) map[s.project_id] = []
      map[s.project_id].push(s)
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => {
        const ta = a.created_at_frameio ? new Date(a.created_at_frameio).getTime() : 0
        const tb = b.created_at_frameio ? new Date(b.created_at_frameio).getTime() : 0
        return tb - ta
      })
    }
    return map
  }, [sessions])

  const top10 = useMemo(
    () => [...projects].sort((a, b) => b.storage_bytes - a.storage_bytes).slice(0, 10),
    [projects]
  )
  const totalBytes = useMemo(() => projects.reduce((s, p) => s + p.storage_bytes, 0), [projects])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allExpanded) {
      setExpandedIds(new Set())
      setAllExpanded(false)
    } else {
      setExpandedIds(new Set(sortedProjects.map(p => p.project_id)))
      setAllExpanded(true)
    }
  }

  async function runScan() {
    setScanning(true)
    setScanError('')
    setScanNote('')
    try {
      const res = await fetch('/api/admin/frameio/scan', { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setScanError(`HTTP ${res.status}${j.error ? ': ' + j.error : ''}`)
      } else {
        const j = await res.json()
        setScanNote(`Scanned ${j.projects} projects, ${j.sessions} sessions`)
        // Reload page data via browser navigation so server component re-fetches
        window.location.reload()
      }
    } catch (e) {
      setScanError('Network error — could not reach server')
    } finally {
      setScanning(false)
    }
  }

  const lastScan = projects[0]?.last_scanned_at ?? null

  return (
    <div className="space-y-6">

      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-th">Frame.io Storage</h2>
          {lastScan && (
            <p className="text-xs text-th/35 mt-0.5">
              Last scan: {new Date(lastScan).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="text-xs px-3 py-1.5 rounded-md bg-brand-accent text-white font-medium disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      {scanError && <p className="text-xs text-red-500">{scanError}</p>}
      {scanNote  && <p className="text-xs text-green-600">{scanNote}</p>}

      {projects.length === 0 ? (
        <p className="text-sm text-th/35">No data — run a scan first.</p>
      ) : (
        <>
          {/* Summary + Top 10 */}
          <div className="rounded-lg border border-th/[0.06] bg-brand-surface divide-y divide-th/[0.06]">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-xs text-th/40">Total storage</span>
              <span className="text-sm font-semibold text-th">{fmtBytes(totalBytes)}</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-th/40 mb-2">Top 10 by storage</p>
              <div className="space-y-1.5">
                {top10.map(p => {
                  const pct = totalBytes > 0 ? (p.storage_bytes / totalBytes) * 100 : 0
                  return (
                    <div key={p.project_id} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-th/70 truncate mr-2">{p.project_name}</span>
                        <span className="text-th/50 shrink-0">{fmtBytes(p.storage_bytes)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-th/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-accent/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-th/[0.08] bg-brand-surface">
              <svg className="w-3.5 h-3.5 text-th/30 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-th outline-none placeholder:text-th/30"
                placeholder="Search projects…"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); if (!selected) setDropdownOpen(true) }}
                onFocus={() => { if (!selected && inputValue) setDropdownOpen(true) }}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                readOnly={!!selected}
              />
              {selected && (
                <button onClick={clearSelection} className="text-th/40 hover:text-th ml-1 text-xs">✕</button>
              )}
            </div>
            {dropdownOpen && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-th/[0.08] bg-brand-surface shadow-lg overflow-hidden">
                {suggestions.map(p => (
                  <li
                    key={p.project_id}
                    onMouseDown={() => selectClient(p.project_name)}
                    className="flex items-center justify-between px-3 py-2 text-sm text-th hover:bg-th/[0.04] cursor-pointer"
                  >
                    <span>{p.project_name}</span>
                    <span className="text-xs text-th/35 ml-4">{fmtBytes(p.storage_bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Projects table */}
          <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-th/[0.06]">
              <div className="flex items-center gap-4">
                <SortHeader col="name"    label="Project"  current={sortCol} asc={sortAsc} onToggle={toggleSort} />
                <SortHeader col="storage" label="Storage"  current={sortCol} asc={sortAsc} onToggle={toggleSort} />
                <SortHeader col="age"     label="Updated"  current={sortCol} asc={sortAsc} onToggle={toggleSort} />
              </div>
              {!selected && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-th/40 hover:text-th/70 transition-colors"
                >
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              )}
            </div>

            <div className="divide-y divide-th/[0.04]">
              {sortedProjects.map(p => {
                const isOpen = selected === p.project_name || expandedIds.has(p.project_id)
                const folderSessions = sessionsByProject[p.project_id] ?? []
                return (
                  <div key={p.project_id}>
                    {/* Project row */}
                    <button
                      onClick={() => toggleExpand(p.project_id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-th/[0.02] transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-th/30 text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        <span className="text-sm font-medium text-th truncate">{p.project_name}</span>
                        {folderSessions.length > 0 && (
                          <span className="text-xs text-th/30">{folderSessions.length}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <span className="text-xs text-th/50">{ageDays(p.updated_at_frameio)}</span>
                        <span className="text-xs font-medium text-th/70">{fmtBytes(p.storage_bytes)}</span>
                      </div>
                    </button>

                    {/* Session rows */}
                    {isOpen && folderSessions.length > 0 && (
                      <div className="bg-th/[0.015] border-t border-th/[0.04]">
                        {folderSessions.map(s => (
                          <div
                            key={s.folder_id}
                            className="flex items-center justify-between pl-10 pr-4 py-2 border-b border-th/[0.03] last:border-0"
                          >
                            <span className="text-xs text-th/70 truncate">{s.folder_name}</span>
                            <span className="text-xs text-th/35 shrink-0 ml-4">
                              {ageDays(s.created_at_frameio)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {isOpen && folderSessions.length === 0 && (
                      <div className="pl-10 pr-4 py-2 bg-th/[0.015] border-t border-th/[0.04]">
                        <span className="text-xs text-th/30">No session folders</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
