import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth'

const STATE_META: Record<string, { label: string; classes: string }> = {
  discovered:    { label: 'Discovered',  classes: 'bg-gray-500/15 text-gray-400' },
  copying:       { label: 'Copying…',    classes: 'bg-blue-500/15 text-blue-400' },
  copy_complete: { label: 'On NAS',      classes: 'bg-yellow-400/15 text-yellow-400' },
  uploading:     { label: 'Uploading…',  classes: 'bg-purple-500/15 text-purple-400' },
  archived:      { label: 'Archived',    classes: 'bg-green-500/15 text-green-400' },
  failed:        { label: 'Failed',      classes: 'bg-red-500/15 text-red-400' },
}

function Badge({ state }: { state: string }) {
  const m = STATE_META[state] ?? { label: state, classes: 'bg-gray-500/15 text-gray-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${m.classes}`}>
      {m.label}
    </span>
  )
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—'
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

const STUDIOS = ['Studio 1', 'Studio 2', 'Studio 3', 'Studio 4']

export default async function PCMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const serviceClient = createServiceClient()
  const { data: recordings, error } = await serviceClient
    .from('pcm_recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return (
      <div className="p-8 text-red-400">
        Error loading PCM data: {error.message}
      </div>
    )
  }

  const rows = recordings ?? []

  // One card per studio showing its most recent recording
  const studioCards = STUDIOS.map(studio => {
    const studioRows = rows.filter(r => r.studio === studio)
    const latest = studioRows[0] ?? null
    const active = studioRows.find(r => ['copying', 'uploading'].includes(r.state))
    return { studio, latest, active, total: studioRows.length }
  })

  const failing = rows.filter(r => r.state === 'failed')

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-th/90">ATEM Backup — PCM</h1>
        <p className="mt-1 text-sm text-th/40">
          Synology NAS → Google Drive pipeline. Updates pushed live from the NAS.
        </p>
      </div>

      {/* Studio status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {studioCards.map(({ studio, latest, active }) => (
          <div key={studio} className="rounded-lg border border-th/[0.08] bg-brand-surface p-4">
            <p className="text-sm font-semibold text-th/80">{studio}</p>
            {latest ? (
              <>
                <p className="text-xs text-th/35 mt-0.5 truncate font-mono">{latest.recording}</p>
                <div className="mt-2">
                  <Badge state={active ? active.state : latest.state} />
                </div>
                <p className="text-xs text-th/25 mt-1">{timeAgo(latest.updated_at)}</p>
              </>
            ) : (
              <p className="text-xs text-th/30 mt-2">No recordings yet</p>
            )}
          </div>
        ))}
      </div>

      {/* Failures alert */}
      {failing.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-400">
            {failing.length} recording{failing.length > 1 ? 's' : ''} failed —
            check the table below for details.
          </p>
        </div>
      )}

      {/* All recordings table */}
      <div className="rounded-lg border border-th/[0.08] bg-brand-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-th/[0.06]">
          <h2 className="text-sm font-semibold text-th/70">All Recordings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-th/[0.05] text-sm">
            <thead className="bg-th/[0.02]">
              <tr>
                {['Studio', 'Recording', 'State', 'Size', 'Files', 'Copied', 'Error'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-th/40 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-th/[0.04]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-th/30">
                    No recordings yet. PCM will populate this table once it runs on the NAS.
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-th/[0.02] transition-colors">
                  <td className="px-4 py-3 font-medium text-th/80 whitespace-nowrap">{r.studio}</td>
                  <td className="px-4 py-3 font-mono text-xs text-th/60">{r.recording}</td>
                  <td className="px-4 py-3"><Badge state={r.state} /></td>
                  <td className="px-4 py-3 text-th/50">{formatBytes(r.total_bytes)}</td>
                  <td className="px-4 py-3 text-th/50">{r.file_count ?? '—'}</td>
                  <td className="px-4 py-3 text-th/40 text-xs whitespace-nowrap">
                    {timeAgo(r.copy_completed_at)}
                  </td>
                  <td className="px-4 py-3 text-red-400 text-xs max-w-xs truncate">
                    {r.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
