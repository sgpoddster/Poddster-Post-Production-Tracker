import { formatFullDate } from './utils'

// Email is sent via a Google Apps Script web app running in the
// sgproduction@poddster.com mailbox (GmailApp.sendEmail). No DNS/Resend needed.
async function sendViaGas(to: string, subject: string, html: string) {
  const url = process.env.GAS_EMAIL_WEBHOOK_URL
  const secret = process.env.GAS_EMAIL_SECRET
  if (!url) {
    console.warn('[email] GAS_EMAIL_WEBHOOK_URL not set — skipping')
    return
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, to, subject, html, fromName: 'Poddster Post Production' }),
    redirect: 'follow',
  })
  const text = await res.text()
  if (!res.ok || text.includes('"error"')) {
    console.error('[email] GAS relay error:', res.status, text.slice(0, 200))
  } else {
    console.log(`[email] sent to ${to}`)
  }
}

export async function sendAssignmentEmail({
  editorEmail,
  editorName,
  clientName,
  projectType,
  highlightNumber,
  filmingDate,
  dueDate,
  projectUrl,
}: {
  editorEmail: string
  editorName: string
  clientName: string
  projectType: 'episode' | 'highlight'
  highlightNumber?: number | null
  filmingDate: string | null
  dueDate: string
  projectUrl: string
}) {
  const typeLabel = projectType === 'episode' ? 'Episode' : `Highlight #${highlightNumber ?? ''}`
  const dueDateFormatted = formatFullDate(dueDate)
  const filmingFormatted = filmingDate ? formatFullDate(filmingDate) : null

  const firstName = editorName.split(' ')[0]

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New project assigned</title>
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">PODDSTER</span>
              <span style="font-size:14px;color:rgba(255,255,255,0.3);margin-left:8px;">Post Production</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:36px;">

              <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;">New assignment</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.2;">
                Hey ${firstName}!
              </h1>

              <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">
                You've got a new edit landing in your queue. Here's what you need to know:
              </p>

              <!-- Project details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:8px;padding:0;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">Client</span>
                    <span style="font-size:16px;font-weight:600;color:#ffffff;">${clientName}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">Type</span>
                    <span style="font-size:15px;color:rgba(255,255,255,0.8);">${typeLabel}</span>
                  </td>
                </tr>
                ${filmingFormatted ? `
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">Recorded</span>
                    <span style="font-size:15px;color:rgba(255,255,255,0.8);">${filmingFormatted}</span>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">First Cut Due</span>
                    <span style="font-size:16px;font-weight:700;color:#f87171;">${dueDateFormatted}</span>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <a href="${projectUrl}" style="display:inline-block;background:#e53e3e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
                View Project →
              </a>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.5;">
                You're receiving this because you've been assigned a project on Poddster Post Production.<br />
                <a href="${projectUrl}" style="color:rgba(255,255,255,0.3);">View in dashboard</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  try {
    await sendViaGas(editorEmail, `New edit: ${clientName} – ${typeLabel}`, html)
  } catch (e) {
    console.error('[email] unexpected error:', e)
  }
}

// ── Consolidated assignment email for a batch trigger (same Job ID) ──────────
export async function sendBatchAssignmentEmail({
  editorEmail,
  editorName,
  clientName,
  items,
  filmingDate,
  dueDate,
  projectUrl,
}: {
  editorEmail: string
  editorName: string
  clientName: string
  items: { type: 'episode' | 'highlight'; highlightNumber?: number | null }[]
  filmingDate: string | null
  dueDate: string
  projectUrl: string
}) {
  const firstName = editorName.split(' ')[0]
  const dueDateFormatted = formatFullDate(dueDate)
  const filmingFormatted = filmingDate ? formatFullDate(filmingDate) : null

  const epCount = items.filter(i => i.type === 'episode').length
  const hlCount = items.filter(i => i.type === 'highlight').length
  const parts: string[] = []
  if (epCount) parts.push(`${epCount} Episode${epCount > 1 ? 's' : ''}`)
  if (hlCount) parts.push(`${hlCount} Highlight${hlCount > 1 ? 's' : ''}`)
  const summary = parts.join(' + ')

  // One line per deliverable, in a tidy order
  const labels = [
    ...items.filter(i => i.type === 'episode').map(() => 'Episode'),
    ...items
      .filter(i => i.type === 'highlight')
      .sort((a, b) => (a.highlightNumber ?? 0) - (b.highlightNumber ?? 0))
      .map(i => `Highlight #${i.highlightNumber ?? ''}`),
  ]
  const deliverableRows = labels
    .map(l => `<span style="display:inline-block;background:rgba(255,255,255,0.06);border-radius:6px;padding:5px 12px;margin:0 6px 6px 0;font-size:14px;color:rgba(255,255,255,0.85);">${l}</span>`)
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 20px;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding-bottom:32px;">
        <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">PODDSTER</span>
        <span style="font-size:14px;color:rgba(255,255,255,0.3);margin-left:8px;">Post Production</span>
      </td></tr>
      <tr><td style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:36px;">
        <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;">New assignment</p>
        <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.2;">Hey ${firstName}!</h1>
        <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">
          A batch of edits just landed in your queue${summary ? ` — <strong style="color:#fff;">${summary}</strong>` : ''}. Here's what you need to know:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:28px;">
          <tr><td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">Client</span>
            <span style="font-size:16px;font-weight:600;color:#ffffff;">${clientName}</span>
          </td></tr>
          <tr><td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:8px;">Deliverables</span>
            ${deliverableRows}
          </td></tr>
          ${filmingFormatted ? `<tr><td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">Recorded</span>
            <span style="font-size:15px;color:rgba(255,255,255,0.8);">${filmingFormatted}</span>
          </td></tr>` : ''}
          <tr><td style="padding:16px 20px;">
            <span style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;display:block;margin-bottom:4px;">First Cut Due</span>
            <span style="font-size:16px;font-weight:700;color:#f87171;">${dueDateFormatted}</span>
          </td></tr>
        </table>
        <a href="${projectUrl}" style="display:inline-block;background:#e53e3e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">View Projects →</a>
      </td></tr>
      <tr><td style="padding-top:24px;">
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.5;">
          You're receiving this because you've been assigned work on Poddster Post Production.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  try {
    const subject = `New edits: ${clientName}${summary ? ` – ${summary}` : ''}`
    await sendViaGas(editorEmail, subject, html)
  } catch (e) {
    console.error('[email] unexpected error:', e)
  }
}
