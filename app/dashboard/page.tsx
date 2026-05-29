import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Project } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import { CountdownTimer } from '@/components/CountdownTimer'
import { getUserProfile } from '@/lib/auth'
import TriggerButton from './TriggerButton'
import StartRevisionButton from './StartRevisionButton'
import NewProjectButton from './NewProjectButton'
import { SearchBar } from './SearchBar'
import { ProducerFilter } from './ProducerFilter'
import MarkDoneButton from '../queue/MarkDoneButton'
import CompleteButton from '@/components/CompleteButton'
import UndoButton from '@/components/UndoButton'
import OnHoldButton from '@/components/OnHoldButton'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { q?: string; editors?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  const isAdmin = profile?.role === 'admin'

  // Fetch active/pending projects — admin sees all, producer sees their own
  let query = supabase
    .from('projects')
    .select('*, versions(*)')
    .not('status', 'in', '("complete","cancelled")')
    .order('filming_date', { ascending: true })

  if (!isAdmin) {
    query = query.eq('assigned_editor', user.email)
  }

  // Fetch recently completed (last 30 days), newest first
  let completedQuery = supabase
    .from('projects')
    .select('*, versions(*)')
    .eq('status', 'complete')
    .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('updated_at', { ascending: false })

  if (!isAdmin) {
    completedQuery = completedQuery.eq('assigned_editor', user.email)
  }

  const [{ data: projects }, { data: completedProjects }, { data: clientsData }, { data: profilesData }] =
    await Promise.all([
      query,
      completedQuery,
      supabase.from('clients').select('id, name, code').order('name'),
      supabase.from('user_profiles').select('email, display_name').order('display_name'),
    ])

  const clients = clientsData ?? []
  const editors = profilesData ?? []

  // email → display name lookup
  const editorNames: Record<string, string> = {}
  for (const p of profilesData ?? []) {
    if (p.email) editorNames[p.email] = p.display_name || p.email
  }

  // Filters
  const q             = (searchParams?.q ?? '').trim().toLowerCase()
  const editorFilters = searchParams?.editors
    ? searchParams.editors.split(',').filter(Boolean)
    : []

  const matchesSearch = (p: Project) => {
    if (!q) return true
    return (
      (p.client_name ?? '').toLowerCase().includes(q) ||
      (p.internal_id ?? '').toLowerCase().includes(q) ||
      (editorNames[p.assigned_editor ?? ''] ?? p.assigned_editor ?? '').toLowerCase().includes(q)
    )
  }
  const matchesEditor = (p: Project) => {
    if (!editorFilters.length) return true
    return editorFilters.includes(p.assigned_editor ?? '')
  }

  const allProjects = projects ?? []
  const filter = (p: Project) => matchesSearch(p) && matchesEditor(p)
  const pending    = allProjects.filter(p => p.status === 'pending_trigger').filter(filter)
  const inProgress = allProjects.filter(p => ['active', 'in_revision'].includes(p.status)).filter(filter)
  const inReview   = allProjects.filter(p => p.status === 'in_client_review').filter(filter)
  const completed  = (completedProjects ?? []).filter(filter)

  const totalShown = pending.length + inProgress.length + inReview.length + completed.length

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {isAdmin ? 'Dashboard' : 'My Dashboard'}
              </h1>
            </div>
            {isAdmin && editors.length > 0 && (
              <ProducerFilter editors={editors} selected={editorFilters} />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SearchBar defaultValue={searchParams?.q} />
            <NewProjectButton clients={clients} editors={editors} currentUserEmail={user.email ?? ''} />
          </div>
        </div>
      </div>

      {q && totalShown === 0 && (
        <p className="text-sm text-white/30 text-center py-8">No projects match &ldquo;{q}&rdquo;</p>
      )}

      <Section
        dot="bg-amber-500"
        title="Awaiting Trigger"
        count={pending.length}
        empty={q ? `No matches in this section.` : 'No projects waiting to be triggered.'}
      >
        {pending.map(p => <PendingRow key={p.id} project={p} isAdmin={isAdmin}
          editorName={editorNames[p.assigned_editor ?? ''] ?? p.assigned_editor ?? '—'} />)}
      </Section>

      <Section
        dot="bg-blue-500"
        title="In Progress"
        count={inProgress.length}
        empty={q ? `No matches in this section.` : 'Nothing currently in progress.'}
      >
        {inProgress.map(p => <InProgressRow key={p.id} project={p} isAdmin={isAdmin}
          editorName={editorNames[p.assigned_editor ?? ''] ?? p.assigned_editor ?? '—'} />)}
      </Section>

      <Section
        dot="bg-purple-500"
        title="Client Review"
        count={inReview.length}
        empty={q ? `No matches in this section.` : 'Nothing awaiting client review.'}
      >
        {inReview.map(p => <InProgressRow key={p.id} project={p} isAdmin={isAdmin}
          editorName={editorNames[p.assigned_editor ?? ''] ?? p.assigned_editor ?? '—'} />)}
      </Section>

      <Section
        dot="bg-green-500"
        title="Completed"
        count={completed.length}
        empty={q ? `No matches in this section.` : 'No completions in the last 30 days.'}
      >
        {completed.map(p => <CompletedRow key={p.id} project={p}
          editorName={editorNames[p.assigned_editor ?? ''] ?? p.assigned_editor ?? '—'} />)}
      </Section>
    </main>
  )
}

function Section({
  dot, title, count, empty, children
}: {
  dot: string; title: string; count: number; empty: string; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">{title}</h2>
        <span className="text-xs text-white/25">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-white/25 pl-4">{empty}</p>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
          {children}
        </div>
      )}
    </section>
  )
}

