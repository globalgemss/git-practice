# RikshaMS — React + Supabase Final Migration

RikshaMS is the migrated production web application for Transport + Labour Management.

## Architecture

- Frontend: React 18 + Vite + React Router
- Backend: Supabase PostgreSQL
- Auth: Supabase Auth + RLS
- Realtime: Leads, Orders, Dispatch, Notices, Transactions, Fleet availability
- Secure server actions: Supabase Edge Functions
- Files: private Supabase Storage bucket `rikshams-documents`
- Deployment: Vercel
- Business timezone: Asia/Kathmandu

The original Google Apps Script V21 application is included in `reference/` and remains the visual/workflow master reference.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never put a Supabase service-role/secret key in Vite/browser environment variables.

## Main modules

Dashboard, Leads & Enquiries, New Order, Orders, Dispatch, Fleet & Crew, Vehicles, Drivers, Labour, Vehicle Owners, Partners, Rate Master, Customers, Slips, Receive & Pay, Day Book, Accounts & Reports, Direct Public Form, User / Agent Access, Advanced Notice Center, Profiles, Notes/Timeline, Audit History and Admin Settings.

## Important workflow rules

Lead lifecycle: `New Enquiry → Quoted → Confirmed → Converted`. Follow-up is an activity/history item, not a required lifecycle stage.

Order lifecycle: `New → Assigned → Dispatched → In Transit → Delivered → Completed`, with `Cancelled` supported. Assignment and stage changes use database RPCs so vehicle/driver/labour availability and timeline changes remain atomic.

## Public and agent routes

- Direct/agent public form: `/public/:token`
- Agent PIN login: `/agent-login/:token`
- Agent workspace: `/agent`

Agent PIN validation is performed server-side with hashed PIN storage, failed-attempt tracking and 15-minute lockout after repeated failures.

## Supabase

Migrations are in `supabase/migrations/`.
Edge Functions are in `supabase/functions/`.

Applied production migrations include core schema, RLS/security, Realtime/audit, vehicle types, dispatch normalization, private storage, role hardening, numeric data normalization with migration issue logging and public-form lockdown.

## Deployment

1. Push this folder to GitHub.
2. Import repository into Vercel.
3. Add the two `VITE_SUPABASE_*` environment variables.
4. Deploy.
5. Add custom domain when ready.

`vercel.json` includes SPA rewrites so React Router deep links work.

## Security note

Supabase Security Advisor may still report the two intentional authenticated `SECURITY DEFINER` operational RPCs. They explicitly validate the caller role before performing atomic workflow changes. Enable **Leaked Password Protection** in Supabase Auth settings before public production launch.