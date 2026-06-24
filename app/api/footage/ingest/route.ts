import { NextResponse } from 'next/server'

// Footage deliveries are now ingested directly from Google Calendar via
// /api/cron/footage-ingest. This GAS endpoint is no longer used.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is retired. Footage is ingested from the calendar cron.' },
    { status: 410 },
  )
}
