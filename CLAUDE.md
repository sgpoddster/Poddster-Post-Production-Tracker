# CLAUDE.md — Poddster Post-Production App

## Mandatory rule: always update docs and push to GitHub

After **every** change — no matter how small — you must:

1. Update `docs/changelog.md` with the date, a short description of what changed, and why.
2. Update `docs/architecture.md` if any routes, components, database columns, env vars, or system flows changed.
3. Commit all changed files (including the docs) and push to `master`.
   - Vercel auto-deploys on push to master — there is no separate deploy step.

Do not wait until the end of a session. Update and push after each discrete change.

## Project Overview

Next.js 14 App Router application (TypeScript) for post-production project tracking at Poddster, a Singapore podcast studio. Backed by Supabase (Postgres) and deployed on Vercel.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router (server + client components) |
| Language | TypeScript |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Deployment | Vercel (auto-deploys from `master` branch) |
| External APIs | Frame.io v4 (Adobe IMS OAuth), GAS relay for email, Resend |

## Key directories

```
app/              Next.js routes and page components
app/api/          API route handlers (server-side)
components/       Shared UI components
lib/              Utility modules (supabase client, frameio-folders, utils, auth)
docs/             changelog.md + architecture.md — keep these up to date
```

## Frame.io API

- Uses **v4 API** with Adobe IMS OAuth (refresh token → access token via `ADOBE_CLIENT_SECRET` + `FRAMEIO_REFRESH_TOKEN`).
- Folder creation endpoint: `POST /v4/accounts/{accountId}/folders/{parentFolderId}/folders` with body `{ "data": { "name": "folderName" } }`.
- Folder URL format: `https://next.frame.io/project/{projectId}/view/{folderId}`.
- See `lib/frameio-folders.ts` for the full implementation.

## Environment variables (Vercel)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADOBE_CLIENT_SECRET`, `FRAMEIO_REFRESH_TOKEN`, `RESEND_API_KEY`, `CRON_SECRET`, `REVIEW_CHASE_LIVE`.

## Deployment

Push to `master` → Vercel builds and deploys automatically. No manual deploy step needed.