function isProjectOverdue(dueDate: string | null | undefined, status: string, onHold?: boolean): boolean {
  if (!dueDate || onHold) return false
  if (!['active', 'in_revision'].includes(status)) return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

function PendingRow({ project, isAdmin, editorName }: {
  project: Project; isAdmin: boolean; editorName: string
}) {
  const typeLabel = project.type === 'episode'
    ? 'Episode' : `Highlight #${project.highlight_number}`

  return (
    <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 sm:py-4 hover:bg-white/[0.03] transition-colors group">
      <Link href={`/projects/${project.id}`} className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <code className="hidden sm:block text-xs text-white/20 shrink-0 w-20 font-mono">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-white group-hover:text-white/90 truncate">
              {project.client_name || '—'}
            </span>
          </div>
          <div className="text-xs text-white/35 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{typeLabel}</span>
            {project.filming_date && <><span className="text-white/15">·</span>{formatDate(project.filming_date)}{project.filming_time ? ` · ${project.filming_time}` : ''}</>}
            <span className="text-white/15">·</span>
            <span className="font-medium text-white/60">{editorName}</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-3 sm:ml-4">
        {project.drive_link && (
          <a href={project.drive_link} target="_blank" rel="noreferrer"
            className="hidden sm:block text-xs text-white/30 hover:text-white/60 transition-colors"
          >Drive ↗</a>
        )}
        <TriggerButton projectId={project.id} isAdmin={isAdmin} />
      </div>
    </div>
  )
}

function CompletedRow({ project, editorName }: { project: Project; editorName: string }) {
  const completedVer = (project.versions ?? [])
    .sort((a: { version_number: number }, b: { version_number: number }) => b.version_number - a.version_number)
    .find((v: { done_date: string | null }) => v.done_date)

  const typeLabel = project.type === 'episode'
    ? 'Episode' : `Highlight #${project.highlight_number}`

  return (
    <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-white/[0.02] transition-colors group opacity-60 hover:opacity-80">
      <Link href={`/projects/${project.id}`} className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <code className="hidden sm:block text-xs text-white/20 shrink-0 w-20 font-mono">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-white group-hover:text-white/90 truncate">
              {project.client_name || '—'}
            </span>
            <span className="text-xs text-white/30">V{project.current_version}</span>
          </div>
          <div className="text-xs text-white/35 mt-0.5 flex items-center gap-1.5">
            <span>{typeLabel}</span>
            {completedVer?.done_date && <><span className="text-white/15">·</span>Done {formatDate(completedVer.done_date)}</>}
            <span className="text-white/15">·</span>
            <span className="font-medium text-white/60">{editorName}</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-3 shrink-0 ml-3 sm:ml-4">
        <UndoButton projectId={project.id} />
      </div>
    </div>
  )
}

function InProgressRow({ project, isAdmin, editorName }: {
  project: Project; isAdmin: boolean; editorName: string
}) {
  const currentVer = (project.versions ?? []).find(
    v => v.version_number === project.current_version
  )
  const overdue = isProjectOverdue(currentVer?.due_date, project.status, project.on_hold)

  return (
    <div className={`flex items-center justify-between px-3 sm:px-5 py-3.5 sm:py-4 hover:bg-white/[0.03] transition-colors group ${overdue ? 'border-l-2 border-l-red-500/70' : ''}`}>
      <Link href={`/projects/${project.id}`} className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <code className="hidden sm:block text-xs text-white/20 shrink-0 w-20 font-mono">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white group-hover:text-white/90 truncate">
              {project.client_name || '—'}
            </span>
            {project.status !== 'in_client_review' && (
              <StatusBadge status={project.status} />
            )}
            <span className="text-xs text-white/30">V{project.current_version}</span>
            {overdue && (
              <span className="text-xs font-semibold text-red-400">overdue</span>
            )}
          </div>
          <div className="text-xs text-white/35 mt-0.5">
            {project.type === 'episode' ? 'Episode' : `Highlight #${project.highlight_number}`}
            <span className="text-white/15 mx-1.5">·</span>
            <span className="font-medium text-white/60">{editorName}</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-3 sm:ml-4">
        {currentVer?.due_date && project.status !== 'in_client_review' && (
          <div className="hidden sm:block">
            <CountdownTimer
              dueDate={currentVer.due_date}
              onHold={project.on_hold}
              holdDate={project.hold_date}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
          {isAdmin && (project.status === 'active' || project.status === 'in_revision') && (
            <OnHoldButton projectId={project.id} onHold={project.on_hold} />
          )}
          {(project.status === 'active' || project.status === 'in_revision') && !project.on_hold && (
            <MarkDoneButton projectId={project.id} versionId={currentVer?.id} />
          )}
          {project.status === 'in_client_review' && (
            <>
              <CompleteButton projectId={project.id} />
              {isAdmin && (
                <StartRevisionButton projectId={project.id} currentVersion={project.current_version} />
              )}
              <UndoButton projectId={project.id} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
