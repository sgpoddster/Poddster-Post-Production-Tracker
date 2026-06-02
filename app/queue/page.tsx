import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Project, Version } from '@/lib/types'
import { formatDate, formatAssignee } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import { CountdownTimer } from '@/components/CountdownTimer'
import { getUserProfile } from '@/lib/auth'
import MarkDoneButton from './MarkDoneButton'
import OnHoldButton from '@/components/OnHoldButton'

export default async function QueuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  const isAdmin = profile?.role === 'admin'
  const userEmail = user.email ?? ''

  // Queue only shows active work — not client review (that's waiting, not editing)
  let query = supabase
    .from('projects')
    .select('*, versions(*)')
    .in('status', ['active', 'in_revision'])

  if (!isAdmin) {
    query = query.eq('assigned_editor', userEmail)
  }

  const [{ data: projects }, { data: profilesData }] = await Promise.all([
    query,
    supabase.from('user_profiles').select('email, display_name'),
  ])

  const editorNames: Record<string, string> = {}
  for (const p of profilesData ?? []) {
    if (p.email) editorNames[p.email] = p.display_name || p.email
  }

  // Sort: most overdue / soonest due first, no-due-date at the bottom
  function daysRemaining(p: Project): number {
    const ver = (p.versions ?? []).find((v: Version) => v.version_number === p.current_version)
    if (!ver?.due_date) return Infinity
    if (p.on_hold && p.hold_date) {
      // Frozen: days remaining as-of hold date
      return Math.floor(
        (new Date(ver.due_date + 'T23:59:59').getTime() -
         new Date(p.hold_date  + 'T23:59:59').getTime()) / 86_400_000
      )
    }
    return Math.floor(
      (new Date(ver.due_date + 'T23:59:59').getTime() - Date.now()) / 86_400_000
    )
  }

  const sorted = (projects ?? []).slice().sort((a, b) => daysRemaining(a) - daysRemaining(b))


  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          {isAdmin ? 'All Queues' : 'My Queue'}
        </h1>
        <p className="text-sm text-white/40 mt-1">
          {isAdmin
            ? 'All active work across all editors, sorted by urgency'
            : 'Your active projects — most urgent first'}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/25 text-sm">No active projects right now.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
          {sorted.map(p => (
            <QueueRow key={p.id} project={p} isAdmin={isAdmin}
              editorName={formatAssignee(p.assigned_editor, p.editor, editorNames)} />
          ))}
        </div>
      )}
    </main>
  )
}

function QueueRow({ project, isAdmin, editorName }: {
  project: Project; isAdmin: boolean; editorName: string
}) {
  const currentVer: Version | undefined = (project.versions ?? []).find(
    v => v.version_number === project.current_version
  )

  return (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors group">
      <Link href={`/projects/${project.id}`} className="flex items-center gap-4 min-w-0 flex-1">
        <code className="text-xs text-white/20 shrink-0 w-20 font-mono">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-medium text-white group-hover:text-white/90 truncate">
              {project.client_name || '—'}
            </span>
            <StatusBadge status={project.status} />
            <span className="text-xs text-white/30">V{project.current_version}</span>
          </div>
          <div className="text-xs text-white/35 mt-0.5 flex items-center gap-1.5">
            {project.type === 'episode' ? 'Episode' : `Highlight #${project.highlight_number}`}
            {project.filming_date && (
              <><span className="text-white/15">·</span>Filmed {formatDate(project.filming_date)}</>
            )}
            <span className="text-white/15">·</span>
            <span className="font-medium text-white/60">{editorName}</span>
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {currentVer?.due_date && (
          <CountdownTimer
            dueDate={currentVer.due_date}
            onHold={project.on_hold}
            holdDate={project.hold_date}
          />
        )}
        {/* Fixed-width button area so timer column never shifts */}
        <div className="flex items-center gap-2 justify-end w-[140px]">
          {project.drive_link && (
            <a href={project.drive_link} target="_blank" rel="noreferrer"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >Drive ↗</a>
          )}
          {isAdmin && (
            <OnHoldButton projectId={project.id} onHold={project.on_hold} />
          )}
          {!project.on_hold && (
            <MarkDoneButton projectId={project.id} versionId={currentVer?.id} />
          )}
        </div>
      </div>
    </div>
  )
}
