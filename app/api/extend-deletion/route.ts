import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public route — no auth. Client clicks link in day-14 email.
// Grants a 7-day extension on all their in-review stage-2 projects.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return new NextResponse('Missing token', { status: 400 })

  const supabase = createServiceClient()

  // Look up client by portal_token
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, first_name')
    .eq('portal_token', token)
    .single()

  if (!client) return new NextResponse('Invalid token', { status: 404 })

  // Set deletion_hold_until = today + 7 on all their stage-2 in-review projects
  const holdUntil = new Date()
  holdUntil.setDate(holdUntil.getDate() + 7)
  const holdDate = holdUntil.toISOString().split('T')[0]

  const { count } = await supabase
    .from('projects')
    .update({ deletion_hold_until: holdDate })
    .eq('client_name', client.name)
    .eq('status', 'in_client_review')
    .eq('review_chase_stage', 2)

  const greeting = client.first_name ? `Hi ${client.first_name}` : 'Hi'
  const countLabel = count === 1 ? '1 project' : `${count ?? 'your'} projects`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Extension confirmed — Poddster</title>
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:480px;width:100%;margin:40px auto;padding:0 20px;">
    <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:40px;text-align:center;">
      <div style="font-size:40px;margin-bottom:16px;">✓</div>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;">${greeting} — you're all set</h1>
      <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.6;">
        We've extended the deadline for ${countLabel} by 7 days. Your files are safe — please download them before the new deadline.
      </p>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.3);">
        Questions? Just reply to the email — it reaches the Poddster production team.
      </p>
    </div>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
