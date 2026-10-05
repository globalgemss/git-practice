# RikshaMS V21 Apps Script → React/Supabase Migration Map

Source baseline: **RikshaMS_Full_V21_Advanced_Notice_Center_Index.html + Code.gs**

## V21 modules preserved
Dashboard; Leads & Enquiries; New Order; Orders; Dispatch; Fleet & Crew; Customers; Slips; Receive & Pay; Day Book; Accounts & Reports; Direct Public Form; User / Agent Access; Notice Center; Admin Settings.

## Backend mapping
- `doGet` → Vite/React SPA + Vercel routing
- `setupRikshaMS`, `ensureBackend_`, `ensureSheet_` → SQL migrations
- `loginAdmin`, `loginUser`, `loginAccess_`, session functions → Supabase Auth + profiles + RLS
- `appLoad`, `buildDataFor_`, `readObjects_` → Supabase queries
- `saveModules`, `appSave`, `writeObjects_` → table CRUD/upsert
- Access functions → profiles + auth users
- Agent bootstrap/profile/public-form functions → profiles + public_forms + profile_notes
- Public form functions → public_forms + anonymous leads insert policy
- Notice functions → notices table + policies
- Rates functions → rates table
- Daybook closing → daybook_closings
- backup/restore → PostgreSQL/Supabase backup/export workflow
- `verifyAdminPin` → server-side role permission / re-auth flow
- `livePulse`, revision polling → Supabase Realtime subscriptions
- `audit_` → audit_logs + database triggers/edge logic

## Data compatibility
The SQL schema mirrors V21 field concepts, while converting Google Sheet JSON columns (timeline, followups, quote history, profile notes, slip snapshot) to JSONB and core entities to relational foreign keys.

## Migration principle
Do not remove a V21 behavior until its replacement is working. Exact V21 UI theme uses navy/blue variables, sidebar structure, responsive tables, bottom mobile navigation and modal behavior copied from the source baseline.
