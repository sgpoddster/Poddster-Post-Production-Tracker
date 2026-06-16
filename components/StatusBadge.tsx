import { ProjectStatus } from '@/lib/types'

const config: Record<ProjectStatus, { label: string; className: string }> = {
  pending_trigger:  { label: 'Draft',         className: 'bg-th/[0.12] text-th/60' },
  active:           { label: 'First Cut',     className: 'bg-blue-500 text-white' },
  in_client_review: { label: 'Client Review', className: 'bg-purple-500 text-white' },
  in_revision:      { label: 'Revision',      className: 'bg-teal-400 text-white' },
  complete:         { label: 'Complete',      className: 'bg-green-500 text-white' },
  cancelled:        { label: 'Cancelled',     className: 'bg-brand-red text-white' },
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, className } = config[status] ?? config.pending_trigger
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide ${className}`}>
      {label}
    </span>
  )
}
