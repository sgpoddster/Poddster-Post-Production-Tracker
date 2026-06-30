'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Recording = {
  id: string
  studio: string
  recording: string
  state: string
  file_count: number | null
  total_bytes: number | null
  bytes_transferred: number | null
  transfer_speed: string | null
  eta_seconds: number | null
  error: string | null
  discovered_at: string | null
  copy_started_at: string | null
  copy_completed_at: string | null
  upload_started_at: string | null
  upload_completed_at: string | null
  nas_path: string | null
  drive_url: string | null
  drive_folder: string | null
  retry_count: number | null
  nas_deleted_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

type StudioStat = {
  studio: string
  used_bytes: number | null
  free_bytes: number | null
  total_bytes: number | null
  ssd_root: string | null
  updated_at: string
}

type QuotaRow = {
  date: string
  bytes_uploaded: number
  updated_at: string
}

const DRIVE_QUOTA_BYTES = 750_000_000_000
const DRIVE_QUOTA_SAFE  = DRIVE_QUOTA_BYTES * 0.95

const STATE_META: Record<string, { label: string; classes: string; active?: boolean }> = {
  discovered:    { label: 'Discovered',  classes: 'bg-gray-500/15 text-gray-400' },
  copying:       { label: 'Copying…',    classes: 'bg-blue-500/15 text-blue-400',    active: true },
  copy_complete: { label: 'On NAS',      classes: 'bg-yellow-400/15 text-yellow-400' },
  uploading:     { label: 'Uploading…',  classes: 'bg-purple-500/15 text-purple-400', active: true },
  archived:      { label: 'Backed Up',   classes: 'bg-green-500/15 text-green-400' },
  deleted:       { label: 'Deleted',     classes: 'bg-gray-500/15 text-gray-500' },
  failed:        { label: 'Failed',      classes: 'bg-red-500/15 text-red-400' },
  gave_up:       { label: 'Gave up',     classes: 'bg-red-900/30 text-red-300' },
}

const IN_PROGRESS_STATES = new Set(['discovered', 'copying', 'copy_complete', 'uploading', 'failed', 'gave_up'])
const STATE_SORT: Record<string, number> = {
  copying: 0, uploading: 1, failed: 2, gave_up: 3, copy_complete: 4, discovered: 5,
}
const STUDIOS    = ['Studio 1', 'Studio 2', 'Studio 3', 'Studio 4']
const MAX_RETRIES = 5
const ONLINE_THRESHOLD_MS = 20 * 60 * 1000 // 20 minutes — discover.py runs every 15 mins
const COMPLETED_PAGE = 20

