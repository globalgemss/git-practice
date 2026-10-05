# RikshaMS V21 → React + Supabase Migration Checklist

| Feature | React Implemented | Database Connected | Responsive | Tested / QA | Status |
|---|---|---|---|---|---|
| Dashboard | Yes | Yes | Yes | Static + backend QA | Complete |
| Leads CRUD | Yes | Yes | Yes | Static + backend QA | Complete |
| Lead Detail Workspace | Yes | Yes | Yes | Static QA | Complete |
| Quote History | Yes | Yes (`lead_quotes`) | Yes | Static QA | Complete |
| Follow-up History | Yes | Yes (`lead_followups`) | Yes | Static QA | Complete |
| Lead Timeline | Yes | Yes (`lead_events`) | Yes | Static QA | Complete |
| Lead → Order | Yes | Yes | Yes | Static QA | Complete |
| New Order + Live Summary | Yes | Yes | Yes | Static QA | Complete |
| Orders List / Detail | Yes | Yes | Yes | Static QA | Complete |
| Order Timeline | Yes | Yes (`order_events`) | Yes | Static QA | Complete |
| Dispatch Queue | Yes | Yes | Yes | Static + RPC QA | Complete |
| Resource Assignment | Yes | Yes (`dispatches`, assignments) | Yes | RPC QA | Complete |
| In Transit Timer | Yes | Yes | Yes | Static QA | Complete |
| Vehicle availability lifecycle | Yes | Yes | Yes | RPC QA | Complete |
| Driver availability lifecycle | Yes | Yes | Yes | RPC QA | Complete |
| Labour availability lifecycle | Yes | Yes | Yes | RPC QA | Complete |
| Fleet & Crew | Yes | Yes | Yes | Static QA | Complete |
| Dynamic Vehicle Types | Yes | Yes | Yes | DB QA | Complete |
| Rate Master / Calculator | Yes | Yes | Yes | Static QA | Complete |
| Customers | Yes | Yes | Yes | Static QA | Complete |
| Profiles | Yes | Yes | Yes | Static QA | Complete |
| Notes & Timeline | Yes | Yes | Yes | Static QA | Complete |
| Documents / Storage | Yes | Yes | Yes | Schema QA | Complete |
| Receive & Pay | Yes | Yes | Yes | Static QA | Complete |
| Transaction Reversal | Yes | Yes | Yes | Static QA | Complete |
| Day Book | Yes | Yes | Yes | Static QA | Complete |
| Day Closing | Yes | Yes | Yes | Static QA | Complete |
| Order Slip | Yes | Yes | Yes | Static QA | Complete |
| Dispatch Slip | Yes | Yes | Yes | Static QA | Complete |
| Receipt per transaction | Yes | Yes | Yes | Logic QA | Complete |
| Slip View / Print | Yes | Yes | Yes | Static QA | Complete |
| Reports | Yes | Yes | Yes | Static QA | Complete |
| Supabase Auth | Yes | Yes | Yes | Live backend present | Complete |
| Roles / RLS | Yes | Yes | N/A | Security advisor reviewed | Complete |
| Agent Access / QR | Yes | Yes | Yes | Edge Function deployed | Complete |
| Agent hashed PIN / lockout | Yes | Yes | Yes | Edge Function deployed | Complete |
| Agent Portal | Yes | Yes | Yes | Static QA | Complete |
| Direct Public Form | Yes | Yes | Yes | Edge Function deployed | Complete |
| Agent Public Form | Yes | Yes | Yes | Edge Function deployed | Complete |
| Duplicate public lead guard | Yes | Yes | Yes | Edge Function deployed | Complete |
| Public rate limiting | Yes | Yes | N/A | Edge Function deployed | Complete |
| Advanced Notice Center | Yes | Yes | Yes | Static QA | Complete |
| Agent own-form notices | Yes | Yes | Yes | Static QA | Complete |
| Notice targeting / color / marquee | Yes | Yes | Yes | Static QA | Complete |
| Notice scheduling | Yes | Yes | Yes | Static QA | Complete |
| Audit History | Yes | Yes | Yes | DB triggers verified | Complete |
| Realtime | Yes | Yes | N/A | Publications verified | Complete |
| Mobile bottom nav | Yes | N/A | Yes | Static QA | Complete |
| Mobile bottom-sheet modals | Yes | N/A | Yes | CSS QA | Complete |
| Vercel SPA routing | Yes | N/A | Yes | Config QA | Complete |
| Production build | Source ready | N/A | N/A | Run `npm install && npm run build` in dev/Vercel | Ready |