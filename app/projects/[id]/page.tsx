import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDate, versionLabel, formatAssignee } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'
import StartRevisionButton from '@/app/dashboard/StartRevisionButton'
import TriggerButton from '@/app/dashboard/TriggerButton'
import AddOutputButton from './AddOutputButton'
import MarkDoneButton from '@/app/queue/MarkDoneButton'
import CompleteButton from '@/components/CompleteButton'
import UndoButton from '@/components/UndoButton'
import OnHoldButton from '@/components/OnHoldButton'
import EditProjectModal from './EditProjectModal'
import CancelButton from './CancelButton'
import DueDateEditor from './DueDateEditor'
import CopyFilenameButton from './CopyFilenameButton'
import CopyPortalLinkButton from './CopyPortalLinkButton'
import { getUserProfile } from '@/lib/auth'

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  const isAdmin = profile?.role === 'admin'

  const [
    { data: project },
    { data: profilesData },
    { data: clientsData },
  ] = await Promise.all([
    supabase.from('projects').select('*, versions(*)').eq('id', params.id).single(),
    supabase.from('user_profiles').select('email, display_name').order('display_name'),
    supabase.from('clients').select('id, name, code, portal_token').order('name'),
  ])

  if (!project) notFound()

  const editors = profilesData ?? []
  const clients = clientsData ?? []

  // Find this project's client record to get the portal token
  const clientRecord = clients.find(c => c.name === project.client_name)
  const portalToken = clientRecord?.portal_token ?? null

  // Build display name map
  const editorNames: Record<string, string> = {}
  for (const p of editors) {
    if (p.email) editorNames[p.email] = p.display_name || p.email
  }

  const versions = (project.versions ?? []).sort(
    (a: { version_number: number }, b: { version_number: number }) => a.version_number - b.version_number
  )
  const currentVer = versions.find((v: { version_number: number }) => v.version_number === project.current_version)

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

      {/* Back */}
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
        ← Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <code className="text-xs text-white/25 font-mono">{project.internal_id}</code>
            <StatusBadge status={project.status} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {project.client_name || 'Unnamed Project'}
          </h1>
          {project.client_code && (
            <span className="text-sm text-white/40 mt-0.5 block">{project.client_code}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex gap-2 flex-wrap justify-end">
          {isAdmin && portalToken && (
            <CopyPortalLinkButton portalToken={portalToken} />
          )}
          {isAdmin && (
            <EditProjectModal project={project} editors={editors} clients={clients} />
          )}
          <AddOutputButton jobId={project.job_id} />
          {project.status === 'pending_trigger' && (
            <TriggerButton projectId={project.id} isAdmin={isAdmin} />
          )}
          {(project.status === 'active' || project.status === 'in_revision') && !project.on_hold && (
            <MarkDoneButton projectId={project.id} versionId={currentVer?.id} />
          )}
          {isAdmin && (project.status === 'active' || project.status === 'in_revision') && (
            <OnHoldButton projectId={project.id} onHold={project.on_hold} holdReason={project.hold_reason} />
          )}
          {project.status === 'in_client_review' && (
            <>
              <CompleteButton projectId={project.id} />
              {isAdmin && <StartRevisionButton projectId={project.id} currentVersion={project.current_version} />}
              <UndoButton projectId={project.id} />
            </>
          )}
          {project.status === 'complete' && (
            <UndoButton projectId={project.id} />
          )}
          {isAdmin && project.status !== 'cancelled' && (
            <CancelButton projectId={project.id} />
          )}
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/[0.06] rounded-lg overflow-hidden">
        <MetaCell label="Type">
          {project.type === 'episode'
            ? 'Episode'
            : `Highlight #${project.highlight_number}`}
        </MetaCell>
        <MetaCell label="Filming Date">
          {project.filming_date ? formatDate(project.filming_date) : '—'}
          {project.filming_time ? ` · ${project.filming_time}` : ''}
        </MetaCell>
        <MetaCell label="Room">{project.setup || '—'}</MetaCell>
        {project.shoot_duration && (
          <MetaCell label="Duration">
            {project.shoot_duration === '1' ? '1 hour' : `${project.shoot_duration} hours`}
          </MetaCell>
        )}
        <MetaCell label="Producer">
          {formatAssignee(project.assigned_editor, project.editor, editorNames)}
        </MetaCell>
        {project.seats != null && (
          <MetaCell label="Seats">{project.seats}</MetaCell>
        )}
        <MetaCell label="Version">V{project.current_version}</MetaCell>
        {project.order_id && (
          <MetaCell label="Order ID">{project.order_id}</MetaCell>
        )}
        {project.drive_link && (
          <MetaCell label="Drive">
            <a href={project.drive_link} target="_blank" rel="noreferrer"
              className="text-brand-red hover:underline">
              Open folder ↗
            </a>
          </MetaCell>
        )}
        {project.services && (
          <MetaCell label="Services" wide>{project.services}</MetaCell>
        )}
      </div>

      {/* Version timeline */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">
            Version History
          </h2>
          {versions.length > 0 && (
            <CopyFilenameButton
              internalId={project.internal_id}
              filmingDate={project.filming_date}
              filmingTime={project.filming_time}
              versionNumber={project.current_version}
            />
          )}
        </div>
        {versions.length === 0 ? (
          <p className="text-sm text-white/25">No versions yet.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v: {
              id: string; version_number: number; label: string;
              submitted_date: string | null; due_date: string | null; done_date: string | null; notes: string | null
            }) => (
              <VersionRow
                key={v.id}
                version={v}
                isCurrent={v.version_number === project.current_version}
                projectId={project.id}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      {project.notes && (
        <section>
          <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-2">Notes</h2>
          <p className="text-sm text-white/60 bg-brand-surface rounded-lg px-4 py-3 border border-white/[0.06]">
            {project.notes}
          </p>
        </section>
      )}

    </main>
  )
}

function MetaCell({ label, children, wide }: {
  label: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className={`bg-brand-surface px-4 py-3 ${wide ? 'col-span-2 sm:col-span-3' : ''}`}>
      <div className="text-xs text-white/30 mb-0.5">{label}</div>
      <div className="text-sm text-white/80">{children}</div>
    </div>
  )
}

function VersionRow({ version, isCurrent, projectId, isAdmin }: {
  version: {
    id: string; version_number: number; label: string;
    submitted_date: string | null; due_date: string | null; done_date: string | null; notes: string | null
  }
  isCurrent: boolean
  projectId: string
  isAdmin: boolean
}) {
  const isComplete = !!version.done_date

  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors
      ${isCurrent
        ? 'bg-brand-surface border-white/10'
        : 'bg-transparent border-white/[0.04]'}`}
    >
      {/* Version dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${
        isComplete ? 'bg-green-400' : isCurrent ? 'bg-brand-red' : 'bg-white/15'
      }`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">
            {version.label || versionLabel(version.version_number)}
          </span>
          {isCurrent && !isComplete && (
            <span className="text-xs text-brand-red/70 font-medium">Current</span>
          )}
          {isComplete && (
            <span className="text-xs text-green-400/70">Delivered</span>
          )}
        </div>
        <div className="text-xs text-white/30 mt-0.5 flex items-center gap-3 flex-wrap">
          {version.submitted_date && (
            <span>Submitted {formatDate(version.submitted_date)}</span>
          )}
          {/* Due date: editable for admin on active versions */}
          {isAdmin && !isComplete ? (
            <DueDateEditor
              projectId={projectId}
              versionId={version.id}
              dueDate={version.due_date}
            />
          ) : (
            version.due_date && <span>Due {formatDate(version.due_date)}</span>
          )}
          {version.done_date && <span>Done {formatDate(version.done_date)}</span>}
        </div>
      </div>
    </div>
  )
}
