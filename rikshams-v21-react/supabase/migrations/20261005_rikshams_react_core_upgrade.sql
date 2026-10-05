-- RikshaMS React + Supabase core upgrade (additive / compatibility preserving)
create extension if not exists pgcrypto;

create table if not exists public.vehicle_types (
  id text primary key default ('VT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  name text not null unique,
  code text unique,
  icon text,
  capacity text,
  active boolean not null default true,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.vehicle_types(name,code,icon,sort_order)
select r.vehicle_type,
       upper(regexp_replace(r.vehicle_type,'[^A-Za-z0-9]+','','g')),
       case when lower(r.vehicle_type) like '%rick%' then '🛺' else '🚚' end,
       row_number() over(order by r.vehicle_type)::int
from public.rates r
where r.vehicle_type is not null and btrim(r.vehicle_type)<>''
on conflict(name) do nothing;

insert into public.vehicle_types(name,code,icon,sort_order) values
 ('Rickshaw','RICKSHAW','🛺',10),
 ('Hatti Gadi','HATTI-GADI','🚚',20),
 ('Mini Truck','MINI-TRUCK','🚚',30)
on conflict(name) do nothing;

alter table public.rates add column if not exists vehicle_type_id text;
alter table public.rates add column if not exists code text;
alter table public.rates add column if not exists capacity text;
alter table public.rates add column if not exists icon text;
alter table public.rates add column if not exists active boolean not null default true;
alter table public.rates add column if not exists sort_order integer not null default 0;
alter table public.rates add column if not exists base_km numeric not null default 0;
alter table public.rates add column if not exists customer_base numeric not null default 0;
alter table public.rates add column if not exists customer_per_km numeric not null default 0;
alter table public.rates add column if not exists partner_base numeric not null default 0;
alter table public.rates add column if not exists partner_per_km numeric not null default 0;
alter table public.rates add column if not exists min_fare numeric not null default 0;
alter table public.rates add column if not exists loading_charge numeric not null default 0;
alter table public.rates add column if not exists unloading_charge numeric not null default 0;

update public.rates r
set vehicle_type_id=vt.id,
    code=coalesce(r.code,vt.code),
    capacity=coalesce(r.capacity,vt.capacity),
    icon=coalesce(r.icon,vt.icon),
    customer_base=case when r.customer_base=0 then coalesce(r.customer_rate,0) else r.customer_base end,
    partner_base=case when r.partner_base=0 then coalesce(r.partner_rate,0) else r.partner_base end
from public.vehicle_types vt
where r.vehicle_type=vt.name and r.vehicle_type_id is null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='rates_vehicle_type_id_fkey') then
    alter table public.rates add constraint rates_vehicle_type_id_fkey foreign key(vehicle_type_id) references public.vehicle_types(id);
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='vehicles_vehicle_type_id_fkey') then
    alter table public.vehicles add constraint vehicles_vehicle_type_id_fkey foreign key(vehicle_type_id) references public.vehicle_types(id);
  end if;
  if not exists(select 1 from pg_constraint where conname='vehicles_partner_id_fkey') then
    alter table public.vehicles add constraint vehicles_partner_id_fkey foreign key(partner_id) references public.partners(id);
  end if;
  if not exists(select 1 from pg_constraint where conname='orders_vehicle_type_id_fkey') then
    alter table public.orders add constraint orders_vehicle_type_id_fkey foreign key(vehicle_type_id) references public.vehicle_types(id);
  end if;
end $$;

-- Preserve legacy text fields during first migration so no existing data is lost.
-- React uses safe numeric parsing; future cleanup can normalize only validated rows.
alter table public.orders add column if not exists additional_cost numeric not null default 0;
alter table public.orders add column if not exists assigned_by uuid references public.profiles(id);

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete restrict,
  vehicle_id text references public.vehicles(id),
  driver_id text references public.drivers(id),
  partner_id text references public.partners(id),
  status text not null default 'Draft',
  customer_rate numeric not null default 0,
  vehicle_cost numeric not null default 0,
  labour_cost numeric not null default 0,
  gross_margin numeric not null default 0,
  assigned_at timestamptz,
  dispatched_at timestamptz,
  trip_started_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_dispatches_active_order on public.dispatches(order_id) where archived=false;
