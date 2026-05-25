import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Project, Version } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import { CountdownTimer } from '@/components/CountdownTimer'
import MarkDoneButton from './MarkDoneButton'

export default async function QueuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Editors see their own queue; producers see everyone's
  const { data: projects } = await supabase
    .from('projects')
    .select('*, versions(*)')
    .in('status', ['active', 'in_revision'])
    .order('filming_date', { ascending: true })

  // Group: current user's projects first, then others
  const userEmail = user.email ?? ''
  const mine  = (projects ?? []).filter(p => p.assigned_editor === userEmail)
  const others = (projects ?? []).filter(p => p.assigned_editor !== userEmail)

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Editor Queue</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Signed in as <span className="text-gray-600">{userEmail}</span>
        </p>
      </div>

      {/* My queue */}
      {mine.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              My Projects <span className="font-normal text-gray-400 normal-case">({mine.length})</span>
            </h2>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {mine.map(p => <QueueRow key={p.id} project={p} isOwn />)}
          </div>
        </section>
      )}

      {/* All other active projects */}
      {others.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              All Active <span className="font-normal text-gray-400 normal-case">({others.length})</span>
            </h2>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {others.map(p => <QueueRow key={p.id} project={p} isOwn={false} />)}
          </div>
        </section>
      )}

      {mine.length === 0 && others.length === 0 && (
        <p className="text-sm text-gray-400">No active projects right now. 🎉</p>
      )}
    </main>
  )
}

function QueueRow({ project, isOwn }: { project: Project; isOwn: boolean }) {
  const currentVer: Version | undefined = (project.versions ?? []).find(
    v => v.version_number === project.current_version
  )

  return (
    <div className={`flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors ${isOwn ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-4 min-w-0">
        <code className="text-xs text-gray-300 shrink-0 w-20">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">
              {project.client_name || '—'}
            </span>
            <StatusBadge status={project.status} />
            <span className="text-xs text-gray-400">V{project.current_version}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {project.type === 'episode'
              ? '🎬 Episode'
              : `🎯 Highlight #${project.highlight_number}`}
            {project.filming_date ? ` · Filmed ${formatDate(project.filming_date)}` : ''}
            {' · '}{project.assigned_editor || 'Unassigned'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {currentVer?.due_date && <CountdownTimer dueDate={currentVer.due_date} />}
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
        {isOwn && (
          <MarkDoneButton
            projectId={project.id}
            versionId={currentVer?.id}
          />
        )}
      </div>
    </div>
  )
}
