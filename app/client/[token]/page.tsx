import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate, versionLabel } from '@/lib/utils'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_trigger:  { label: 'Awaiting Files',       color: 'text-white/40'    },
  active:           { label: 'In Production',         color: 'text-blue-400'   },
  in_revision:      { label: 'Revision in Progress',  color: 'text-yellow-400' },
  in_client_review: { label: 'Ready for Your Review', color: 'text-green-400'  },
  complete:         { label: 'Complete',              color: 'text-green-400'  },
  cancelled:        { label: 'Cancelled',             color: 'text-white/20'   },
}

function getStatus(project: { status: string; on_hold: boolean }) {
  if (project.on_hold) return { label: 'On Hold', color: 'text-orange-400' }
  return STATUS_LABELS[project.status] ?? { label: project.status, color: 'text-white/40' }
}

export default async function ClientPortalPage({ params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  // Look up client by portal token
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, first_name')
    .eq('portal_token', params.token)
    .single()

  if (!client) notFound()

  // Fetch all non-cancelled projects for this client, with their versions
  const { data: projects } = await supabase
    .from('projects')
    .select('*, versions(*)')
    .eq('client_name', client.name)
    .neq('status', 'cancelled')
    .order('filming_date', { ascending: false })

  const allProjects = projects ?? []

  // Group by job_id so episodes + highlights from the same session are together
  const groups = new Map<string, typeof allProjects>()
  for (const p of allProjects) {
    const key = p.job_id ?? p.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  const greeting = client.first_name ? `Hey ${client.first_name}!` : 'Your projects'

  return (
    <main className="min-h-screen bg-brand-black">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-10">

        {/* Branding */}
        <div>
          <span className="text-lg font-bold text-white tracking-widest">PODDSTER</span>
          <span className="text-sm text-white/30 ml-2">Post Production</span>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting}</h1>
          <p className="text-sm text-white/40 mt-1">
            Here's the status of your post-production projects.
          </p>
        </div>

        {/* Project groups */}
        {groups.size === 0 ? (
          <p className="text-sm text-white/30">No projects yet.</p>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([jobId, jobProjects]) => {
              const first = jobProjects[0]
              return (
                <div key={jobId} className="bg-brand-surface border border-white/[0.08] rounded-xl overflow-hidden">
                  {/* Session header */}
                  <div className="px-5 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <div>
                        {first.filming_date ? (
                          <p className="text-sm font-semibold text-white">
                            {formatDate(first.filming_date)}
                            {first.filming_time ? <span className="text-white/40 font-normal"> · {first.filming_time}</span> : ''}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-white">Session</p>
                        )}
                      </div>
                      <span className="text-xs text-white/25 font-mono">{first.job_id}</span>
                    </div>
                  </div>

                  {/* Projects in this session */}
                  <div className="divide-y divide-white/[0.04]">
                    {jobProjects.map(project => {
                      const status = getStatus(project)
                      const typeLabel = project.type === 'episode'
                        ? 'Episode'
                        : `Highlight #${project.highlight_number ?? ''}`

                      const versions = (project.versions ?? []).sort(
                        (a: { version_number: number }, b: { version_number: number }) =>
                          a.version_number - b.version_number
                      )
                      const currentVer = versions.find(
                        (v: { version_number: number }) => v.version_number === project.current_version
                      )

                      return (
                        <div key={project.id} className="px-5 py-4 space-y-3">
                          {/* Project row */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/70">{typeLabel}</span>
                            <span className={`text-xs font-medium ${status.color}`}>
                              {status.label}
                            </span>
                          </div>

                          {/* Current version due date */}
                          {currentVer && !currentVer.done_date && currentVer.due_date && (
                            <p className="text-xs text-white/30">
                              V{currentVer.version_number} due {formatDate(currentVer.due_date)}
                            </p>
                          )}

                          {/* Version timeline (only if more than 1 version or completed) */}
                          {versions.length > 1 || project.status === 'complete' ? (
                            <div className="space-y-1.5 pt-1">
                              {versions.map((v: {
                                id: string
                                version_number: number
                                label: string
                                due_date: string | null
                                done_date: string | null
                              }) => {
                                const isDone = !!v.done_date
                                const isCurrent = v.version_number === project.current_version
                                return (
                                  <div key={v.id} className="flex items-center gap-2.5">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      isDone ? 'bg-green-400' : isCurrent ? 'bg-brand-red' : 'bg-white/15'
                                    }`} />
                                    <span className="text-xs text-white/50">
                                      {v.label || versionLabel(v.version_number)}
                                    </span>
                                    {isDone && (
                                      <span className="text-xs text-green-400/60 ml-auto">
                                        Delivered {formatDate(v.done_date!)}
                                      </span>
                                    )}
                                    {!isDone && isCurrent && v.due_date && (
                                      <span className="text-xs text-white/25 ml-auto">
                                        Due {formatDate(v.due_date)}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-white/20 pt-2">
          Questions? Contact us at{' '}
          <a href="mailto:singapore@poddster.com" className="text-white/30 hover:text-white/50 transition-colors">
            singapore@poddster.com
          </a>
        </p>

      </div>
    </main>
  )
}
