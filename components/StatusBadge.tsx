import { ProjectStatus } from '@/lib/types'

const config: Record<ProjectStatus, { label: string; className: string }> = {
  pending_trigger:  { label: 'Pending',         className: 'bg-white/10 text-white/50' },
  active:           { label: 'First Cut',         className: 'bg-blue-500/20 text-blue-300' },
  in_client_review: { label: 'Client Review',    className: 'bg-purple-500/20 text-purple-300' },
  in_revision:      { label: 'Revision',         className: 'bg-amber-500/20 text-amber-300' },
  complete:         { label: 'Complete',         className: 'bg-green-500/20 text-green-300' },
  cancelled:        { label: 'Cancelled',        className: 'bg-brand-red/20 text-brand-red' },
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, className } = config[status] ?? config.pending_trigger
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide ${className}`}>
      {label}
    </span>
  )
}