create index if not exists idx_dispatches_status on public.dispatches(status,updated_at desc);

create table if not exists public.order_labour_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  dispatch_id uuid references public.dispatches(id) on delete cascade,
  labour_id text not null references public.labourers(id),
  assignment_role text not null default 'General',
  rate_snapshot numeric not null default 0,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  created_by uuid references public.profiles(id),
  unique(order_id,labour_id)
);
create index if not exists idx_order_labour_order on public.order_labour_assignments(order_id);
create index if not exists idx_order_labour_labour on public.order_labour_assignments(labour_id,released_at);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  stage text,
  event_type text not null default 'Event',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_order_events_order on public.order_events(order_id,created_at);

create table if not exists public.lead_quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.leads(id) on delete cascade,
  amount numeric not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_quotes_lead on public.lead_quotes(lead_id,created_at desc);

create table if not exists public.lead_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.leads(id) on delete cascade,
  note text not null,
  channel text,
  next_followup_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_followups_lead on public.lead_followups(lead_id,created_at desc);
create index if not exists idx_lead_followups_due on public.lead_followups(next_followup_at) where next_followup_at is not null;

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.leads(id) on delete cascade,
  event_type text not null default 'Event',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_events_lead on public.lead_events(lead_id,created_at);

create table if not exists public.notice_reads (
  notice_id text not null references public.notices(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz,
  seen_at timestamptz not null default now(),
  primary key(notice_id,profile_id)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  bucket text not null default 'rikshams-documents',
  path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_attachments_entity on public.attachments(entity_type,entity_id,archived);

create table if not exists public.agent_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_form_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Concurrency-safe human-readable IDs.
create sequence if not exists public.riksha_lead_seq start 1001;
create sequence if not exists public.riksha_order_seq start 1001;
create sequence if not exists public.riksha_txn_seq start 1001;
create sequence if not exists public.riksha_slip_seq start 1001;

create or replace function public.next_business_id(p_kind text)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  case lower(p_kind)
    when 'lead' then return 'ENQ-' || lpad(nextval('public.riksha_lead_seq')::text,4,'0');
    when 'order' then return 'ORD-' || lpad(nextval('public.riksha_order_seq')::text,4,'0');
    when 'transaction' then return 'TXN-' || lpad(nextval('public.riksha_txn_seq')::text,4,'0');
    when 'slip' then return 'SLIP-' || lpad(nextval('public.riksha_slip_seq')::text,4,'0');
    else raise exception 'Unknown business id kind';
  end case;
end $$;
revoke all on function public.next_business_id(text) from public;
grant execute on function public.next_business_id(text) to authenticated, service_role;

create or replace function private.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path=public,private as $$
select coalesce(private.current_role()=any(p_roles),false)
$$;

create or replace function private.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public,private as $$
select coalesce(
  exists(
    select 1 from public.profiles p
    where p.auth_user_id=(select auth.uid()) and p.active=true
      and (p.role='Admin' or p.permissions ? '*' or p.permissions ? p_permission)
  ),false)
$$;

-- Generic updated_at trigger for new tables.
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='trg_vehicle_types_updated_at') then
    create trigger trg_vehicle_types_updated_at before update on public.vehicle_types for each row execute function private.set_updated_at();
  end if;
  if not exists(select 1 from pg_trigger where tgname='trg_dispatches_updated_at') then
    create trigger trg_dispatches_updated_at before update on public.dispatches for each row execute function private.set_updated_at();
  end if;
end $$;

-- RLS for new tables.
alter table public.vehicle_types enable row level security;
alter table public.dispatches enable row level security;
alter table public.order_labour_assignments enable row level security;
alter table public.order_events enable row level security;
alter table public.lead_quotes enable row level security;
alter table public.lead_followups enable row level security;
alter table public.lead_events enable row level security;
alter table public.notice_reads enable row level security;
alter table public.app_settings enable row level security;
alter table public.attachments enable row level security;
alter table public.agent_credentials enable row level security;
alter table public.public_form_rate_limits enable row level security;

-- Recreate idempotent internal policies for new tables.
do $$ declare t text; begin
  foreach t in array array['vehicle_types','dispatches','order_labour_assignments','order_events','lead_quotes','lead_followups','lead_events','app_settings','attachments'] loop
    execute format('drop policy if exists internal_all on public.%I',t);
    execute format('create policy internal_all on public.%I for all to authenticated using (private.is_internal()) with check (private.is_internal())',t);
  end loop;
end $$;

drop policy if exists notice_reads_self on public.notice_reads;
create policy notice_reads_self on public.notice_reads for all to authenticated
using (profile_id=private.current_profile_id() or private.is_internal())
with check (profile_id=private.current_profile_id() or private.is_internal());

-- Secrets/anti-abuse tables are service-role only through RLS (no client policies).

-- Tighten anonymous lead creation: public forms must go through the Edge Function.
drop policy if exists lead_public_insert on public.leads;

-- Agent reads only own operational lead data; internal roles keep broader access through existing lead_internal policy.
drop policy if exists lead_agent_select on public.leads;
create policy lead_agent_select on public.leads for select to authenticated
using (created_by_profile_id=private.current_profile_id());

-- Agent may manage only own profile notice records; Admin/Manager/Staff policy remains compatible.
-- Existing notice policies already limit writes by owner_profile_id.

-- Atomic order status transition with sequence guard and resource release.
create or replace function public.transition_order_status(p_order_id text,p_target text,p_note text default null,p_override boolean default false)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_current text;
  v_allowed text;
  v_now timestamptz:=now();
  v_actor uuid:=private.current_profile_id();
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  select * into v_order from public.orders where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;
  v_current:=coalesce(v_order.status,'New');
  v_allowed:=case v_current
    when 'New' then 'Assigned'
    when 'Assigned' then 'Dispatched'
    when 'Dispatched' then 'In Transit'
    when 'In Transit' then 'Delivered'
    when 'Delivered' then 'Completed'
    else null end;
  if p_target<>'Cancelled' and not p_override and p_target is distinct from v_allowed then
    raise exception 'Invalid stage transition: % -> %',v_current,p_target;
  end if;
  if p_override and not private.has_role(array['Admin','Manager']) then raise exception 'Override permission denied'; end if;

  update public.orders set
    status=p_target,
    last_stage_at=v_now,
    assigned_at=case when p_target='Assigned' and assigned_at is null then v_now else assigned_at end,
    dispatched_at=case when p_target='Dispatched' and dispatched_at is null then v_now else dispatched_at end,
    trip_started_at=case when p_target='In Transit' and trip_started_at is null then v_now else trip_started_at end,
    delivered_at=case when p_target='Delivered' and delivered_at is null then v_now else delivered_at end,
    completed_at=case when p_target='Completed' and completed_at is null then v_now else completed_at end,
    cancelled_at=case when p_target='Cancelled' and cancelled_at is null then v_now else cancelled_at end
  where id=p_order_id returning * into v_order;

  insert into public.order_events(order_id,stage,event_type,note,actor_profile_id,created_at)
  values(p_order_id,p_target,'Stage',coalesce(p_note,p_target),v_actor,v_now);

  if p_target in ('Completed','Cancelled') then
    update public.vehicles set status='Available' where id=v_order.vehicle_id and status='Busy';
    update public.drivers set status='Available' where id=v_order.driver_id and status='Busy';
    update public.labourers l set status='Available'
      where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);
    update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
    update public.dispatches set status=p_target,
      completed_at=case when p_target='Completed' then v_now else completed_at end,
      updated_at=v_now where order_id=p_order_id and archived=false;
  elsif p_target='In Transit' then
    update public.dispatches set status='In Transit',trip_started_at=coalesce(trip_started_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
  elsif p_target='Delivered' then
    update public.dispatches set status='Delivered',delivered_at=coalesce(delivered_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
  end if;
  return v_order;
end $$;
revoke all on function public.transition_order_status(text,text,text,boolean) from public;
grant execute on function public.transition_order_status(text,text,text,boolean) to authenticated;

create or replace function public.assign_dispatch_resources(
  p_order_id text,
  p_vehicle_id text,
  p_driver_id text,
  p_labour_ids text[] default array[]::text[],
  p_vehicle_cost numeric default 0,
  p_labour_cost numeric default 0
)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_now timestamptz:=now();
  v_actor uuid:=private.current_profile_id();
  v_lab text;
  v_dispatch uuid;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  select * into v_order from public.orders where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id and archived=false for update;
  if not found then raise exception 'Vehicle not found'; end if;
  if v_vehicle.status not in ('Available','Busy') or (v_vehicle.status='Busy' and v_order.vehicle_id is distinct from p_vehicle_id) then raise exception 'Vehicle is not available'; end if;
  if p_driver_id is null then raise exception 'Driver is required'; end if;
  if not exists(select 1 from public.drivers where id=p_driver_id and archived=false) then raise exception 'Driver not found'; end if;
  if exists(select 1 from public.drivers where id=p_driver_id and status='Busy') and v_order.driver_id is distinct from p_driver_id then raise exception 'Driver is busy'; end if;
  if exists(select 1 from public.labourers l where l.id=any(coalesce(p_labour_ids,array[]::text[])) and l.archived=false and l.status='Busy' and not exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null)) then raise exception 'One or more labourers are busy'; end if;

  if v_order.vehicle_id is not null and v_order.vehicle_id is distinct from p_vehicle_id then update public.vehicles set status='Available' where id=v_order.vehicle_id and status='Busy'; end if;
  if v_order.driver_id is not null and v_order.driver_id is distinct from p_driver_id then update public.drivers set status='Available' where id=v_order.driver_id and status='Busy'; end if;
  update public.labourers l set status='Available' where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null) and not (l.id=any(coalesce(p_labour_ids,array[]::text[])));

  update public.orders set vehicle_id=p_vehicle_id,driver_id=p_driver_id,driver_name=(select name from public.drivers where id=p_driver_id),partner_id=coalesce(v_vehicle.partner_id,partner_id),vehicle_cost=coalesce(p_vehicle_cost,0),labour_cost=coalesce(p_labour_cost,0),assigned_at=coalesce(assigned_at,v_now),assigned_by=v_actor,status=case when status='New' then 'Assigned' else status end,last_stage_at=v_now where id=p_order_id returning * into v_order;

  insert into public.dispatches(order_id,vehicle_id,driver_id,partner_id,status,customer_rate,vehicle_cost,labour_cost,gross_margin,assigned_at,created_by)
  values(p_order_id,p_vehicle_id,p_driver_id,v_order.partner_id,'Assigned',coalesce(v_order.customer_rate,0),coalesce(p_vehicle_cost,0),coalesce(p_labour_cost,0),coalesce(v_order.customer_rate,0)-coalesce(p_vehicle_cost,0)-coalesce(p_labour_cost,0),v_now,v_actor)
  on conflict(order_id) where archived=false do update set vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,partner_id=excluded.partner_id,status='Assigned',customer_rate=excluded.customer_rate,vehicle_cost=excluded.vehicle_cost,labour_cost=excluded.labour_cost,gross_margin=excluded.gross_margin,assigned_at=coalesce(public.dispatches.assigned_at,v_now),updated_at=v_now
  returning id into v_dispatch;

  delete from public.order_labour_assignments where order_id=p_order_id;
  foreach v_lab in array coalesce(p_labour_ids,array[]::text[]) loop
    insert into public.order_labour_assignments(order_id,dispatch_id,labour_id,rate_snapshot,created_by)
    values(p_order_id,v_dispatch,v_lab,coalesce((select rate from public.labourers where id=v_lab),0),v_actor);
  end loop;
  update public.vehicles set status='Busy' where id=p_vehicle_id;
  update public.drivers set status='Busy' where id=p_driver_id;
  update public.labourers set status='Busy' where id=any(coalesce(p_labour_ids,array[]::text[]));
  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id)
  values(p_order_id,'Assigned','Assignment','Resources assigned',jsonb_build_object('vehicle_id',p_vehicle_id,'driver_id',p_driver_id,'labour_ids',p_labour_ids),v_actor);
  return v_order;
end $$;
revoke all on function public.assign_dispatch_resources(text,text,text,text[],numeric,numeric) from public;
grant execute on function public.assign_dispatch_resources(text,text,text,text[],numeric,numeric) to authenticated;

-- Realtime operational tables.
do $$ begin
  begin alter publication supabase_realtime add table public.dispatches; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.vehicles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.drivers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.labourers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.lead_followups; exception when duplicate_object then null; end;
end $$;