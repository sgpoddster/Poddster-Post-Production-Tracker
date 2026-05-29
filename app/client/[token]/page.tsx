import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate, versionLabel } from '@/lib/utils'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_trigger: { label: 'Awaiting Files',         color: 'text-white/40' },
  active:          { label: 'In Production',           color: 'text-blue-400' },
  in_revision:     { label: 'Revision in Progress',    color: 'text-yellow-400' },
  in_client_review:{ label: 'Ready for Your Review',   color: 'text-green-400' },
  complete:        { label: 'Complete',                color: 'text-green-400' },
  cancelled:       { label: 'Cancelled',               color: 'text-white/30' },
}

export default async function ClientPortalPage({ params }: { params: { token: string } }) {
  // Use service-role-style read — no auth required, but token IS the access key
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*, versions(*)')
    .eq('portal_token', params.token)
    .single()

  if (!project) notFound()

  const versions = (project.versions ?? []).sort(
    (a: { version_number: number }, b: { version_number: number }) => a.version_number - b.version_number
  )

  const status = project.on_hold
    ? { label: 'On Hold', color: 'text-orange-400' }
    : (STATUS_LABELS[project.status] ?? { label: project.status, color: 'text-white/40' })

  const typeLabel = project.type === 'episode'
    ? 'Episode'
    : `Highlight #${project.highlight_number ?? ''}`

  return (
    <main className="min-h-screen bg-brand-black">
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">

        {/* Branding */}
        <div>
          <span className="text-lg font-bold text-white tracking-widest">PODDSTER</span>
          <span className="text-sm text-white/30 ml-2">Post Production</span>
        </div>

        {/* Project header */}
        <div className="space-y-1">
          <p className="text-xs text-white/30 uppercase tracking-widest">Your project</p>
          <h1 className="text-2xl font-bold text-white">
            {project.client_name || 'Your Project'}
          </h1>
          <p className="text-sm text-white/40">{typeLabel}</p>
        </div>

        {/* Status card */}
        <div className="bg-brand-surface border border-white/[0.08] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30 uppercase tracking-widest">Status</span>
            <span className={`text-sm font-semibold ${status.color}`}>{status.label}</span>
          </div>

          {project.filming_date && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30 uppercase tracking-widest">Recorded</span>
              <span className="text-sm text-white/70">
                {formatDate(project.filming_date)}
                {project.filming_time ? ` · ${project.filming_time}` : ''}
              </span>
            </div>
          )}

          {project.current_version && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30 uppercase tracking-widest">Version</span>
              <span className="text-sm text-white/70">V{project.current_version}</span>
            </div>
          )}
        </div>

        {/* Version timeline */}
        {versions.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs text-white/30 uppercase tracking-widest">Timeline</h2>
            <div className="space-y-2">
              {versions.map((v: {
                id: string
                version_number: number
                label: string
                submitted_date: string | null
                due_date: string | null
                done_date: string | null
              }) => {
                const isCurrent = v.version_number === project.current_version
                const isDone = !!v.done_date
                return (
                  <div
                    key={v.id}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors
                      ${isCurrent && !isDone
                        ? 'bg-brand-surface border-white/10'
                        : 'bg-transparent border-white/[0.04]'}`}
                  >
                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      isDone ? 'bg-green-400' : isCurrent ? 'bg-brand-red' : 'bg-white/15'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {v.label || versionLabel(v.version_number)}
                        </span>
                        {isCurrent && !isDone && (
                          <span className="text-xs text-brand-red/70">Current</span>
                        )}
                        {isDone && (
                          <span className="text-xs text-green-400/70">Delivered</span>
                        )}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {v.due_date && !isDone && (
                          <span>Due {formatDate(v.due_date)}</span>
                        )}
                        {v.done_date && (
                          <span>Delivered {formatDate(v.done_date)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Footer */}
        <p className="text-xs text-white/20 pt-4">
          Questions? Contact us at{' '}
          <a href="mailto:singapore@poddster.com" className="text-white/30 hover:text-white/50 transition-colors">
            singapore@poddster.com
          </a>
        </p>

      </div>
    </main>
  )
}
