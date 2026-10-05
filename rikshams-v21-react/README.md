# RikshaMS V21 React + Supabase

A separate V21 migration project based on the uploaded **RikshaMS Full V21 Advanced Notice Center** Index + Code.gs.

## Stack
React 19 + Vite + React Router + Supabase PostgreSQL/Auth/RLS + QR + Vercel.

## Implemented in this project
- V21 menu/layout/theme baseline
- Supabase Auth login
- Dashboard with real counts
- Leads CRUD with search/filter/sort/card-table
- New Order
- Orders stage workflow
- Dispatch queue + vehicle/driver/labour assignment
- Fleet & Crew: vehicles, drivers, labour, owners, partners
- Customers
- Slips: Order / Dispatch / Receipt generation
- Receive & Pay
- Day Book
- Accounts & Reports
- Direct Public Form
- User / Agent Access + login QR generation
- Notice Center CRUD
- Admin Settings
- Nepal timezone display
- PostgreSQL schema mirroring V21 fields
- RLS policies
- public/agent form data model
- profile notes + audit tables

## Setup
1. Create a Supabase project.
2. Run SQL files in order:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_security.sql`
   - `supabase/migrations/003_seed.sql`
3. In Supabase Auth create the first admin user. Use a 4-digit PIN as its password if you want the old V21 PIN-style login experience.
4. Create the matching profile:

```sql
insert into public.profiles(auth_user_id,profile_type,profile_id,display_name,role,active,permissions)
select id,'Admin','ADMIN','Administrator','Admin',true,'["*"]'::jsonb
from auth.users where email='YOUR_ADMIN_EMAIL';
```

5. Copy `.env.example` to `.env` and add your Supabase project URL and anon key.
6. Run:
```bash
npm install
npm run dev
npm run build
```

## Public form
Seed token: `DIRECT`
URL after deployment: `/public/DIRECT`

## Vercel
Set Root Directory to `rikshams-v21-react`, add the two Vite environment variables, then deploy.

## Current verification status
The project structure and migration logic are based directly on the uploaded V21 source. Live end-to-end testing still requires your Supabase URL/anon key and a Supabase project with the migrations applied.
