import { ProjectStatus } from '@/lib/types'

const config: Record<ProjectStatus, { label: string; className: string }> = {
  pending_trigger: { label: 'Pending',    className: 'bg-gray-100 text-gray-600' },
  active:          { label: 'Active',     className: 'bg-blue-100 text-blue-700' },
  delivered:       { label: 'Delivered',  className: 'bg-purple-100 text-purple-700' },
  in_revision:     { label: 'Revision',   className: 'bg-amber-100 text-amber-700' },
  complete:        { label: 'Complete',   className: 'bg-green-100 text-green-700' },
  cancelled:       { label: 'Cancelled',  className: 'bg-red-100 text-red-500' },
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, className } = config[status] ?? config.pending_trigger
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
