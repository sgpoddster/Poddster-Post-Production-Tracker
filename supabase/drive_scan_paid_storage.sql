-- Add paid_storage flag to drive_scan_folders
-- Set true when a file with "delete" in the name exists anywhere in the client's folder tree
ALTER TABLE drive_scan_folders
  ADD COLUMN IF NOT EXISTS paid_storage boolean NOT NULL DEFAULT false;
