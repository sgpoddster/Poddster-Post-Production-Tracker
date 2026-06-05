import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Project, Version } from '@/lib/types'
import { formatDate, formatAssignee, addWorkDays, groupByJob, summarizeDeliverables } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import { CountdownTimer } from '@/components/CountdownTimer'
import { JobGroup } from '@/components/JobGroup'
import { getUserProfile } from '@/lib/auth'
import MarkDoneButton from './MarkDoneButton'
import OnHoldButton from '@/components/OnHoldButton'
import { ProducerFilter } from '@/app/dashboard/ProducerFilter'
import { DueFilter } from './DueFilter'
import { ClientFilter } from './ClientFilter'

export default async function QueuePage({
  searchParams,
}: {
  searchParams?: { editors?: string; due?: string; client?: string }
}) {
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
    supabase.from('user_profiles').select('email, display_name').order('display_name'),
  ])

  const editors = profilesData ?? []
  const editorNames: Record<string, string> = {}
  for (const p of editors) {
    if (p.email) editorNames[p.email] = p.display_name || p.email
  }

  // Producer filter (admin only) via ?editors=email1,email2
  const editorFilters = searchParams?.editors
    ? searchParams.editors.split(',').filter(Boolean)
    : []
  const matchesEditor = (p: Project) =>
    editorFilters.length === 0 || editorFilters.includes(p.assigned_editor ?? '')

  // Due-date window filter via ?due=0|1|2 (working days from today). Absent = all.
  const dueParam = searchParams?.due ?? 'all'
  const dueTargetStr = ['0', '1', '2'].includes(dueParam)
    ? addWorkDays(new Date(), Number(dueParam)).toISOString().split('T')[0]
    : null
  const dueDateOf = (p: Project) =>
    (p.versions ?? []).find((v: Version) => v.version_number === p.current_version)?.due_date ?? null
  const matchesDue = (p: Project) => {
    if (!dueTargetStr) return true
    const d = dueDateOf(p)
    return d != null && d <= dueTargetStr   // due on/before target (overdue included)
  }

  // Client filter via ?client=name1,name2
  const clientFilters = searchParams?.client
    ? searchParams.client.split(',').filter(Boolean)
    : []
  const matchesClient = (p: Project) =>
    clientFilters.length === 0 || clientFilters.includes(p.client_name ?? '')

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

  // Clients present in the queue (respect the producer + due filters so the
  // client list reflects what's actually showing), for the client dropdown.
  const clientPool = (projects ?? []).filter(p => matchesEditor(p) && matchesDue(p))
  const clientsInQueue = Array.from(
    new Set(clientPool.map(p => p.client_name).filter((n): n is string => !!n))
  ).sort((a, b) => a.localeCompare(b))

  const sorted = (projects ?? [])
    .filter(p => matchesEditor(p) && matchesDue(p) && matchesClient(p))
    .slice()
    .sort((a, b) => daysRemaining(a) - daysRemaining(b))


  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
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
        </div>

        {/* Due-window toggle (left) + client & producer filters (right) */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <DueFilter selected={dueParam} />
          <div className="flex items-center gap-2">
            <ClientFilter clients={clientsInQueue} selected={clientFilters} />
            {isAdmin && editors.length > 0 && (
              <ProducerFilter editors={editors} selected={editorFilters} />
            )}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/25 text-sm">No active projects right now.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
          {groupByJob(sorted).map(group =>
            group.length === 1 ? (
              <QueueRow key={group[0].id} project={group[0]} isAdmin={isAdmin}
                editorName={formatAssignee(group[0].assigned_editor, group[0].editor, editorNames)} />
            ) : (
              <JobGroup key={group[0].job_id}
                header={<QueueGroupHeader group={group} editorNames={editorNames} />}>
                {group.map(p => (
                  <QueueRow key={p.id} project={p} isAdmin={isAdmin}
                    editorName={formatAssignee(p.assigned_editor, p.editor, editorNames)} />
                ))}
              </JobGroup>
            )
          )}
        </div>
      )}
    </main>
  )
}

function QueueGroupHeader({ group, editorNames }: {
  group: Project[]; editorNames: Record<string, string>
}) {
  const first = group[0]
  const currentVer = (first.versions ?? []).find(v => v.version_number === first.current_version)
  return (
    // Same 4-column structure as QueueRow: [code w-20] [client flex-1] [countdown] [actions w-36]
    // The JobGroup chevron acts as the spacer, so no extra spacer needed here.
    <div className="flex items-center gap-4 w-full">
      <code className="hidden sm:block text-sm text-white/45 shrink-0 w-20 font-mono">{first.job_id}</code>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-white truncate block">{first.client_name || '—'}</span>
        <div className="text-xs text-white/35 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{summarizeDeliverables(group)}</span>
          {first.filming_date && <><span className="text-white/15">·</span>Filmed {formatDate(first.filming_date)}</>}
          <span className="text-white/15">·</span>
          <span className="font-medium text-white/60">{formatAssignee(first.assigned_editor, first.editor, editorNames)}</span>
        </div>
      </div>
      <div className="hidden sm:flex shrink-0">
        {currentVer?.due_date && (
          <CountdownTimer dueDate={currentVer.due_date} onHold={first.on_hold} holdDate={first.hold_date} />
        )}
      </div>
      <div className="flex items-center justify-end shrink-0 w-36">
        <span className="text-[10px] text-white/35 bg-white/[0.06] px-2 py-0.5 rounded-full whitespace-nowrap">{group.length} items</span>
      </div>
    </div>
  )
}

function QueueRow({ project, isAdmin, editorName }: {
  project: Project; isAdmin: boolean; editorName: string
}) {
  const currentVer: Version | undefined = (project.versions ?? []).find(
    v => v.version_number === project.current_version
  )

  return (
    // 4-column structure: [spacer w-3] [client flex-1] [countdown] [actions w-36]
    // Spacer matches the JobGroup chevron so client names stay in the same column.
    <div className="flex items-center px-3 sm:px-5 py-3.5 sm:py-4 hover:bg-white/[0.03] transition-colors group gap-3 sm:gap-4">
      <span className="hidden sm:block w-3 shrink-0" />
      <Link href={`/projects/${project.id}`} className="flex items-center gap-4 min-w-0 flex-1">
        <code className="hidden sm:block text-sm text-white/45 shrink-0 w-20 font-mono">{project.internal_id}</code>
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

      <div className="hidden sm:flex shrink-0">
        {currentVer?.due_date && (
          <CountdownTimer
            dueDate={currentVer.due_date}
            onHold={project.on_hold}
            holdDate={project.hold_date}
          />
        )}
      </div>

      <div className="flex items-center gap-2 justify-end shrink-0 w-36">
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
  )
}
