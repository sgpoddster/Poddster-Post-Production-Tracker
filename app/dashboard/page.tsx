import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Project } from '@/lib/types'
import { formatDate, formatDateShort, formatTimeSGT, formatAssignee, groupByJob, summarizeDeliverables } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import { CountdownTimer } from '@/components/CountdownTimer'
import { JobGroup } from '@/components/JobGroup'
import { getUserProfile } from '@/lib/auth'
import StartRevisionButton from './StartRevisionButton'
import NewProjectButton from './NewProjectButton'
import { SearchBar } from './SearchBar'
import { ProducerFilter } from './ProducerFilter'
import { ClientFilter } from '../queue/ClientFilter'
import { CollapsibleSection } from './CollapsibleSection'
import PendingTriggerList from './PendingTriggerList'
import MarkDoneButton from '../queue/MarkDoneButton'
import CompleteButton from '@/components/CompleteButton'
import UndoButton from '@/components/UndoButton'
import OnHoldButton from '@/components/OnHoldButton'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { q?: string; editors?: string; client?: string }
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
  const clientFilters = searchParams?.client
    ? searchParams.client.split(',').filter(Boolean)
    : []
  const matchesClient = (p: Project) =>
    clientFilters.length === 0 || clientFilters.includes(p.client_name ?? '')

  const allProjects = projects ?? []

  // Clients present across the dashboard (respecting search + producer filter), for the dropdown
  const clientPool = [...allProjects, ...(completedProjects ?? [])].filter(p => matchesSearch(p) && matchesEditor(p))
  const clientsInDashboard = Array.from(
    new Set(clientPool.map(p => p.client_name).filter((n): n is string => !!n))
  ).sort((a, b) => a.localeCompare(b))

  const filter = (p: Project) => matchesSearch(p) && matchesEditor(p) && matchesClient(p)
  const pending    = allProjects.filter(p => p.status === 'pending_trigger').filter(filter)
  const inProgress = allProjects.filter(p => ['active', 'in_revision'].includes(p.status)).filter(filter)
  const inReview   = allProjects.filter(p => p.status === 'in_client_review').filter(filter)
  const completed  = (completedProjects ?? []).filter(filter)

  const totalShown = pending.length + inProgress.length + inReview.length + completed.length

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10">
      <div className="flex flex-col gap-3">
        {/* Row 1: title + new project button */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-th tracking-tight">
            {isAdmin ? 'Dashboard' : 'My Dashboard'}
          </h1>
          <NewProjectButton clients={clients} editors={editors} currentUserEmail={user.email ?? ''} />
        </div>
        {/* Row 2: search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <SearchBar defaultValue={searchParams?.q} />
          </div>
          <ClientFilter clients={clientsInDashboard} selected={clientFilters} />
          {isAdmin && editors.length > 0 && (
            <ProducerFilter editors={editors} selected={editorFilters} />
          )}
        </div>
      </div>

      {q && totalShown === 0 && (
        <p className="text-sm text-th/30 text-center py-8">No projects match &ldquo;{q}&rdquo;</p>
      )}

      <CollapsibleSection dot="bg-amber-500" title="Draft" count={pending.length} storageKey="draft" noContainer empty="">
        <PendingTriggerList
          isAdmin={isAdmin}
          emptyText={q ? 'No matches in this section.' : 'No drafts yet.'}
          items={pending.map(p => ({
            id: p.id,
            job_id: p.job_id,
            internal_id: p.internal_id,
            client_name: p.client_name,
            type: p.type,
            highlight_number: p.highlight_number,
            filming_date: p.filming_date,
            filming_time: p.filming_time,
            drive_link: p.drive_link,
            editorName: formatAssignee(p.assigned_editor, p.editor, editorNames),
          }))}
        />
      </CollapsibleSection>

      <CollapsibleSection
        dot="bg-blue-500" title="In Progress" count={inProgress.length} storageKey="in-progress"
        empty={q ? 'No matches in this section.' : 'Nothing currently in progress.'}
      >
        {groupByJob(inProgress).map(group =>
          group.length === 1 ? (
            <InProgressRow key={group[0].id} project={group[0]} isAdmin={isAdmin}
              editorName={formatAssignee(group[0].assigned_editor, group[0].editor, editorNames)} />
          ) : (
            <JobGroup key={group[0].job_id}
              header={<DashGroupHeader group={group} editorNames={editorNames} withCountdown />}>
              {group.map(p => <InProgressRow key={p.id} project={p} isAdmin={isAdmin}
                editorName={formatAssignee(p.assigned_editor, p.editor, editorNames)} />)}
            </JobGroup>
          )
        )}
      </CollapsibleSection>

      <CollapsibleSection
        dot="bg-purple-500" title="Client Review" count={inReview.length} storageKey="client-review"
        empty={q ? 'No matches in this section.' : 'Nothing awaiting client review.'}
      >
        {groupByJob(inReview).map(group =>
          group.length === 1 ? (
            <InProgressRow key={group[0].id} project={group[0]} isAdmin={isAdmin}
              editorName={formatAssignee(group[0].assigned_editor, group[0].editor, editorNames)} />
          ) : (
            <JobGroup key={group[0].job_id}
              header={<DashGroupHeader group={group} editorNames={editorNames} />}>
              {group.map(p => <InProgressRow key={p.id} project={p} isAdmin={isAdmin}
                editorName={formatAssignee(p.assigned_editor, p.editor, editorNames)} />)}
            </JobGroup>
          )
        )}
      </CollapsibleSection>

      <CollapsibleSection
        dot="bg-green-500" title="Completed" count={completed.length} storageKey="completed"
        empty={q ? 'No matches in this section.' : 'No completions in the last 30 days.'}
      >
        {groupByJob(completed).map(group =>
          group.length === 1 ? (
            <CompletedRow key={group[0].id} project={group[0]}
              editorName={formatAssignee(group[0].assigned_editor, group[0].editor, editorNames)} />
          ) : (
            <JobGroup key={group[0].job_id}
              header={<DashGroupHeader group={group} editorNames={editorNames} />}>
              {group.map(p => <CompletedRow key={p.id} project={p}
                editorName={formatAssignee(p.assigned_editor, p.editor, editorNames)} />)}
            </JobGroup>
          )
        )}
      </CollapsibleSection>
    </main>
  )
}

function isProjectOverdue(dueDate: string | null | undefined, status: string, onHold?: boolean): boolean {
  if (!dueDate || onHold) return false
  if (!['active', 'in_revision'].includes(status)) return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

function DashGroupHeader({ group, editorNames, withCountdown }: {
  group: Project[]; editorNames: Record<string, string>; withCountdown?: boolean
}) {
  const first = group[0]
  const currentVer = (first.versions ?? []).find(v => v.version_number === first.current_version)
  return (
    // Same 4-column structure as InProgressRow: [code w-20] [client flex-1] [countdown] [actions w-52]
    // The JobGroup chevron acts as the spacer — no extra spacer needed here.
    <div className="flex items-center gap-4 w-full">
      <code className="hidden sm:block text-sm text-th/45 shrink-0 w-20 font-mono">{first.job_id}</code>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-th truncate block">{first.client_name || '—'}</span>
        <div className="text-xs text-th/35 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{summarizeDeliverables(group)}</span>
          {first.filming_date && <><span className="text-th/15">·</span>{formatDate(first.filming_date)}</>}
          <span className="text-th/15">·</span>
          <span className="font-medium text-th/60">{formatAssignee(first.assigned_editor, first.editor, editorNames)}</span>
        </div>
      </div>
      <div className="hidden sm:flex shrink-0">
        {withCountdown && currentVer?.due_date && (
          <CountdownTimer dueDate={currentVer.due_date} onHold={first.on_hold} holdDate={first.hold_date} />
        )}
      </div>
      <div className="flex items-center justify-end shrink-0 w-64">
        <span className="text-[10px] text-th/35 bg-th/[0.06] px-2 py-0.5 rounded-full whitespace-nowrap">{group.length} items</span>
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
    <div className="flex items-center px-3 sm:px-5 py-3 sm:py-3.5 gap-3 sm:gap-4 hover:bg-th/[0.02] transition-colors group opacity-60 hover:opacity-80">
      <span className="hidden sm:block w-3 shrink-0" />
      <Link href={`/projects/${project.id}`} className="flex items-center gap-4 min-w-0 flex-1">
        <code className="hidden sm:block text-sm text-th/45 shrink-0 w-20 font-mono">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-medium text-th group-hover:text-th/90 truncate">
              {project.client_name || '—'}
            </span>
            {project.filming_date && (
              <span className="text-xs text-th/40">
                {formatDate(project.filming_date)}
                {project.filming_time && <span className="ml-1">{project.filming_time.split(' - ')[0]}</span>}
              </span>
            )}
            <span className="text-xs text-th/30">V{project.current_version}</span>
          </div>
          <div className="text-xs text-th/35 mt-0.5 flex items-center gap-1.5">
            <span>{typeLabel}</span>
            {completedVer?.done_date && <><span className="text-th/15">·</span>Done {formatDate(completedVer.done_date)}</>}
            <span className="text-th/15">·</span>
            <span className="font-medium text-th/60">{editorName}</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-end shrink-0 w-64">
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
    // 4-column structure: [spacer w-3] [client flex-1] [countdown] [actions w-52]
    // Spacer matches the JobGroup chevron so client names stay in the same column.
    <div className={`flex items-center px-3 sm:px-5 py-3.5 sm:py-4 gap-3 sm:gap-4 hover:bg-th/[0.03] transition-colors group ${overdue ? 'border-l-2 border-l-red-500/70' : ''}`}>
      <span className="hidden sm:block w-3 shrink-0" />
      <Link href={`/projects/${project.id}`} className="flex items-center gap-4 min-w-0 flex-1">
        <code className="hidden sm:block text-sm text-th/45 shrink-0 w-20 font-mono">{project.internal_id}</code>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-th group-hover:text-th/90 truncate">
              {project.client_name || '—'}
            </span>
            {project.filming_date && (
              <span className="text-xs text-th/40">
                {formatDate(project.filming_date)}
                {project.filming_time && <span className="ml-1">{project.filming_time.split(' - ')[0]}</span>}
              </span>
            )}
            {project.status !== 'in_client_review' && (
              <StatusBadge status={project.status} />
            )}
            <span className="text-xs text-th/30">V{project.current_version}</span>
            {overdue && (
              <span className="text-xs font-semibold text-red-400">overdue</span>
            )}
          </div>
          <div className="text-xs text-th/35 mt-0.5">
            {project.type === 'episode' ? 'Episode' : `Highlight #${project.highlight_number}`}
            <span className="text-th/15 mx-1.5">·</span>
            <span className="font-medium text-th/60">{editorName}</span>
          </div>
        </div>
      </Link>

      <div className="hidden sm:flex shrink-0">
        {currentVer?.due_date && project.status !== 'in_client_review' && (
          <CountdownTimer
            dueDate={currentVer.due_date}
            onHold={project.on_hold}
            holdDate={project.hold_date}
          />
        )}
        {project.status === 'in_client_review' && (
          <div className="flex items-start gap-6">
            {currentVer?.done_date && (
              <div className="w-40">
                <p className="text-[11px] text-th/30 uppercase tracking-wider mb-0.5">Delivered</p>
                <p className="text-sm font-medium text-th/65">
                  {formatDateShort(currentVer.done_date)}
                  {currentVer.updated_at && (
                    <span className="text-th/40 ml-1.5">{formatTimeSGT(currentVer.updated_at)}</span>
                  )}
                </p>
              </div>
            )}
            {currentVer?.due_date && (
              <div className="w-24">
                <p className="text-[11px] text-th/30 uppercase tracking-wider mb-0.5">Due</p>
                <p className="text-sm font-medium text-th/65">{formatDateShort(currentVer.due_date)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 justify-end shrink-0 w-64">
        {isAdmin && (project.status === 'active' || project.status === 'in_revision') && (
          <OnHoldButton projectId={project.id} onHold={project.on_hold} holdReason={project.hold_reason} />
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
  )
}
