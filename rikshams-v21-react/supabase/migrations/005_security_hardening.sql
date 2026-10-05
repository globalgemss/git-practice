create schema if not exists private;

create or replace function private.current_profile_id()
returns uuid language sql stable security definer set search_path=public,private
as $$select id from public.profiles where auth_user_id=(select auth.uid()) and active=true limit 1$$;

create or replace function private.current_role()
returns text language sql stable security definer set search_path=public,private
as $$select role from public.profiles where auth_user_id=(select auth.uid()) and active=true limit 1$$;

create or replace function private.is_internal()
returns boolean language sql stable security definer set search_path=public,private
as $$select coalesce(private.current_role() in ('Admin','Manager','Staff'),false)$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.current_profile_id() from public, anon;
revoke all on function private.current_role() from public, anon;
revoke all on function private.is_internal() from public, anon;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_internal() to authenticated;

drop policy if exists profile_self on public.profiles;
create policy profile_self on public.profiles
for select to authenticated
using(auth_user_id=(select auth.uid()) or private.is_internal());

do $$ declare t text; begin
 foreach t in array array['customers','vehicle_owners','drivers','partners','vehicles','labourers','referral_partners','orders','transactions','slips','daybook_closings','rates','audit_logs'] loop
  execute format('drop policy if exists internal_all on public.%I',t);
  execute format('create policy internal_all on public.%I for all to authenticated using(private.is_internal()) with check(private.is_internal())',t);
 end loop;
end $$;

drop policy if exists lead_internal on public.leads;
create policy lead_internal on public.leads
for all to authenticated
using(private.is_internal() or created_by_profile_id=private.current_profile_id())
with check(private.is_internal() or created_by_profile_id=private.current_profile_id());

drop policy if exists notices_read_auth on public.notices;
drop policy if exists notices_internal_write on public.notices;
create policy notices_select_auth on public.notices
for select to authenticated using(archived=false);
create policy notices_insert_auth on public.notices
for insert to authenticated with check(private.is_internal() or owner_profile_id=private.current_profile_id());
create policy notices_update_auth on public.notices
for update to authenticated using(private.is_internal() or owner_profile_id=private.current_profile_id())
with check(private.is_internal() or owner_profile_id=private.current_profile_id());
create policy notices_delete_auth on public.notices
for delete to authenticated using(private.is_internal() or owner_profile_id=private.current_profile_id());

drop policy if exists public_forms_auth on public.public_forms;
create policy public_forms_auth on public.public_forms
for all to authenticated
using(private.is_internal() or owner_profile_id=private.current_profile_id())
with check(private.is_internal() or owner_profile_id=private.current_profile_id());

drop policy if exists profile_notes_access on public.profile_notes;
create policy profile_notes_access on public.profile_notes
for all to authenticated
using(private.is_internal() or author_profile_id=private.current_profile_id())
with check(private.is_internal() or author_profile_id=private.current_profile_id());

drop function if exists public.current_profile_id();
drop function if exists public.current_role();
drop function if exists public.is_internal();

create index if not exists idx_audit_logs_actor on public.audit_logs(actor_profile_id);
create index if not exists idx_daybook_verified_by on public.daybook_closings(verified_by);
create index if not exists idx_drivers_vehicle on public.drivers(vehicle_id);
create index if not exists idx_leads_created_by on public.leads(created_by_profile_id);
create index if not exists idx_notices_created_by on public.notices(created_by);
create index if not exists idx_notices_owner on public.notices(owner_profile_id);
create index if not exists idx_orders_driver on public.orders(driver_id);
create index if not exists idx_orders_partner on public.orders(partner_id);
create index if not exists idx_orders_source_lead on public.orders(source_lead_id);
create index if not exists idx_profile_notes_author on public.profile_notes(author_profile_id);
create index if not exists idx_public_forms_owner on public.public_forms(owner_profile_id);
create index if not exists idx_slips_created_by on public.slips(created_by);
create index if not exists idx_slips_order on public.slips(order_id);
create index if not exists idx_slips_transaction on public.slips(transaction_id);
create index if not exists idx_transactions_created_by on public.transactions(created_by);
create index if not exists idx_vehicles_default_driver on public.vehicles(default_driver_id);
create index if not exists idx_vehicles_owner on public.vehicles(owner_id);