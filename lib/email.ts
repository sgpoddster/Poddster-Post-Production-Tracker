import { Resend } from 'resend'
import { formatFullDate } from './utils'

const resend = new Resend(process.env.RESEND_API_KEY)

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
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping')
    return
  }

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
                Hey ${firstName}! 🎬
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
    const { error } = await resend.emails.send({
      from: 'Poddster Post <notifications@poddster.com>',
      to: editorEmail,
      subject: `New edit: ${clientName} – ${typeLabel}`,
      html,
    })
    if (error) console.error('[email] send error:', error)
    else console.log(`[email] sent to ${editorEmail}`)
  } catch (e) {
    console.error('[email] unexpected error:', e)
  }
}
