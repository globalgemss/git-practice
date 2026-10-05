alter table public.public_forms add column if not exists owner_display_name text;

update public.public_forms
set owner_display_name = case when owner_type='Admin' then 'Administrator' else owner_display_name end
where owner_display_name is null;

create or replace function private.set_updated_at()
returns trigger language plpgsql security invoker
set search_path=public,private
as $$begin new.updated_at=now(); return new; end$$;

do $$ declare t text; begin
  foreach t in array array['profiles','leads','customers','vehicle_owners','drivers','partners','vehicles','labourers','referral_partners','orders','transactions','slips','daybook_closings','notices','rates','public_forms'] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I',t,t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function private.set_updated_at()',t,t);
  end loop;
end $$;

create or replace function private.audit_row_change()
returns trigger language plpgsql security definer
set search_path=public,private
as $$
declare v_id text; v_actor uuid;
begin
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  select id into v_actor from public.profiles where auth_user_id=(select auth.uid()) limit 1;
  insert into public.audit_logs(actor_profile_id,action,module,record_id,old_value,new_value)
  values(v_actor,TG_OP,TG_TABLE_NAME,v_id,
    case when TG_OP='INSERT' then null else to_jsonb(old) end,
    case when TG_OP='DELETE' then null else to_jsonb(new) end);
  return coalesce(new,old);
end $$;

revoke all on function private.audit_row_change() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['leads','customers','vehicles','drivers','labourers','orders','transactions','notices'] loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',t,t);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leads') then alter publication supabase_realtime add table public.leads; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then alter publication supabase_realtime add table public.orders; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='transactions') then alter publication supabase_realtime add table public.transactions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notices') then alter publication supabase_realtime add table public.notices; end if;
end $$;
