-- Frame.io storage scan tables

CREATE TABLE IF NOT EXISTS frameio_scan_projects (
  project_id        text        PRIMARY KEY,
  project_name      text        NOT NULL,
  storage_bytes     bigint      NOT NULL DEFAULT 0,
  root_folder_id    text,
  updated_at_frameio timestamptz,
  created_at_frameio timestamptz,
  last_scanned_at   timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS frameio_scan_sessions (
  folder_id          text        PRIMARY KEY,
  project_id         text        NOT NULL REFERENCES frameio_scan_projects(project_id) ON DELETE CASCADE,
  folder_name        text        NOT NULL,
  created_at_frameio timestamptz,
  last_scanned_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS frameio_scan_sessions_project_id ON frameio_scan_sessions(project_id);
