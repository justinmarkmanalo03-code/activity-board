# Activity Board

A Trello-style team monitoring board built with **Next.js (React) + Supabase**, deployable to **Vercel** in minutes.

Features: boards, lists, cards with drag-and-drop, assignees, priorities, due dates, file attachments, sharing with owner/manager/member roles, live presence indicators (green/grey dots), cross-user realtime updates, and an admin storage monitor.

## Stack

| Concern | What's used |
|---|---|
| Frontend | Next.js 15 App Router (React) |
| Auth | Supabase Auth (email + password) |
| Database | Supabase Postgres with Row Level Security |
| File uploads | Supabase Storage (avatars: public, attachments: private) |
| Presence | `last_seen` heartbeat + Realtime updates |
| Live sync | Supabase Realtime (postgres_changes) |
| Hosting | Vercel |

## Setup (local)

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema**: open Dashboard -> SQL Editor, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates all tables, RLS policies, storage buckets, triggers, and realtime wiring. It is idempotent (safe to re-run).
3. **Configure auth** (recommended): Dashboard -> Authentication -> Providers -> Email -> turn **off** "Confirm email" so new accounts sign in instantly. (Keep it on if you prefer email verification - the app shows a "check your email" notice.)
4. **Env vars**: copy `.env.example` to `.env.local` and fill in the values from Dashboard -> Settings -> API:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```
5. **Run it**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000, create an account, and start boarding.

> The **first user to register automatically becomes the admin** (the same trigger can promote others - see the bottom of `schema.sql`).

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: Add New -> Project -> import the repo (framework auto-detects **Next.js**, no build config needed).
3. Add the two environment variables above (Project -> Settings -> Environment Variables).
4. Deploy. Done - no server to manage.

## Behavior notes

- **Sign-in is by username + password only - no email needed** (matches the original app). Internally each username maps to an internal email address for Supabase Auth; the login form also accepts a real email if you ever migrate accounts.
- Because accounts have no real email, keep **"Confirm email" disabled** in Supabase (Authentication -> Providers -> Email) and note there is no email-based password reset - same as the original app.
- **Permission rules live in Postgres RLS**: owner > manager > member, managers can't remove managers, empty lists only deletable, cards deletable by creator or manager, attachment downloads gated per board.
- **Board changes sync live** across users (Realtime) - two people on the same board see each other's edits within a second.
- The admin monitor shows Supabase database + storage usage against the free-tier quotas (500 MB DB / 1 GB storage).

## Project layout

```
src/app/            Next.js App Router pages (login, register, dashboard, board/[id], profile, admin)
src/components/     Sidebar, modals, avatar, board UI (kanban, card modal, share modal)
src/lib/            Supabase client, shared types, formatting helpers, session/presence hooks
supabase/schema.sql Complete database setup - run once in the SQL editor
```
