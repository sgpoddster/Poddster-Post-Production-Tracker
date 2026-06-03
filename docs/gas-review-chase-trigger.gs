/**
 * Poddster Post — daily "review chase" trigger.
 *
 * Calls the app's chase endpoint once a day. The app does all the work
 * (finds clients sitting in Client Review for 7 / 14 days, emails them).
 *
 * SETUP:
 *  1. script.google.com → New project (any Poddster Google account is fine)
 *  2. Paste this file
 *  3. Set INGEST_API_KEY below to match the app's INGEST_API_KEY env var
 *  4. Run dailyReviewChase once manually to authorise + test
 *  5. Triggers (clock icon) → Add Trigger:
 *       function: dailyReviewChase · event source: Time-driven ·
 *       Day timer · pick a time (e.g. 9–10am)
 */

const APP_BASE = 'https://poddster-post-production-tracker.vercel.app';
const INGEST_API_KEY = 'CHANGE_ME_to_match_app_INGEST_API_KEY';

function dailyReviewChase() {
  const url = APP_BASE + '/api/cron/review-chase?key=' + encodeURIComponent(INGEST_API_KEY);
  const res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
  Logger.log('review-chase: ' + res.getResponseCode() + ' ' + res.getContentText());
}
