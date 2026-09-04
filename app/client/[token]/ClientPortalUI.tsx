'use client'

import { useState } from 'react'

// ── types ──────────────────────────────────────────────────────────────────

type StatusKey = 'queued' | 'prod' | 'returned' | 'approved'
type Filter = 'all' | StatusKey

interface Version {
  id: string
  version_number: number
  label: string | null
  due_date: string | null
  done_date: string | null
}

interface Project {
  id: string
  job_id: string | null
  type: string
  highlight_number: number | null
  status: string
  on_hold: boolean
  current_version: number | null
  filming_date: string | null
  filming_time: string | null
  versions: Version[]
}

interface Deliverable {
  id: string
  code: string
  name: string
  isEpisode: boolean
  number: number
  statusKey: StatusKey
  due: { text: string; color: string; strong: boolean } | null
  deliveredVersions: { label: string; deliveredOn: string }[]
}

interface Group {
  jobId: string
  filmingDate: string | null
  filmingTime: string | null
  deliverables: Deliverable[]
}

interface Props {
  firstName: string | null
  projects: Project[]
}

// ── helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function fmtTime(t: string): string {
  return t.slice(0, 5)
}

function mapStatus(status: string, onHold: boolean): StatusKey {
  if (onHold) return 'prod'
  switch (status) {
    case 'pending_trigger': return 'queued'
    case 'active':          return 'prod'
    case 'in_revision':     return 'prod'
    case 'in_client_review': return 'returned'
    case 'complete':        return 'approved'
    default:                return 'queued'
  }
}

function duePill(currentVersion: Version, today: Date): { text: string; color: string; strong: boolean } | null {
  if (!currentVersion.due_date || currentVersion.done_date) return null
  const due = new Date(currentVersion.due_date + 'T12:00:00')
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  const vl = currentVersion.label ?? `V${currentVersion.version_number}`

  if (days < 0) {
    const n = Math.abs(days)
    return { text: `${n} ${n === 1 ? 'day' : 'days'} late`, color: '#ff6b5e', strong: true }
  }
  if (days === 0) return { text: 'due today', color: '#f0a641', strong: true }
  if (days <= 7) return { text: `${vl} due in ${days} ${days === 1 ? 'day' : 'days'}`, color: '#f0a641', strong: true }
  return { text: `${vl} due ${fmtDate(currentVersion.due_date)}`, color: '#7c7c7c', strong: false }
}

function pillStyle(color: string, strong: boolean, minWidth?: string): React.CSSProperties {
  return {
    fontSize: '12.5px',
    letterSpacing: '0.01em',
    padding: '5px 11px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    color,
    background: strong ? `${color}1f` : 'transparent',
    border: `1px solid ${color}${strong ? '4d' : '33'}`,
    ...(minWidth ? { minWidth } : {}),
  }
}

const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  queued:   { label: 'To Be Queued',       color: '#8a8a8a' },
  prod:     { label: 'In Production',      color: '#5b9dff' },
  returned: { label: 'Returned to Client', color: '#3ddc97' },
  approved: { label: 'Approved',           color: '#a78bfa' },
}

// ── build groups from raw projects ────────────────────────────────────────

