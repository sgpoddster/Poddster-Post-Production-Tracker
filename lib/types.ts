export type ProjectStatus =
  | 'pending_trigger'
  | 'active'
  | 'in_client_review'
  | 'in_revision'
  | 'complete'
  | 'cancelled'

export type ProjectType = 'episode' | 'highlight'
export type ProjectSource = 'calendar' | 'manual' | 'force_push'

export interface Project {
  id: string
  job_id: string
  internal_id: string
  order_id: string | null
  client_name: string | null
  client_code: string | null
  assigned_producer: string | null
  assigned_editor: string | null   // the Producer (used for queue, filters, emails)
  editor: string | null            // the actual Editor (display only; defaults to producer)
  type: ProjectType
  highlight_number: number | null
  filming_date: string | null       // 'YYYY-MM-DD'
  filming_time: string | null       // e.g. '10:00 - 11:00'
  setup: string | null
  drive_link: string | null
  frameio_folder_link: string | null
  footage_ok: boolean
  shoot_duration: string | null
  seats: number | null
  services: string | null
  addons: string | null
  notes: string | null
  current_version: number
  status: ProjectStatus
  on_hold: boolean
  hold_date: string | null
  hold_reason: string | null
  review_chase_stage: number   // 0 none, 1 reminder sent, 2 final notice sent
  source: ProjectSource
  frame_asset_id: string | null
  created_at: string
  updated_at: string
  versions?: Version[]
}

export interface Version {
  id: string
  project_id: string
  version_number: number
  label: string
  submitted_date: string | null     // 'YYYY-MM-DD'
  due_date: string | null           // 'YYYY-MM-DD'
  done_date: string | null          // 'YYYY-MM-DD'
  notes: string | null
  frameio_link: string | null       // Frame.io player/review URL (set by webhook)
  frameio_uploaded_at: string | null // ISO timestamp from Frame.io (when file was uploaded)
  created_at: string
  updated_at: string
}

export interface FootageDelivery {
  id: string
  job_id: string
  order_id: string | null
  client_name: string | null
  client_code: string | null
  filming_date: string | null    // 'YYYY-MM-DD'
  filming_time: string | null
  setup: string | null
  services: string | null
  addons: string | null
  drive_link: string | null
  sent_at: string | null         // ISO timestamp
  expires_at: string | null      // 'YYYY-MM-DD'
  chase_stage: number
  source: string
  conversion_status: 'processing' | 'done' | 'error' | null
  converted_link: string | null  // link to "Smaller File Size 1080p" folder
  created_at: string
  updated_at: string
}

// Payload shape sent by GAS ingest script
export interface IngestPayload {
  jobId: string
  internalId: string
  orderId?: string
  clientName?: string
  clientCode?: string
  assignedProducer?: string
  assignedEditor?: string
  type?: ProjectType
  highlightNumber?: number
  filmingDate?: string
  filmingTime?: string
  setup?: string
  driveLink?: string
  services?: string
  addons?: string
}
