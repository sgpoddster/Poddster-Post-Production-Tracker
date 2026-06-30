-- Migration: add live transfer progress columns to pcm_recordings
-- Run in Supabase SQL editor

alter table pcm_recordings
  add column if not exists bytes_transferred bigint,
  add column if not exists transfer_speed    text,
  add column if not exists eta_seconds       integer;
