-- Migration: add send_on_complete flag to footage_deliveries
-- Allows triggering conversion without auto-emailing the client.
-- Defaults true so existing behaviour is unchanged.

ALTER TABLE footage_deliveries
  ADD COLUMN IF NOT EXISTS send_on_complete boolean NOT NULL DEFAULT true;
