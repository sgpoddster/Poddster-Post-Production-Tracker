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
  error: string | null
  discovered_at: string | null
  copy_started_at: string | null
  copy_completed_at: string | null
  upload_started_at: string | null
  upload_completed_at: string | null
  nas_path: string | null
  drive_url: string | null
  retry_count: number | null
  created_at: string
  updated_at: string
}

type StudioStat = {
  studio: string
  used_bytes: number | null
  free_bytes: number | null
  total_bytes: number | null
  updated_at: string
}

const STATE_META: Record<string, { label: string; classes: string; active?: boolean }> = {
  discovered:    { label: 'Discovered',  classes: 'bg-gray-500/15 text-gray-400' },
  copying:       { label: 'Copying…',    classes: 'bg-blue-500/15 text-blue-400',    active: true },
  copy_complete: { label: 'On NAS',      classes: 'bg-yellow-400/15 text-yellow-400' },
  uploading:     { label: 'Uploading…',  classes: 'bg-purple-500/15 text-purple-400', active: true },
  archived:      { label: 'Archived',    classes: 'bg-green-500/15 text-green-400' },
  failed:        { label: 'Failed',      classes: 'bg-red-500/15 text-red-400' },
  gave_up:       { label: 'Gave up',     classes: 'bg-red-900/30 text-red-300' },
}

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
  const usedGB  = (stat.used_bytes  / 1_073_741_824).toFixed(1)
  const totalGB = (stat.total_bytes / 1_073_741_824).toFixed(1)

  const barColor =
    pct >= 90 ? 'bg-red-500'    :
    pct >= 75 ? 'bg-yellow-400' :
                'bg-blue-500/60'

  return (
    <div className="mt-2.5">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[10px] text-th/30">SSD</span>
        <span className="text-[10px] text-th/40">{usedGB} of {totalGB} GB</span>
      </div>
      <div className="h-1 w-full rounded-full bg-th/[0.08] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1_048_576)    return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
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

const STUDIOS    = ['Studio 1', 'Studio 2', 'Studio 3', 'Studio 4']
const MAX_RETRIES = 5

export default function PCMDashboard({
  initialRecordings,
  initialStudioStats,
}: {
  initialRecordings: Recording[]
  initialStudioStats: StudioStat[]
}) {
  const [recordings,  setRecordings]  = useState<Recording[]>(initialRecordings)
  const [studioStats, setStudioStats] = useState<StudioStat[]>(initialStudioStats)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [tick,        setTick]        = useState(0)

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

    return () => {
      supabase.removeChannel(recChannel)
      supabase.removeChannel(statsChannel)
    }
  }, [])

  const studioCards = STUDIOS.map(studio => {
    const studioRows = recordings.filter(r => r.studio === studio)
    const active     = studioRows.find(r => ['copying', 'uploading'].includes(r.state))
    const latest     = active ?? studioRows[0] ?? null
    const stat       = studioStats.find(s => s.studio === studio)
    return { studio, latest, active, stat }
  })

  const activeCount  = recordings.filter(r => ['copying', 'uploading'].includes(r.state)).length
  const failingCount = recordings.filter(r => r.state === 'failed').length
  const gaveUpCount  = recordings.filter(r => r.state === 'gave_up').length

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-th/90">ATEM Backup</h1>
          <p className="mt-1 text-sm text-th/40">Synology NAS → Google Drive · Live</p>
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

      {/* Studio cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {studioCards.map(({ studio, latest, active, stat }) => (
          <div
            key={studio}
            className={`rounded-lg border bg-brand-surface p-4 transition-colors ${
              active ? 'border-blue-500/30' : 'border-th/[0.08]'
            }`}
          >
            <p className="text-sm font-semibold text-th/80">{studio}</p>
            {latest ? (
              <>
                <p className="text-xs text-th/35 mt-0.5 truncate font-mono">{latest.recording}</p>
                <div className="mt-2">
                  <Badge state={latest.state} retryCount={latest.retry_count} />
                </div>
                {active ? (
                  <p className="text-xs text-blue-400/70 mt-1">
                    {active.state === 'copying' ? '⬇ ' : '⬆ '}
                    {elapsed(active.state === 'copying' ? active.copy_started_at : active.upload_started_at)}
                  </p>
                ) : (
                  <p className="text-xs text-th/25 mt-1">{timeAgo(latest.updated_at)}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-th/30 mt-2">No recordings yet</p>
            )}
            <SsdBar stat={stat} />
          </div>
        ))}
      </div>

      {/* Alert banners */}
      {gaveUpCount > 0 && (
        <div className="mb-3 rounded-lg border border-red-700/30 bg-red-900/20 px-4 py-3">
          <p className="text-sm font-medium text-red-300">
            ✕ {gaveUpCount} recording{gaveUpCount > 1 ? 's' : ''} permanently failed after {MAX_RETRIES} attempts — manual intervention required.
          </p>
        </div>
      )}
      {failingCount > 0 && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-400">
            ⚠ {failingCount} recording{failingCount > 1 ? 's' : ''} failed — will auto-retry next scan.
          </p>
        </div>
      )}

      {/* Recordings table */}
      <div className="rounded-lg border border-th/[0.08] bg-brand-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-th/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-th/70">All Recordings</h2>
          <span className="text-xs text-th/30">{recordings.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-th/[0.05] text-sm">
            <thead className="bg-th/[0.02]">
              <tr>
                {['Studio', 'Recording', 'State', 'Size', 'Files', 'Updated', 'Drive', 'Error'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-th/40 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-th/[0.04]">
              {recordings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-th/30">
                    No recordings yet. Run PCM on the NAS to start.
                  </td>
                </tr>
              )}
              {recordings.map(r => {
                const isActive = ['copying', 'uploading'].includes(r.state)
                return (
                  <tr key={r.id} className={`transition-colors ${isActive ? 'bg-blue-500/[0.03]' : 'hover:bg-th/[0.02]'}`}>
                    <td className="px-4 py-3 font-medium text-th/80 whitespace-nowrap">{r.studio}</td>
                    <td className="px-4 py-3 font-mono text-xs text-th/60">{r.recording}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge state={r.state} retryCount={r.retry_count} />
                      {isActive && (
                        <span className="ml-2 text-xs text-th/30">
                          {elapsed(r.state === 'copying' ? r.copy_started_at : r.upload_started_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-th/50 whitespace-nowrap">{formatBytes(r.total_bytes)}</td>
                    <td className="px-4 py-3 text-th/50">{r.file_count ?? '—'}</td>
                    <td className="px-4 py-3 text-th/40 text-xs whitespace-nowrap">{timeAgo(r.updated_at)}</td>
                    <td className="px-4 py-3">
                      {r.drive_url ? (
                        <a href={r.drive_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-400/70 hover:text-blue-400 underline underline-offset-2 decoration-dotted">
                          View →
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-red-400 text-xs max-w-xs truncate">{r.error ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
