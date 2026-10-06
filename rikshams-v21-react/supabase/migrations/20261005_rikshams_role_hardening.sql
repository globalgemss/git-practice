-- RikshaMS role hardening for production
drop policy if exists profile_self on public.profiles;
create policy profile_self on public.profiles for select to authenticated
using(auth_user_id=(select auth.uid()) or private.has_role(array['Admin','Manager']));
drop policy if exists profile_manage on public.profiles;
create policy profile_manage on public.profiles for all to authenticated
using(private.has_role(array['Admin','Manager']))
with check(private.has_role(array['Admin','Manager']));

do $$ declare t text; begin
  foreach t in array array['transactions','daybook_closings','rates','audit_logs','app_settings'] loop
    execute format('drop policy if exists internal_all on public.%I',t);
    execute format('drop policy if exists management_all on public.%I',t);
    execute format('create policy management_all on public.%I for all to authenticated using (private.has_role(array[''Admin'',''Manager''])) with check (private.has_role(array[''Admin'',''Manager'']))',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['vehicle_types','vehicles','drivers','labourers','vehicle_owners','partners','referral_partners'] loop
    execute format('drop policy if exists internal_all on public.%I',t);
    execute format('drop policy if exists internal_read on public.%I',t);
    execute format('drop policy if exists management_write on public.%I',t);
    execute format('create policy internal_read on public.%I for select to authenticated using (private.is_internal())',t);
    execute format('create policy management_write on public.%I for all to authenticated using (private.has_role(array[''Admin'',''Manager''])) with check (private.has_role(array[''Admin'',''Manager'']))',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['customers','orders','slips','dispatches','order_labour_assignments','order_events','lead_quotes','lead_followups','lead_events','attachments'] loop
    execute format('drop policy if exists internal_all on public.%I',t);
    execute format('create policy internal_all on public.%I for all to authenticated using (private.is_internal()) with check (private.is_internal())',t);
  end loop;
end $$;

drop policy if exists lead_internal on public.leads;
create policy lead_internal on public.leads for all to authenticated
using(private.is_internal() or created_by_profile_id=private.current_profile_id())
with check(private.is_internal() or created_by_profile_id=private.current_profile_id());

drop policy if exists public_forms_auth on public.public_forms;
create policy public_forms_auth on public.public_forms for all to authenticated
using(private.has_role(array['Admin','Manager']) or owner_profile_id=private.current_profile_id())
with check(private.has_role(array['Admin','Manager']) or owner_profile_id=private.current_profile_id());

revoke all on public.agent_credentials from anon, authenticated;
revoke all on public.public_form_rate_limits from anon, authenticated;
