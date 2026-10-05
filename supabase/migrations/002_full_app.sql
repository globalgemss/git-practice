alter table public.leads add column if not exists requirement text;
alter table public.dispatches add column if not exists updated_at timestamptz not null default now();
alter table public.jobs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.fares(
 id uuid primary key default gen_random_uuid(),
 pickup_location_id uuid references public.locations(id),
 drop_location_id uuid references public.locations(id),
 vehicle_type text, amount numeric(14,2) not null default 0,
 status text not null default 'active', created_at timestamptz not null default now()
);
create table if not exists public.partners(
 id uuid primary key default gen_random_uuid(), partner_type text, name text not null,
 phone text,email text,address text,status text not null default 'active',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz
);
create table if not exists public.settings(
 key text primary key,value jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);

insert into public.roles(code,name) values
('super_admin','Super Admin'),('admin','Admin'),('manager','Manager'),('staff','Staff'),('agent','Agent')
on conflict(code) do update set name=excluded.name;

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
 select r.code from public.profiles p left join public.roles r on r.id=p.role_id where p.id=auth.uid()
$$;
create or replace function public.is_internal_user() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_role() in ('super_admin','admin','manager','staff'),false)
$$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;

create or replace function public.log_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.activity_logs(entity_type,entity_id,action,old_value,new_value,actor_id)
 values(TG_TABLE_NAME,coalesce(new.id,old.id),TG_OP,case when TG_OP='INSERT' then null else to_jsonb(old) end,case when TG_OP='DELETE' then null else to_jsonb(new) end,auth.uid());
 return coalesce(new,old);
end $$;

do $$ declare t text; begin
 foreach t in array array['leads','customers','orders','dispatches','jobs','vehicles','drivers','labourers','payments','notices'] loop
  execute format('drop trigger if exists audit_%I on public.%I',t,t);
  execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.log_change()',t,t);
 end loop;
end $$;

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.customers enable row level security;
alter table public.locations enable row level security;
alter table public.vehicle_owners enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.labourers enable row level security;
alter table public.leads enable row level security;
alter table public.orders enable row level security;
alter table public.dispatches enable row level security;
alter table public.jobs enable row level security;
alter table public.job_labourers enable row level security;
alter table public.payments enable row level security;
alter table public.notes enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notices enable row level security;
alter table public.slips enable row level security;
alter table public.fares enable row level security;
alter table public.partners enable row level security;
alter table public.settings enable row level security;

do $$ declare t text; begin
 foreach t in array array['roles','customers','locations','vehicle_owners','vehicles','drivers','labourers','orders','dispatches','jobs','job_labourers','payments','notes','activity_logs','notices','slips','fares','partners','settings'] loop
  execute format('drop policy if exists internal_all on public.%I',t);
  execute format('create policy internal_all on public.%I for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user())',t);
 end loop;
end $$;

drop policy if exists profile_self_read on public.profiles;
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_internal_user());
drop policy if exists profile_self_update on public.profiles;
create policy profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists agents_access on public.agents;
create policy agents_access on public.agents for all to authenticated using(public.is_internal_user() or profile_id=auth.uid()) with check(public.is_internal_user() or profile_id=auth.uid());

drop policy if exists leads_access on public.leads;
create policy leads_access on public.leads for all to authenticated
using(public.is_internal_user() or agent_id in(select id from public.agents where profile_id=auth.uid()))
with check(public.is_internal_user() or agent_id in(select id from public.agents where profile_id=auth.uid()));

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads for insert to anon
with check(source in('public_link','agent','qr') and full_name is not null and phone is not null);

drop policy if exists public_agent_lookup on public.agents;
create policy public_agent_lookup on public.agents for select to anon using(status='active');

grant usage on schema public to anon,authenticated;
grant select on public.agents to anon;
grant insert on public.leads to anon;
grant all on all tables in schema public to authenticated;

create unique index if not exists uq_slip_order_type on public.slips(order_id,slip_type) where order_id is not null;
