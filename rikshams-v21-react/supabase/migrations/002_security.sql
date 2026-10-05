create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path=public as $$select id from public.profiles where auth_user_id=auth.uid() and active=true limit 1$$;
create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$select role from public.profiles where auth_user_id=auth.uid() and active=true limit 1$$;
create or replace function public.is_internal() returns boolean language sql stable security definer set search_path=public as $$select coalesce(public.current_role() in ('Admin','Manager','Staff'),false)$$;

do $$ declare t text; begin foreach t in array array['profiles','leads','customers','vehicle_owners','drivers','partners','vehicles','labourers','referral_partners','orders','transactions','slips','daybook_closings','notices','rates','public_forms','profile_notes','audit_logs'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

drop policy if exists profile_self on public.profiles;
create policy profile_self on public.profiles for select to authenticated using(auth_user_id=auth.uid() or public.is_internal());

do $$ declare t text; begin foreach t in array array['customers','vehicle_owners','drivers','partners','vehicles','labourers','referral_partners','orders','transactions','slips','daybook_closings','rates','audit_logs'] loop
 execute format('drop policy if exists internal_all on public.%I',t);
 execute format('create policy internal_all on public.%I for all to authenticated using(public.is_internal()) with check(public.is_internal())',t);
end loop; end $$;

drop policy if exists lead_internal on public.leads;
create policy lead_internal on public.leads for all to authenticated using(public.is_internal() or created_by_profile_id=public.current_profile_id()) with check(public.is_internal() or created_by_profile_id=public.current_profile_id());
drop policy if exists lead_public_insert on public.leads;
create policy lead_public_insert on public.leads for insert to anon with check(name is not null and phone is not null and pickup is not null and drop is not null);

drop policy if exists notices_read_auth on public.notices;
create policy notices_read_auth on public.notices for select to authenticated using(archived=false);
drop policy if exists notices_internal_write on public.notices;
create policy notices_internal_write on public.notices for all to authenticated using(public.is_internal() or owner_profile_id=public.current_profile_id()) with check(public.is_internal() or owner_profile_id=public.current_profile_id());

drop policy if exists public_forms_public_read on public.public_forms;
create policy public_forms_public_read on public.public_forms for select to anon using(active=true);
drop policy if exists public_forms_auth on public.public_forms;
create policy public_forms_auth on public.public_forms for all to authenticated using(public.is_internal() or owner_profile_id=public.current_profile_id()) with check(public.is_internal() or owner_profile_id=public.current_profile_id());

grant usage on schema public to anon,authenticated;
grant select on public.public_forms to anon;
grant insert on public.leads to anon;
grant all on all tables in schema public to authenticated;