function buildGroups(projects: Project[]): Group[] {
  const today = new Date()
  const map = new Map<string, Group>()

  for (const p of projects) {
    const key = p.job_id ?? p.id
    if (!map.has(key)) {
      map.set(key, { jobId: p.job_id ?? p.id, filmingDate: p.filming_date, filmingTime: p.filming_time, deliverables: [] })
    }
    const group = map.get(key)!

    const isEpisode = p.type === 'episode'
    const number = isEpisode ? 1 : (p.highlight_number ?? 1)
    const code = `${p.job_id ?? p.id}${isEpisode ? 'E' : 'H'}${number}`
    const name = isEpisode ? 'Episode' : `Highlight #${number}`

    const versions = [...(p.versions ?? [])].sort((a, b) => a.version_number - b.version_number)
    const currentVer = versions.find(v => v.version_number === p.current_version && !v.done_date)
    const due = currentVer ? duePill(currentVer, today) : null

    const deliveredVersions = versions
      .filter(v => !!v.done_date)
      .map(v => ({
        label: v.label ?? `V${v.version_number}`,
        deliveredOn: fmtDate(v.done_date!),
      }))

    group.deliverables.push({
      id: p.id,
      code,
      name,
      isEpisode,
      number,
      statusKey: mapStatus(p.status, p.on_hold),
      due: due ?? null,
      deliveredVersions,
    })
  }

  // Sort deliverables within each group: episode first, then highlights ascending
  for (const g of map.values()) {
    g.deliverables.sort((a, b) => {
      if (a.isEpisode && !b.isEpisode) return -1
      if (!a.isEpisode && b.isEpisode) return 1
      return a.number - b.number
    })
  }

  return Array.from(map.values())
}

// ── component ──────────────────────────────────────────────────────────────

