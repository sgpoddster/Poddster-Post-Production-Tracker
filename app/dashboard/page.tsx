import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Project } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import TriggerButton from './TriggerButton'
import StartRevisionButton from './StartRevisionButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*, versions(*)')
    .not('status', 'in', '("complete","cancelled")')
    .order('filming_date', { ascending: true })

  const pending    = (projects ?? []).filter(p => p.status === 'pending_trigger')
  const inProgress = (projects ?? []).filter(p =>
    ['active', 'in_revision', 'delivered'].includes(p.status)
  )

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">AM Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Trigger projects when footage is ready to edit</p>
      </div>

      {/* ── Pending Trigger ────────────────────────────────── */}
      <Section
        dot="bg-amber-400"
        title="Awaiting Trigger"
        count={pending.length}
        empty="No projects waiting to be triggered."
      >
        {pending.map(p => (
          <PendingRow key={p.id} project={p} />
        ))}
      </Section>

      {/* ── In Progress ───────────────────────────────────── */}
      <Section
        dot="bg-blue-400"
        title="In Progress"
        count={inProgress.length}
        empty="Nothing currently in progress."
      >
        {inProgress.map(p => (
          <InProgressRow key={p.id} project={p} />
        ))}
      </Section>
    </main>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({
  dot, title, count, empty, children
}: {
  dot: string; title: string; count: number; empty: string; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          {title} <span className="font-normal text-gray-400 normal-case">({count})</span>
        </h2>
      </div>
      {count === 0 ? (
        <p className="text-sm text-gray-400 pl-5">{empty}</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {children}
        </div>
      )}
    </section>
  )
}

function PendingRow({ project }: { project: Project }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4 min-w-0">
        <code className="text-xs text-gray-300 shrink-0 w-14">{project.job_id}</code>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {project.client_name || '—'}
            {project.client_code && (
              <span className="ml-1.5 text-xs text-gray-400">({project.client_code})</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {project.filming_date ? formatDate(project.filming_date) : '—'}
            {project.filming_time ? ` · ${project.filming_time}` : ''}
            {' · '}
            {project.type === 'episode'
              ? '🎬 Episode'
              : `🎯 Highlight #${project.highlight_number}`}
            {project.setup ? ` · ${project.setup}` : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {project.drive_link && (
          <a
            href={project.drive_link}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            Drive ↗
          </a>
        )}
        <span className="text-xs text-gray-400">{project.assigned_editor || 'No editor'}</span>
        <TriggerButton projectId={project.id} />
      </div>
    </div>
  )
}

function InProgressRow({ project }: { project: Project }) {
  const currentVer = (project.versions ?? []).find(
    v => v.version_number === project.current_version
  )

  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4 min-w-0">
        <code className="text-xs text-gray-300 shrink-0 w-20">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {project.client_name || '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {project.type === 'episode'
              ? '🎬 Episode'
              : `🎯 Highlight #${project.highlight_number}`}
            {currentVer?.due_date ? ` · Due ${formatDate(currentVer.due_date)}` : ''}
            {' · '}V{project.current_version}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span className="text-xs text-gray-400">{project.assigned_editor || '—'}</span>
        <StatusBadge status={project.status} />
        {project.status === 'delivered' && (
          <StartRevisionButton
            projectId={project.id}
            currentVersion={project.current_version}
          />
        )}
      </div>
    </div>
  )
}
