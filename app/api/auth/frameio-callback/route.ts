import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Temporary one-shot endpoint: captures the Adobe IMS auth code, exchanges it
// for tokens, stores the refresh token in app_config, then shows a success page.
// Delete this file once the refresh token is stored.

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const REDIRECT_URI    = 'https://poddster-post-production-tracker.vercel.app/api/auth/frameio-callback'

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const code   = params.get('code')
  const error  = params.get('error')

  if (error) {
    return new NextResponse(`<html><body style="font-family:monospace;padding:2rem">
      <h2 style="color:red">Adobe returned an error</h2>
      <pre>${error}: ${params.get('error_description') ?? ''}</pre>
    </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  if (!code) {
    return new NextResponse(`<html><body style="font-family:monospace;padding:2rem">
      <h2 style="color:orange">No code received</h2>
      <p>Query params: ${req.url}</p>
    </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  const clientSecret = process.env.ADOBE_CLIENT_SECRET
  if (!clientSecret) {
    return new NextResponse('ADOBE_CLIENT_SECRET not set in Vercel env', { status: 500 })
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     ADOBE_CLIENT_ID,
      client_secret: clientSecret,
      code,
      redirect_uri:  REDIRECT_URI,
    }),
  })

  const json = await tokenRes.json()

  if (!tokenRes.ok || !json.refresh_token) {
    return new NextResponse(`<html><body style="font-family:monospace;padding:2rem">
      <h2 style="color:red">Token exchange failed</h2>
      <pre>${JSON.stringify(json, null, 2)}</pre>
    </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  // Store new refresh token in Supabase
  const supabase = createServiceClient()
  await supabase.from('app_config').upsert(
    { key: 'adobe_refresh_token', value: json.refresh_token, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )

  return new NextResponse(`<html><body style="font-family:monospace;padding:2rem;background:#111;color:#eee">
    <h2 style="color:#4ade80">✓ Frame.io refresh token stored successfully</h2>
    <p>The new refresh token has been saved to Supabase app_config.</p>
    <p>Frame.io webhooks should now work again.</p>
    <p style="color:#888;margin-top:2rem">You can close this tab.</p>
  </body></html>`, { headers: { 'Content-Type': 'text/html' } })
}
