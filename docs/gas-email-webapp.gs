/**
 * Poddster Post — Email relay Web App
 *
 * Deploy this INSIDE the sgproduction@poddster.com mailbox so mail sends from there.
 *
 * SETUP:
 *  1. Log in to Google as sgproduction@poddster.com
 *  2. script.google.com → New project → paste this file
 *  3. Set SHARED_SECRET below to a long random string (must match Vercel's GAS_EMAIL_SECRET)
 *  4. Deploy → New deployment → type "Web app"
 *       - Execute as: Me (sgproduction@poddster.com)
 *       - Who has access: Anyone
 *  5. Authorise when prompted (grant Gmail send permission)
 *  6. Copy the Web App URL → set it as GAS_EMAIL_WEBHOOK_URL in Vercel
 *
 * Re-deploy (Manage deployments → edit → new version) whenever you change this file.
 */

const SHARED_SECRET = 'CHANGE_ME_to_a_long_random_string';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SHARED_SECRET) {
      return json_({ error: 'unauthorized' });
    }
    if (!body.to || !body.subject) {
      return json_({ error: 'missing to/subject' });
    }

    GmailApp.sendEmail(body.to, body.subject, body.text || '', {
      htmlBody: body.html || body.text || '',
      name:     body.fromName || 'Poddster Post Production',
      // Optional: reply-to so editors can reply to the team
      replyTo:  body.replyTo || 'sgproduction@poddster.com',
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
