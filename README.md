# RikshaMS — React + Supabase

Production-base migration of the Transport + Labour Management application.

## Implemented
- Supabase Auth login/logout
- Dashboard counters from real database
- Leads CRUD
- Customers CRUD
- Orders + stage workflow
- Dispatch assignment
- Jobs workflow
- Vehicles / Drivers / Labour / Locations
- Receive / Pay / Expense
- Day Book
- Notices CRUD
- Order / Dispatch / Receipt print slips
- Public lead form
- Agent referral route
- PostgreSQL audit logging
- RLS baseline
- Responsive desktop/mobile layout

## Setup
1. Create a Supabase project.
2. Run:
   - supabase/migrations/001_initial_schema.sql
   - supabase/migrations/002_full_app.sql
3. Create an Auth user.
4. Create its profile + role.
5. Copy .env.example to .env and add:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
6. npm install
7. npm run dev
8. npm run build

## First admin
After creating an Auth user, run:

```sql
insert into public.profiles(id,full_name,role_id)
select u.id,'System Admin',r.id
from auth.users u cross join public.roles r
where u.email='YOUR_ADMIN_EMAIL' and r.code='super_admin'
on conflict(id) do update set role_id=excluded.role_id;
```

## Public links
Direct lead: /public/lead
Agent referral: /r/:slug

## Vercel
Import the GitHub repository, select the react-migration branch, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then deploy.

## Legacy audit status
The original production RikshaMS index.html and Code.gs were not present in this repository at migration start. This branch therefore implements the documented workflow as a functional React/Supabase production base. Exact one-to-one legacy UI/function verification still requires those original source files.