function Badge({ state, retryCount }: { state: string; retryCount?: number | null }) {
  const m = STATE_META[state] ?? { label: state, classes: 'bg-gray-500/15 text-gray-400' }
  const showRetries = (state === 'failed' || state === 'gave_up') && retryCount != null && retryCount > 0
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.classes}`}>
      {m.active && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {m.label}
      {showRetries && <span className="opacity-60">· {retryCount}×</span>}
    </span>
  )
}

function SsdBar({ stat }: { stat: StudioStat | undefined }) {
  if (!stat?.total_bytes || !stat?.used_bytes) return null
  const pct     = Math.min(100, (stat.used_bytes / stat.total_bytes) * 100)
  const usedGB  = (stat.used_bytes  / 1_000_000_000).toFixed(1)
  const totalGB = (stat.total_bytes / 1_000_000_000).toFixed(1)
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-400' : 'bg-blue-500/70'
  return (
    <div className="mt-3">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs font-medium text-th/50">SSD</span>
        <span className="text-xs font-semibold text-th/70">{usedGB} of {totalGB} GB</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-th/[0.10] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TransferProgress({ r }: { r: Recording }) {
  if (!r.bytes_transferred && !r.transfer_speed) return null
  const isCopy   = r.state === 'copying'
  const hasTotal = !!r.total_bytes
  const pct      = (hasTotal && r.bytes_transferred)
    ? Math.min(100, (r.bytes_transferred / r.total_bytes!) * 100) : null
  const barColor = isCopy ? 'bg-blue-500/50' : 'bg-purple-500/60'
  return (
    <div className="mt-1.5 space-y-1">
      {pct !== null ? (
        <div className="h-1 w-full rounded-full bg-th/[0.08] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <div className="h-1 w-full rounded-full bg-th/[0.08] overflow-hidden">
          <div className={`h-full w-1/3 rounded-full ${barColor} animate-pulse`} />
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px]">
        {r.bytes_transferred != null && (
          <span className="text-th/50">{formatBytes(r.bytes_transferred)}{hasTotal ? ` / ${formatBytes(r.total_bytes)}` : ' copied'}</span>
        )}
        {r.transfer_speed && <span className="text-th/35">· {r.transfer_speed}</span>}
        {r.eta_seconds != null && r.eta_seconds > 0 && (
          <span className="text-th/35">· ETA {formatEta(r.eta_seconds)}</span>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1_000_000)       return `${(bytes / 1_000).toFixed(1)} KB`
  if (bytes < 1_000_000_000)   return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes < 1_000_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  return `${(bytes / 1_000_000_000_000).toFixed(2)} TB`
}

function formatEta(secs: number | null): string {
  if (!secs || secs <= 0) return ''
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—'
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60)    return `${secs}s ago`
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function elapsed(ts: string | null): string {
  if (!ts) return ''
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const NAS_RETENTION_DAYS   = 10
const DRIVE_RETENTION_DAYS = 30

function retentionDate(upload_completed_at: string | null, days: number): Date | null {
  if (!upload_completed_at) return null
  const d = new Date(upload_completed_at)
  d.setDate(d.getDate() + days)
  return d
}

function DaysCountdown({ due, deleted }: { due: Date | null; deleted?: boolean }) {
  if (deleted) return <span className="text-th/25 text-xs">Deleted</span>
  if (!due)    return <span className="text-th/30">—</span>
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const colour = daysLeft <= 3  ? 'text-red-400 font-semibold'
               : daysLeft <= 7  ? 'text-red-400/70'
               : daysLeft <= 14 ? 'text-yellow-400/80'
               :                  'text-th/35'
  const label = daysLeft <= 0 ? 'Today' : `${daysLeft}d`
  return <span className={`text-xs ${colour}`}>{label}</span>
}

export default function PCMDashboard({
  initialRecordings,
  initialStudioStats,
  initialQuotaRows,
  todayDate,
}: {
  initialRecordings: Recording[]
  initialStudioStats: StudioStat[]
  initialQuotaRows: QuotaRow[]
  todayDate: string
}) {
  const [recordings,  setRecordings]  = useState<Recording[]>(initialRecordings)
  const [studioStats, setStudioStats] = useState<StudioStat[]>(initialStudioStats)
  const [quotaRows,   setQuotaRows]   = useState<QuotaRow[]>(initialQuotaRows)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [showAllCompleted, setShowAllCompleted] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const recChannel = supabase
      .channel('pcm_recordings_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcm_recordings' }, (payload) => {
        setLastUpdated(new Date())
        if (payload.eventType === 'INSERT')
          setRecordings(prev => [payload.new as Recording, ...prev])
        else if (payload.eventType === 'UPDATE')
          setRecordings(prev => prev.map(r => r.id === payload.new.id ? payload.new as Recording : r))
        else if (payload.eventType === 'DELETE')
          setRecordings(prev => prev.filter(r => r.id !== payload.old.id))
      })
      .subscribe()

    const statsChannel = supabase
      .channel('pcm_studio_stats_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcm_studio_stats' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          setStudioStats(prev => {
            const updated = payload.new as StudioStat
            const exists  = prev.find(s => s.studio === updated.studio)
            return exists
              ? prev.map(s => s.studio === updated.studio ? updated : s)
              : [...prev, updated]
          })
        }
      })
      .subscribe()

    const quotaChannel = supabase
      .channel('pcm_quota_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcm_upload_quota' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const updated = payload.new as QuotaRow
          setQuotaRows(prev => {
            const exists = prev.find(q => q.date === updated.date)
            return exists ? prev.map(q => q.date === updated.date ? updated : q) : [updated, ...prev]
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(recChannel)
      supabase.removeChannel(statsChannel)
      supabase.removeChannel(quotaChannel)
    }
  }, [])

  // Quota for today + recent history
  const todayQuota    = quotaRows.find(q => q.date === todayDate)
  const todayUploaded = todayQuota?.bytes_uploaded ?? 0
  const quotaPct      = Math.min(100, (todayUploaded / DRIVE_QUOTA_BYTES) * 100)
  const quotaRemaining = Math.max(0, DRIVE_QUOTA_SAFE - todayUploaded)
  const quotaExhausted = todayUploaded >= DRIVE_QUOTA_SAFE

  // Recordings waiting to upload (on NAS, not yet sent to Drive)
  const pendingUpload    = recordings.filter(r => r.state === 'copy_complete')
  const pendingBytes     = pendingUpload.reduce((s, r) => s + (r.total_bytes ?? 0), 0)
  const pendingNightsEst = pendingBytes > 0
    ? Math.ceil(pendingBytes / DRIVE_QUOTA_SAFE)
    : 0

  const inProgress = recordings
    .filter(r => IN_PROGRESS_STATES.has(r.state) && r.recording !== '—')
    .sort((a, b) => (STATE_SORT[a.state] ?? 9) - (STATE_SORT[b.state] ?? 9))

  const completed = recordings
    .filter(r => r.state === 'archived')
    .sort((a, b) => new Date(b.upload_completed_at ?? b.updated_at).getTime()
                  - new Date(a.upload_completed_at ?? a.updated_at).getTime())

  const completedVisible = showAllCompleted ? completed : completed.slice(0, COMPLETED_PAGE)

  const deleted = recordings
    .filter(r => r.state === 'deleted')
    .sort((a, b) => new Date(b.deleted_at ?? b.updated_at).getTime()
                  - new Date(a.deleted_at ?? a.updated_at).getTime())

  const activeCount  = recordings.filter(r => ['copying', 'uploading'].includes(r.state)).length
  const failingCount = inProgress.filter(r => r.state === 'failed' && r.recording !== '—').length
  const gaveUpCount  = inProgress.filter(r => r.state === 'gave_up').length

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-th/90">Poddster Backup Status</h1>
          <p className="mt-1 text-sm text-th/40">ATEM SSDs → Synology NAS → Google Drive</p>
        </div>
        <div className="text-right">
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5 text-blue-400 text-sm mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
              </span>
              {activeCount} transfer{activeCount > 1 ? 's' : ''} in progress
            </div>
          )}
          <p className="text-xs text-th/25">Updated {timeAgo(lastUpdated.toISOString())}</p>
        </div>
      </div>

      {/* NAS + Drive status row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Synology NAS card */}
        {(() => {
          const nasStat   = studioStats.find(s => s.studio === 'NAS')
          const nasOnline = nasStat
            ? (Date.now() - new Date(nasStat.updated_at).getTime()) < ONLINE_THRESHOLD_MS
            : false
          const nasName   = nasStat?.ssd_root ?? 'Synology NAS'
          return (
            <div className="rounded-lg border border-th/[0.08] bg-brand-surface p-4 flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-th/90">Synology NAS</p>
                  <p className="text-xs text-th/50 mt-0.5 font-mono">{nasName}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${nasOnline ? 'bg-green-400' : nasStat ? 'bg-red-400/60' : 'bg-gray-600'}`} />
                  <span className={`text-xs font-medium ${nasOnline ? 'text-green-400' : 'text-th/40'}`}>
                    {nasOnline ? 'Online' : nasStat ? 'Offline' : 'No data yet'}
                  </span>
                </div>
              </div>
              <SsdBar stat={nasStat} />
              {nasStat && (
                <p className="text-xs text-th/40 mt-2">Last seen {timeAgo(nasStat.updated_at)}</p>
              )}
              {pendingUpload.length > 0 && (
                <div className="mt-3 pt-3 border-t border-th/[0.08]">
                  <p className="text-xs text-th/55 font-medium">
                    {pendingUpload.length} recording{pendingUpload.length > 1 ? 's' : ''} on NAS · {(pendingBytes / 1e9).toFixed(1)} GB pending upload
                  </p>
                </div>
              )}
            </div>
          )
        })()}

        {/* Google Drive quota card */}
        <div className="rounded-lg border border-th/[0.08] bg-brand-surface p-4 flex flex-col space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-base font-bold text-th/90">Google Drive</p>
              <p className="text-xs text-th/50 mt-0.5">{todayDate} · 750 GB / 24 h limit</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-bold ${quotaExhausted ? 'text-red-400' : quotaPct >= 75 ? 'text-yellow-400' : 'text-green-400'}`}>
                {(todayUploaded / 1e9).toFixed(1)} <span className="text-th/50 font-normal text-xs">/ 750 GB</span>
              </p>
              <p className="text-xs text-th/50 mt-0.5">
                {quotaExhausted
                  ? 'Exhausted — resets midnight SGT'
                  : `${(quotaRemaining / 1e9).toFixed(1)} GB left tonight`}
              </p>
            </div>
          </div>

          {/* Quota bar */}
          <div>
            <div className="h-1.5 w-full rounded-full bg-th/[0.10] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  quotaExhausted ? 'bg-red-500' : quotaPct >= 75 ? 'bg-yellow-400' : 'bg-green-500/70'
                }`}
                style={{ width: `${quotaPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-th/40">0 GB</span>
              <span className="text-xs text-th/40">750 GB</span>
            </div>
          </div>

          {/* Backlog / nights-to-clear */}
          {pendingUpload.length > 0 && (
            <div className={`rounded-md px-3 py-2 flex items-center justify-between gap-2 ${
              quotaExhausted ? 'bg-red-500/10 border border-red-500/20' : 'bg-th/[0.04]'
            }`}>
              <p className={`text-sm font-semibold ${quotaExhausted ? 'text-red-300' : 'text-th/70'}`}>
                {pendingUpload.length} recording{pendingUpload.length > 1 ? 's' : ''} queued
              </p>
              {pendingNightsEst > 1 ? (
                <span className="text-xs font-medium text-yellow-400 shrink-0">~{pendingNightsEst} nights to clear</span>
              ) : (
                <span className="text-xs text-th/50 shrink-0">clears tonight</span>
              )}
            </div>
          )}

          {/* Recent history mini-bars */}
          {quotaRows.length > 0 && (
            <div className="pt-1 border-t border-th/[0.08] space-y-1.5">
              <p className="text-xs font-medium text-th/50">Upload history</p>
              {quotaRows.slice(0, 5).map(q => {
                const pct = Math.min(100, (q.bytes_uploaded / DRIVE_QUOTA_BYTES) * 100)
                return (
                  <div key={q.date} className="flex items-center gap-2">
                    <span className="text-xs text-th/50 w-[72px] shrink-0">{q.date.slice(5)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-th/[0.08] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 95 ? 'bg-red-500/70' : pct >= 75 ? 'bg-yellow-400/60' : 'bg-green-500/50'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-th/60 w-14 text-right shrink-0 font-medium">
                      {(q.bytes_uploaded / 1e9).toFixed(1)} GB
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Studio cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STUDIOS.map(studio => {
          const stat      = studioStats.find(s => s.studio === studio)
          const isOnline  = stat
            ? (Date.now() - new Date(stat.updated_at).getTime()) < ONLINE_THRESHOLD_MS
            : false
          const ssdName   = stat?.ssd_root?.replace(/^\//, '') ?? null

          return (
            <div key={studio} className="rounded-lg border border-th/[0.08] bg-brand-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-th/90">{studio} ATEM</p>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-400' : stat ? 'bg-red-400/70' : 'bg-gray-600'}`} />
                  <span className={`text-xs font-medium ${isOnline ? 'text-green-400' : 'text-th/45'}`}>
                    {isOnline ? 'Online' : stat ? 'Offline' : 'Unknown'}
                  </span>
                </div>
              </div>
              {ssdName && (
                <p className="text-xs text-th/45 mt-0.5 font-mono truncate">{ssdName}</p>
              )}
              <SsdBar stat={stat} />
              {stat && (
                <p className="text-xs text-th/40 mt-2">Last seen {timeAgo(stat.updated_at)}</p>
              )}
              {!stat && (
                <p className="text-xs text-th/40 mt-3">No data yet</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Alert banners */}
      {gaveUpCount > 0 && (
        <div className="rounded-lg border border-red-700/30 bg-red-900/20 px-4 py-3">
          <p className="text-sm font-medium text-red-300">
            ✕ {gaveUpCount} recording{gaveUpCount > 1 ? 's' : ''} permanently failed after {MAX_RETRIES} attempts — manual intervention required.
          </p>
        </div>
      )}
      {failingCount > 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-400">
            ⚠ {failingCount} recording{failingCount > 1 ? 's' : ''} failed — will auto-retry next scan.
          </p>
        </div>
      )}

      {/* In Progress */}
      {inProgress.length > 0 && (
        <div className="rounded-lg border border-th/[0.08] bg-brand-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-th/[0.06] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-th/70">In Progress</h2>
            <span className="text-xs text-th/30">{inProgress.length} recording{inProgress.length > 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-th/[0.05] text-sm">
              <thead className="bg-th/[0.02]">
                <tr>
                  {['Studio', 'Recording', 'State', 'Size', 'Updated', 'Error'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-th/40 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-th/[0.04]">
                {inProgress.map(r => {
                  const isActive = ['copying', 'uploading'].includes(r.state)
                  return (
                    <tr key={r.id} className={`transition-colors ${isActive ? 'bg-blue-500/[0.03]' : 'hover:bg-th/[0.02]'}`}>
                      <td className="px-4 py-3 font-medium text-th/80 whitespace-nowrap">{r.studio}</td>
                      <td className="px-4 py-3 font-mono text-xs text-th/60">{r.recording}</td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge state={r.state} retryCount={r.retry_count} />
                          {isActive && (
                            <span className="text-xs text-th/30">
                              {elapsed(r.state === 'copying' ? r.copy_started_at : r.upload_started_at)}
                            </span>
                          )}
                        </div>
                        {isActive && <TransferProgress r={r} />}
                      </td>
                      <td className="px-4 py-3 text-th/50 whitespace-nowrap">{formatBytes(r.total_bytes)}</td>
                      <td className="px-4 py-3 text-th/40 text-xs whitespace-nowrap">{timeAgo(r.updated_at)}</td>
                      <td className="px-4 py-3 text-red-400 text-xs max-w-xs truncate">
                        {['failed', 'gave_up'].includes(r.state) ? (r.error ?? '') : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed */}
      <div className="rounded-lg border border-th/[0.08] bg-brand-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-th/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-th/70">Completed</h2>
          <span className="text-xs text-th/30">{completed.length} total</span>
        </div>
        {completed.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-th/30">No archived recordings yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-th/[0.05] text-sm">
                <thead className="bg-th/[0.02]">
                  <tr>
                    {['Studio', 'Recording', 'Size', 'Files', 'Completed', 'NAS Delete', 'NAS Days', 'Drive Delete', 'Drive Days', 'Drive'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-th/40 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-th/[0.04]">
                  {completedVisible.map(r => {
                    const nasDate   = retentionDate(r.upload_completed_at, NAS_RETENTION_DAYS)
                    const driveDate = retentionDate(r.upload_completed_at, DRIVE_RETENTION_DAYS)
                    return (
                      <tr key={r.id} className="hover:bg-th/[0.02] transition-colors">
                        <td className="px-4 py-3 font-medium text-th/80 whitespace-nowrap">{r.studio}</td>
                        <td className="px-4 py-3 font-mono text-xs text-th/60">{r.recording}</td>
                        <td className="px-4 py-3 text-th/50 whitespace-nowrap">{formatBytes(r.total_bytes)}</td>
                        <td className="px-4 py-3 text-th/50">{r.file_count ?? '—'}</td>
                        <td className="px-4 py-3 text-th/40 text-xs whitespace-nowrap">{formatDate(r.upload_completed_at)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-th/35">
                          {r.nas_deleted_at ? formatDate(r.nas_deleted_at) : (nasDate?.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <DaysCountdown due={nasDate} deleted={!!r.nas_deleted_at} />
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-th/35">
                          {driveDate?.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <DaysCountdown due={driveDate} />
                        </td>
                        <td className="px-4 py-3">
                          {r.drive_url ? (
                            <a href={r.drive_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-400/70 hover:text-blue-400 underline underline-offset-2 decoration-dotted">
                              View →
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {completed.length > COMPLETED_PAGE && (
              <div className="px-4 py-3 border-t border-th/[0.06] text-center">
                <button
                  onClick={() => setShowAllCompleted(v => !v)}
                  className="text-xs text-th/40 hover:text-th/70 transition-colors"
                >
                  {showAllCompleted
                    ? 'Show less'
                    : `Show all ${completed.length} recordings`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Deleted */}
      {deleted.length > 0 && (
        <div className="rounded-lg border border-th/[0.06] bg-brand-surface overflow-hidden opacity-60">
          <div className="px-4 py-3 border-b border-th/[0.06] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-th/50">Deleted from Drive</h2>
            <span className="text-xs text-th/30">{deleted.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-th/[0.05] text-sm">
              <thead className="bg-th/[0.02]">
                <tr>
                  {['Studio', 'Recording', 'Size', 'Backed Up', 'Deleted'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-th/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-th/[0.04]">
                {deleted.map(r => (
                  <tr key={r.id} className="hover:bg-th/[0.02] transition-colors">
                    <td className="px-4 py-3 font-medium text-th/50 whitespace-nowrap">{r.studio}</td>
                    <td className="px-4 py-3 font-mono text-xs text-th/40">{r.recording}</td>
                    <td className="px-4 py-3 text-th/40 whitespace-nowrap">{formatBytes(r.total_bytes)}</td>
                    <td className="px-4 py-3 text-th/30 text-xs whitespace-nowrap">{formatDate(r.upload_completed_at)}</td>
                    <td className="px-4 py-3 text-th/30 text-xs whitespace-nowrap">{formatDate(r.deleted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
