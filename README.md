# Poddster Post Production Tracking

Internal post-production project tracking app. Replaces the Google Sheets tracker.

## Stack
- **Next.js 14** (App Router, TypeScript)
- **Supabase** — Postgres database + Google OAuth
- **Tailwind CSS**
- **Vercel** — hosting

---

## Setup (one-time)

### 1. Create Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Paste the contents of `supabase/schema.sql` into the SQL Editor and run it

### 2. Enable Google OAuth in Supabase
1. Supabase Dashboard → Authentication → Providers → Google → Enable
2. Create a Google OAuth app at [console.cloud.google.com](https://console.cloud.google.com)
   - Authorised redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`
3. Paste the Client ID + Secret back into Supabase

### 3. Configure environment variables
```bash
cp .env.local.example .env.local
# Fill in the values
```

### 4. Install and run
```bash
npm install
npm run dev
# Open http://localhost:3000
```

### 5. Deploy to Vercel
```bash
# Push to GitHub, then import the repo in vercel.com
# Add the same env vars in Vercel project settings
# Add your Vercel URL to Supabase → Authentication → URL Configuration → Site URL
```

---

## How it works

### Workflow
```
Calendar booking → GAS script → POST /api/bookings/ingest → pending_trigger
                                                                    ↓
                                                    AM clicks "Trigger" → active
                                                                    ↓
                                                    Editor sees in queue
                                                                    ↓
                                              Editor clicks "Done" → delivered
                                                                    ↓
                                                   AM clicks "Start V2" → in_revision
                                                                    ↓
                                                              ... repeats ...
                                                                    ↓
                                                                complete
```

### GAS ingest (add to Code.gs)
When the sync runs, add a call to POST your app URL:
```javascript
var APP_INGEST_URL = 'https://your-app.vercel.app/api/bookings/ingest'
var INGEST_API_KEY = 'your-secret-key'  // matches INGEST_API_KEY in .env.local

UrlFetchApp.fetch(APP_INGEST_URL, {
  method: 'post',
  contentType: 'application/json',
  headers: { 'x-api-key': INGEST_API_KEY },
  payload: JSON.stringify({
    jobId: jobId,
    internalId: internalId,
    orderId: orderId,
    clientName: clientName,
    // ... other fields
  }),
  muteHttpExceptions: true
})
```

---

## Pages

| Route | Who | Purpose |
|---|---|---|
| `/dashboard` | AM / Producer | Pending trigger queue + in-progress overview |
| `/queue` | Editor | Active projects with countdown timers |
| `/login` | Everyone | Google sign-in |

## API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/bookings/ingest` | POST | GAS bridge — create/update project from calendar |
| `/api/projects/[id]/trigger` | POST | AM starts a project (pending → active) |
| `/api/projects/[id]/revision` | POST | AM starts next revision (delivered → in_revision) |
| `/api/projects/[id]/version/done` | POST | Editor marks version complete |
