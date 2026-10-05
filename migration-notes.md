# RikshaMS Migration Notes

## Baseline rule
The approved RikshaMS business logic, page names, workflows, fields, card/table concepts, agent/public flow, notices, payments, slips and responsive behavior must be preserved.

## Migration strategy
1. Keep `main` as the current stable history.
2. Build the modern app on `react-migration`.
3. Audit the real legacy `index.html` and `Code.gs` when they are available.
4. Map every Apps Script server function before removing it.
5. Replace Google Sheets with relational Supabase PostgreSQL.
6. Replace Apps Script login/session logic with Supabase Auth + RLS.
7. Migrate modules progressively and test each phase.

## Code.gs mapping format
| Legacy function | Current purpose | Replacement | Status |
|---|---|---|---|
| pending audit | pending audit | pending audit | Not started |

## Module order
- Authentication and role/permission model
- Dashboard shell
- Customers / partners
- Vehicles / vehicle owners
- Drivers / labour
- Locations / fares
- Leads
- Orders
- Dispatch
- Jobs
- Receive & Pay
- Day Book
- Slips
- Agent system
- Public lead/referral + QR
- Notices
- Notes / timeline
- Reports / audit
- Realtime and performance tuning

## Important
No legacy feature should be marked migrated until its original behavior has been identified and its React/Supabase replacement is working.
