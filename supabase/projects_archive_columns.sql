-- Migration: track day-21 auto-archive and raw-footage clean-up on projects
-- archived_at            — set when the review-chase day-21 pass archives the project
-- raw_footage_binned_at  — set when its raw-footage Drive folder has been moved to the bin
-- The daily review-chase run bins folders for archived projects once nothing
-- else using the same folder is still unfinished (covers siblings completed later by hand).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_footage_binned_at timestamptz;
