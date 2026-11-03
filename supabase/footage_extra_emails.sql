-- Migration: extra footage recipients on footage_deliveries
-- `email` stays the booking's own email (from the calendar "Client email:" line).
-- `extra_emails` holds additional people the client wants footage sent to;
-- every footage email (4K, 1080p, reminder, deleted) goes to email + extra_emails.

ALTER TABLE footage_deliveries
  ADD COLUMN IF NOT EXISTS extra_emails text[] NOT NULL DEFAULT '{}';