export default function ClientPortalUI({ firstName, projects }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const groups = buildGroups(projects)
  const allDeliverables = groups.flatMap(g => g.deliverables)

  const counts: Record<StatusKey, number> = { queued: 0, prod: 0, returned: 0, approved: 0 }
  for (const d of allDeliverables) counts[d.statusKey]++
  const total = allDeliverables.length

  const returnedCount = counts.returned
  const prodCount = counts.prod + counts.queued

  const summaryLine = returnedCount > 0
    ? `${returnedCount} ${returnedCount === 1 ? 'delivery is' : 'deliveries are'} waiting on your review · ${prodCount} in production`
    : `${prodCount} ${prodCount === 1 ? 'delivery' : 'deliveries'} in production`

  const filterDefs: { key: Filter; label: string; count: number }[] = [
    { key: 'all',      label: 'Everything',     count: total },
    { key: 'returned', label: 'Your review',     count: counts.returned },
    { key: 'prod',     label: 'In production',   count: counts.prod },
    { key: 'queued',   label: 'To be queued',    count: counts.queued },
  ]

  const greeting = firstName ? `Hey ${firstName}!` : 'Your projects'

  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f2f2f2', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", padding: '0 24px 96px', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Brand bar */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, paddingTop: 28 }}>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.18em' }}>PODDSTER</div>
          <div style={{ fontSize: 15, color: '#8a8a8a' }}>Post Production</div>
        </div>

        {/* Greeting + filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, padding: '56px 0 28px' }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>{greeting}</div>
            <div style={{ fontSize: 16, color: '#8a8a8a', marginTop: 8 }}>{summaryLine}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filterDefs.map(f => {
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13.5, padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
                    background: active ? '#242424' : 'transparent',
                    border: `1px solid ${active ? '#343434' : '#262626'}`,
                    color: active ? '#f2f2f2' : '#9a9a9a',
                    fontFamily: 'inherit',
                  }}
                >
                  <span>{f.label}</span>
                  <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: active ? '#9a9a9a' : '#6a6a6a' }}>{f.count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Project cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.length === 0 ? (
            <p style={{ fontSize: 13.5, color: '#6f6f6f' }}>No projects yet.</p>
          ) : groups.map(group => {
            const filtered = filter === 'all'
              ? group.deliverables
              : group.deliverables.filter(d => d.statusKey === filter)

            const done = group.deliverables.filter(d => d.statusKey === 'returned' || d.statusKey === 'approved').length
            const groupTotal = group.deliverables.length
            const pct = groupTotal > 0 ? Math.round(done / groupTotal * 100) : 0

            return (
              <div key={group.jobId} style={{ background: '#141414', border: '1px solid #232323', borderRadius: 14, overflow: 'hidden' }}>

                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, padding: '22px 24px 18px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>
                        {group.filmingDate ? fmtDate(group.filmingDate) : '—'}
                      </div>
                      {group.filmingTime && (
                        <div style={{ fontSize: 20, fontWeight: 400, color: '#9a9a9a', letterSpacing: '-0.01em' }}>
                          {fmtTime(group.filmingTime)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6f6f6f', marginTop: 7, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                      Filming date &amp; time
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...mono, fontSize: 24, fontWeight: 600, letterSpacing: '0.1em', color: '#f2f2f2' }}>
                      {group.jobId}
                    </div>
                    <div style={{ fontSize: 12, color: '#6f6f6f', marginTop: 7, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                      Project ID
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ padding: '0 24px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#232323', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#3ddc97', opacity: 0.85 }} />
                  </div>
                  <div style={{ fontSize: 12.5, color: '#8a8a8a', whiteSpace: 'nowrap' }}>
                    {done} of {groupTotal} returned
                  </div>
                </div>

                {/* Deliverable rows */}
                <div style={{ borderTop: '1px solid #202020' }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '22px 24px', fontSize: 13.5, color: '#6f6f6f', borderTop: '1px solid #202020' }}>
                      Nothing in this filter for this project.
                    </div>
                  ) : filtered.map((d, i) => {
                    const sm = STATUS_META[d.statusKey]
                    const isStrong = d.statusKey !== 'queued'
                    const dotOpacity = d.statusKey === 'queued' ? 0.55 : 1
                    const deliveredVers = d.deliveredVersions
                    const isExpanded = !!expanded[d.code]

                    return (
                      <div key={d.id} style={{ ...(i > 0 ? { borderTop: '1px solid #202020' } : {}), ...(d.isEpisode ? { background: '#181818' } : {}) }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px 20px', padding: '16px 24px', flexWrap: 'wrap' }}>

                          {/* Left: dot + name + code */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <div style={{
                              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                              background: sm.color, opacity: dotOpacity,
                            }} />
                            <div style={{
                              fontSize: d.isEpisode ? 17 : 15,
                              fontWeight: d.isEpisode ? 600 : 400,
                              color: d.isEpisode ? '#f2f2f2' : '#cfcfcf',
                              letterSpacing: '-0.005em',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {d.name}
                            </div>
                            <div style={{ ...mono, fontSize: 12, letterSpacing: '0.06em', color: '#8a8a8a', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 4, padding: '3px 7px', whiteSpace: 'nowrap' }}>
                              {d.code}
                            </div>
                          </div>

                          {/* Right: due pill + status pill */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            {d.due && (
                              <div style={pillStyle(d.due.color, d.due.strong)}>
                                {d.due.text}
                              </div>
                            )}
                            <div style={pillStyle(sm.color, isStrong, '152px')}>
                              {sm.label}
                            </div>
                          </div>
                        </div>

                        {/* Version history toggle */}
                        {deliveredVers.length > 0 && (
                          <div style={{ padding: '0 24px 16px' }}>
                            <button
                              onClick={() => setExpanded(prev => ({ ...prev, [d.code]: !isExpanded }))}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, color: '#8a8a8a', letterSpacing: '0.01em', fontFamily: 'inherit' }}
                            >
                              {isExpanded ? `▾ Hide ${deliveredVers.length} delivered ${deliveredVers.length === 1 ? 'version' : 'versions'}` : `▸ Show ${deliveredVers.length} delivered ${deliveredVers.length === 1 ? 'version' : 'versions'}`}
                            </button>
                            {isExpanded && (
                              <div style={{ marginTop: 12, borderLeft: '1px solid #2a2a2a', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                                {deliveredVers.map((v, vi) => (
                                  <div key={vi} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
                                    <div style={{ fontSize: 13.5, color: '#c9c9c9' }}>{v.label}</div>
                                    <div style={{ fontSize: 13, color: '#7c7c7c', fontVariantNumeric: 'tabular-nums' }}>Delivered {v.deliveredOn}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ fontSize: 12.5, color: '#6a6a6a', marginTop: 56 }}>
          Questions?{' '}
          <a href="mailto:singapore@poddster.com" style={{ color: '#8a8a8a', textDecoration: 'none' }}>
            singapore@poddster.com
          </a>
        </div>

      </div>
    </div>
  )
}
