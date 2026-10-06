-- RikshaMS V26 — Real Operation + Modern UX backend upgrade
-- Additive migration for the V25 master. Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Real-operation fields.
alter table public.orders add column if not exists driver_override_reason text;
alter table public.orders add column if not exists labour_mode text not null default 'Same Crew';

alter table public.dispatches add column if not exists default_driver_id text references public.drivers(id);
alter table public.dispatches add column if not exists driver_is_override boolean not null default false;
alter table public.dispatches add column if not exists driver_override_reason text;
alter table public.dispatches add column if not exists confirmed_at timestamptz;

-- Jobs are operational records linked 1:1 to an order/dispatch.
create table if not exists public.jobs (
  id text primary key,
  order_id text not null unique references public.orders(id) on delete restrict,
  dispatch_id uuid unique references public.dispatches(id) on delete set null,
  vehicle_id text references public.vehicles(id),
  driver_id text references public.drivers(id),
  partner_id text references public.partners(id),
  labour_ids jsonb not null default '[]'::jsonb,
  status text not null default 'Assigned',
  payment_state text not null default 'Open',
  started_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  event_type text not null default 'Event',
  status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create sequence if not exists public.riksha_job_seq start 1001;
create index if not exists idx_jobs_status_updated on public.jobs(status,updated_at desc) where archived=false;
create index if not exists idx_job_events_job on public.job_events(job_id,created_at desc);

alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
drop policy if exists jobs_internal_all on public.jobs;
create policy jobs_internal_all on public.jobs for all to authenticated
using ((select private.is_internal())) with check ((select private.is_internal()));
drop policy if exists job_events_internal_all on public.job_events;
create policy job_events_internal_all on public.job_events for all to authenticated
using ((select private.is_internal())) with check ((select private.is_internal()));

-- V26 assignment RPC: Fleet owns the regular/default driver relationship.
-- Dispatch may use a temporary trip driver only when an override reason is recorded.
create or replace function public.assign_dispatch_resources_v26(
  p_order_id text,
  p_vehicle_id text,
  p_driver_id text,
  p_labour_ids text[] default array[]::text[],
  p_vehicle_cost numeric default 0,
  p_labour_cost numeric default 0,
  p_driver_override_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_driver public.drivers%rowtype;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
  v_dispatch uuid;
  v_driver_id text;
  v_default_driver text;
  v_lab text;
  v_old_lab text;
  v_required integer;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  select * into v_order from public.orders where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;
  if coalesce(v_order.status,'New') not in ('New','Assigned') then
    raise exception 'Assignment is locked after dispatch confirmation';
  end if;

  select * into v_vehicle from public.vehicles where id=p_vehicle_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Vehicle not found'; end if;
  if coalesce(v_vehicle.status,'Available')='Reserved' and p_vehicle_id is distinct from v_order.vehicle_id then
    raise exception 'Vehicle is reserved for another order';
  end if;
  if coalesce(v_vehicle.status,'Available') not in ('Available','Reserved') then
    raise exception 'Vehicle is not available';
  end if;

  v_default_driver:=v_vehicle.default_driver_id;
  if v_default_driver is null then
    raise exception 'This vehicle has no regular driver. Assign a driver in Fleet & Crew first.';
  end if;
  v_driver_id:=coalesce(nullif(p_driver_id,''),v_default_driver);

  if v_driver_id is distinct from v_default_driver and nullif(btrim(coalesce(p_driver_override_reason,'')),'') is null then
    raise exception 'Replacement driver reason is required';
  end if;

  select * into v_driver from public.drivers where id=v_driver_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Driver not found'; end if;
  if coalesce(v_driver.status,'Available')='Reserved' and v_driver_id is distinct from v_order.driver_id then
    raise exception 'Driver is reserved for another order';
  end if;
  if coalesce(v_driver.status,'Available') not in ('Available','Reserved') then
    raise exception 'Driver is not available';
  end if;

  v_required:=case when coalesce(v_order.labour_mode,'Same Crew')='Separate Crew'
    then greatest(coalesce(v_order.loading,0),0)+greatest(coalesce(v_order.unloading,0),0)
    else greatest(coalesce(v_order.loading,0),coalesce(v_order.unloading,0),0) end;
  if coalesce(array_length(p_labour_ids,1),0) < v_required then
    raise exception 'Required labour: %, selected: %',v_required,coalesce(array_length(p_labour_ids,1),0);
  end if;

  foreach v_lab in array coalesce(p_labour_ids,array[]::text[]) loop
    perform 1 from public.labourers
      where id=v_lab and coalesce(archived,false)=false
        and (coalesce(status,'Available')='Available' or id in (
          select labour_id from public.order_labour_assignments where order_id=p_order_id and released_at is null
        ))
      for update;
    if not found then raise exception 'Labour % is not available',v_lab; end if;
  end loop;

  -- Release old reservation when an assignment is changed before dispatch.
  if v_order.vehicle_id is not null and v_order.vehicle_id is distinct from p_vehicle_id then
    update public.vehicles set status='Available',updated_at=v_now where id=v_order.vehicle_id and status='Reserved';
  end if;
  if v_order.driver_id is not null and v_order.driver_id is distinct from v_driver_id then
    update public.drivers set status='Available',updated_at=v_now where id=v_order.driver_id and status='Reserved';
  end if;
  for v_old_lab in select labour_id from public.order_labour_assignments where order_id=p_order_id and released_at is null loop
    if not (v_old_lab=any(coalesce(p_labour_ids,array[]::text[]))) then
      update public.labourers set status='Available',updated_at=v_now where id=v_old_lab and status='Reserved';
    end if;
  end loop;

  update public.orders set
    vehicle_id=p_vehicle_id,
    driver_id=v_driver_id,
    driver_name=v_driver.name,
    partner_id=v_vehicle.partner_id,
    vehicle_cost=coalesce(p_vehicle_cost,0),
    labour_cost=coalesce(p_labour_cost,0),
    driver_override_reason=case when v_driver_id is distinct from v_default_driver then btrim(p_driver_override_reason) else null end,
    status='Assigned',
    assigned_at=coalesce(assigned_at,v_now),
    last_stage_at=v_now,
    assigned_by=v_actor,
    updated_at=v_now
  where id=p_order_id returning * into v_order;

  insert into public.dispatches(
    order_id,vehicle_id,driver_id,default_driver_id,driver_is_override,driver_override_reason,partner_id,status,
    customer_rate,vehicle_cost,labour_cost,gross_margin,assigned_at,created_by,updated_at
  ) values(
    p_order_id,p_vehicle_id,v_driver_id,v_default_driver,(v_driver_id is distinct from v_default_driver),
    case when v_driver_id is distinct from v_default_driver then btrim(p_driver_override_reason) else null end,
    v_vehicle.partner_id,'Assigned',coalesce(v_order.customer_rate,0),coalesce(p_vehicle_cost,0),coalesce(p_labour_cost,0),
    coalesce(v_order.customer_rate,0)-coalesce(p_vehicle_cost,0)-coalesce(p_labour_cost,0),v_now,v_actor,v_now
  )
  on conflict(order_id) where archived=false do update set
    vehicle_id=excluded.vehicle_id,
    driver_id=excluded.driver_id,
    default_driver_id=excluded.default_driver_id,
    driver_is_override=excluded.driver_is_override,
    driver_override_reason=excluded.driver_override_reason,
    partner_id=excluded.partner_id,
    status='Assigned',
    customer_rate=excluded.customer_rate,
    vehicle_cost=excluded.vehicle_cost,
    labour_cost=excluded.labour_cost,
    gross_margin=excluded.gross_margin,
    assigned_at=coalesce(public.dispatches.assigned_at,v_now),
    updated_at=v_now
  returning id into v_dispatch;

  delete from public.order_labour_assignments where order_id=p_order_id;
  foreach v_lab in array coalesce(p_labour_ids,array[]::text[]) loop
    insert into public.order_labour_assignments(order_id,dispatch_id,labour_id,assignment_role,rate_snapshot,created_by)
    values(p_order_id,v_dispatch,v_lab,'General',coalesce((select rate from public.labourers where id=v_lab),0),v_actor);
  end loop;

  update public.vehicles set status='Reserved',updated_at=v_now where id=p_vehicle_id;
  update public.drivers set status='Reserved',updated_at=v_now where id=v_driver_id;
  update public.labourers set status='Reserved',updated_at=v_now where id=any(coalesce(p_labour_ids,array[]::text[]));

  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
  values(p_order_id,'Assigned','Assignment','Resources reserved',jsonb_build_object(
    'vehicle_id',p_vehicle_id,'driver_id',v_driver_id,'default_driver_id',v_default_driver,
    'driver_override',v_driver_id is distinct from v_default_driver,'driver_override_reason',p_driver_override_reason,
    'labour_ids',coalesce(to_jsonb(p_labour_ids),'[]'::jsonb)
  ),v_actor,v_now);

  return v_order;
end $$;

revoke all on function public.assign_dispatch_resources_v26(text,text,text,text[],numeric,numeric,text) from public;
grant execute on function public.assign_dispatch_resources_v26(text,text,text,text[],numeric,numeric,text) to authenticated;

-- Atomic confirmation: validate assignment, mark resources Busy, create/update Job,
-- create immutable Dispatch Slip and move the Order to Dispatched in one transaction.
drop function if exists public.confirm_dispatch(text);

create function public.confirm_dispatch(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_driver public.drivers%rowtype;
  v_dispatch public.dispatches%rowtype;
  v_slip public.slips%rowtype;
  v_job public.jobs%rowtype;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
  v_required integer;
  v_lab_count integer;
  v_job_id text;
  v_slip_id text;
  v_slip_no text;
  v_labour_ids jsonb;
  v_labour_names jsonb;
  v_owner_name text;
  v_partner_name text;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  select * into v_order from public.orders where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;

  -- Idempotent retry: return the existing confirmed records.
  if v_order.status='Dispatched' then
    select * into v_slip from public.slips where order_id=p_order_id and type='DISPATCH' and coalesce(archived,false)=false order by created_at limit 1;
    select * into v_job from public.jobs where order_id=p_order_id and coalesce(archived,false)=false limit 1;
    return jsonb_build_object('order',to_jsonb(v_order),'slip',to_jsonb(v_slip),'job',to_jsonb(v_job));
  end if;

  if v_order.status<>'Assigned' then raise exception 'Order must be Assigned before dispatch confirmation'; end if;
  if v_order.vehicle_id is null or v_order.driver_id is null then raise exception 'Vehicle and driver assignment are required'; end if;

  select * into v_vehicle from public.vehicles where id=v_order.vehicle_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Assigned vehicle not found'; end if;
  if v_vehicle.default_driver_id is null then raise exception 'Assigned vehicle has no regular driver in Fleet & Crew'; end if;

  select * into v_driver from public.drivers where id=v_order.driver_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Assigned driver not found'; end if;

  if v_order.driver_id is distinct from v_vehicle.default_driver_id
     and nullif(btrim(coalesce(v_order.driver_override_reason,'')),'') is null then
    raise exception 'Replacement driver requires an override reason';
  end if;

  if coalesce(v_vehicle.status,'Available') not in ('Reserved','Available') then raise exception 'Vehicle is no longer available'; end if;
  if coalesce(v_driver.status,'Available') not in ('Reserved','Available') then raise exception 'Driver is no longer available'; end if;

  v_required:=case when coalesce(v_order.labour_mode,'Same Crew')='Separate Crew'
    then greatest(coalesce(v_order.loading,0),0)+greatest(coalesce(v_order.unloading,0),0)
    else greatest(coalesce(v_order.loading,0),coalesce(v_order.unloading,0),0) end;
  select count(*)::int,coalesce(jsonb_agg(a.labour_id),'[]'::jsonb),coalesce(jsonb_agg(l.name order by l.name),'[]'::jsonb)
    into v_lab_count,v_labour_ids,v_labour_names
  from public.order_labour_assignments a join public.labourers l on l.id=a.labour_id
  where a.order_id=p_order_id and a.released_at is null;
  if v_lab_count<v_required then raise exception 'Required labour is incomplete'; end if;
  if exists(
    select 1 from public.order_labour_assignments a join public.labourers l on l.id=a.labour_id
    where a.order_id=p_order_id and a.released_at is null and coalesce(l.status,'Available') not in ('Reserved','Available')
  ) then raise exception 'One or more labour resources are no longer available'; end if;

  update public.orders set status='Dispatched',dispatched_at=coalesce(dispatched_at,v_now),last_stage_at=v_now,updated_at=v_now
  where id=p_order_id returning * into v_order;

  update public.dispatches set
    status='Dispatched',
    default_driver_id=v_vehicle.default_driver_id,
    driver_is_override=(v_order.driver_id is distinct from v_vehicle.default_driver_id),
    driver_override_reason=v_order.driver_override_reason,
    confirmed_at=coalesce(confirmed_at,v_now),
    dispatched_at=coalesce(dispatched_at,v_now),
    updated_at=v_now
  where order_id=p_order_id and archived=false returning * into v_dispatch;
  if not found then raise exception 'Dispatch assignment record not found'; end if;

  update public.vehicles set status='Busy',updated_at=v_now where id=v_order.vehicle_id;
  update public.drivers set status='Busy',updated_at=v_now where id=v_order.driver_id;
  update public.labourers l set status='Busy',updated_at=v_now
    where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);

  select name into v_owner_name from public.vehicle_owners where id=v_vehicle.owner_id;
  select name into v_partner_name from public.partners where id=v_vehicle.partner_id;

  select * into v_job from public.jobs where order_id=p_order_id and archived=false for update;
  if not found then
    v_job_id:='JOB-'||lpad(nextval('public.riksha_job_seq')::text,6,'0');
    insert into public.jobs(id,order_id,dispatch_id,vehicle_id,driver_id,partner_id,labour_ids,status,payment_state,created_by,created_at,updated_at)
    values(v_job_id,p_order_id,v_dispatch.id,v_order.vehicle_id,v_order.driver_id,v_order.partner_id,v_labour_ids,'Dispatched','Open',v_actor,v_now,v_now)
    returning * into v_job;
  else
    update public.jobs set dispatch_id=v_dispatch.id,vehicle_id=v_order.vehicle_id,driver_id=v_order.driver_id,partner_id=v_order.partner_id,
      labour_ids=v_labour_ids,status='Dispatched',updated_at=v_now where id=v_job.id returning * into v_job;
  end if;

  insert into public.job_events(job_id,event_type,status,note,metadata,actor_profile_id,created_at)
  values(v_job.id,'Dispatch Confirmed','Dispatched','Dispatch confirmed and slip created',jsonb_build_object('order_id',p_order_id),v_actor,v_now);

  select * into v_slip from public.slips
    where order_id=p_order_id and type='DISPATCH' and coalesce(archived,false)=false
    order by created_at limit 1 for update;
  if not found then
    v_slip_id:=public.next_business_id('slip');
    v_slip_no:='DS-'||regexp_replace(p_order_id,'[^0-9A-Za-z]+','','g')||'-01';
    insert into public.slips(
      id,slip_no,type,order_id,customer_id,customer_name,customer_phone,vehicle_id,partner_id,labour_ids,
      created_date,created_time,created_at,created_by,status,amount,payment_method,snapshot,source,archived,updated_at
    ) values(
      v_slip_id,v_slip_no,'DISPATCH',p_order_id,v_order.customer_id,v_order.customer,v_order.phone,v_order.vehicle_id,v_order.partner_id,v_labour_ids,
      (v_now at time zone 'Asia/Kathmandu')::date,(v_now at time zone 'Asia/Kathmandu')::time,v_now,v_actor,'Current',0,null,
      jsonb_build_object(
        'orderId',v_order.id,'customerName',v_order.customer,'customerPhone',v_order.phone,
        'pickup',v_order.pickup,'drop',v_order.drop,'goods',v_order.goods,'vehicleType',v_order.vehicle_type,
        'vehicleNumber',v_vehicle.number,'vehicleId',v_vehicle.id,'driverId',v_driver.id,'driverName',v_driver.name,'driverMobile',v_driver.mobile,
        'defaultDriverId',v_vehicle.default_driver_id,'driverOverride',(v_order.driver_id is distinct from v_vehicle.default_driver_id),
        'driverOverrideReason',v_order.driver_override_reason,'ownerName',v_owner_name,'partnerName',v_partner_name,
        'labourIds',v_labour_ids,'labourNames',v_labour_names,'loading',v_order.loading,'unloading',v_order.unloading,
        'labourMode',v_order.labour_mode,'customerRate',v_order.customer_rate,'vehicleCost',v_order.vehicle_cost,'labourCost',v_order.labour_cost,
        'grossMargin',coalesce(v_order.customer_rate,0)-coalesce(v_order.vehicle_cost,0)-coalesce(v_order.labour_cost,0),
        'dispatchDateTime',v_now,'orderStatus','Dispatched'
      ),'confirm_dispatch',false,v_now
    ) returning * into v_slip;
  end if;

  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
  values(p_order_id,'Dispatched','Dispatch Confirmed','Dispatch confirmed and fixed dispatch slip created',jsonb_build_object(
    'dispatch_id',v_dispatch.id,'job_id',v_job.id,'slip_id',v_slip.id,'vehicle_id',v_order.vehicle_id,'driver_id',v_order.driver_id
  ),v_actor,v_now);

  return jsonb_build_object('order',to_jsonb(v_order),'dispatch',to_jsonb(v_dispatch),'job',to_jsonb(v_job),'slip',to_jsonb(v_slip));
end $$;

revoke all on function public.confirm_dispatch(text) from public;
grant execute on function public.confirm_dispatch(text) to authenticated;

-- V26 stage transitions. Dispatch confirmation must go through confirm_dispatch.
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
  v_job_id text;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  select * into v_order from public.orders where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;
  v_current:=coalesce(v_order.status,'New');

  if p_target='Dispatched' then raise exception 'Use confirm_dispatch for dispatch confirmation'; end if;

  v_allowed:=case v_current
    when 'New' then 'Assigned'
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
    trip_started_at=case when p_target='In Transit' and trip_started_at is null then v_now else trip_started_at end,
    delivered_at=case when p_target='Delivered' and delivered_at is null then v_now else delivered_at end,
    completed_at=case when p_target='Completed' and completed_at is null then v_now else completed_at end,
    cancelled_at=case when p_target='Cancelled' and cancelled_at is null then v_now else cancelled_at end,
    updated_at=v_now
  where id=p_order_id returning * into v_order;

  insert into public.order_events(order_id,stage,event_type,note,actor_profile_id,created_at)
  values(p_order_id,p_target,'Stage',coalesce(p_note,p_target),v_actor,v_now);

  select id into v_job_id from public.jobs where order_id=p_order_id and archived=false limit 1;

  if p_target='In Transit' then
    update public.dispatches set status='In Transit',trip_started_at=coalesce(trip_started_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
    update public.jobs set status='In Transit',started_at=coalesce(started_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
  elsif p_target='Delivered' then
    update public.dispatches set status='Delivered',delivered_at=coalesce(delivered_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
    update public.jobs set status='Delivered',delivered_at=coalesce(delivered_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;

    -- Operational trip is finished at Delivered. Resources become usable again even if accounting is pending.
    update public.vehicles set status='Available',updated_at=v_now where id=v_order.vehicle_id and status in ('Reserved','Busy');
    update public.drivers set status='Available',updated_at=v_now where id=v_order.driver_id and status in ('Reserved','Busy');
    update public.labourers l set status='Available',updated_at=v_now
      where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null)
        and l.status in ('Reserved','Busy');
    update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
  elsif p_target='Completed' then
    update public.dispatches set status='Completed',completed_at=coalesce(completed_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
    update public.jobs set status='Completed',completed_at=coalesce(completed_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
  elsif p_target='Cancelled' then
    update public.vehicles set status='Available',updated_at=v_now where id=v_order.vehicle_id and status in ('Reserved','Busy');
    update public.drivers set status='Available',updated_at=v_now where id=v_order.driver_id and status in ('Reserved','Busy');
    update public.labourers l set status='Available',updated_at=v_now
      where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null)
        and l.status in ('Reserved','Busy');
    update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
    update public.dispatches set status='Cancelled',updated_at=v_now where order_id=p_order_id and archived=false;
    update public.jobs set status='Cancelled',cancelled_at=coalesce(cancelled_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
  end if;

  if v_job_id is not null then
    insert into public.job_events(job_id,event_type,status,note,metadata,actor_profile_id,created_at)
    values(v_job_id,'Stage',p_target,coalesce(p_note,p_target),'{}'::jsonb,v_actor,v_now);
  end if;

  return v_order;
end $$;

revoke all on function public.transition_order_status(text,text,text,boolean) from public;
grant execute on function public.transition_order_status(text,text,text,boolean) to authenticated;

-- Helpful indexes for slips and operational lookups.
create index if not exists idx_slips_type_order_created on public.slips(type,order_id,created_at desc) where coalesce(archived,false)=false;
create index if not exists idx_slips_transaction_created on public.slips(transaction_id,created_at desc) where transaction_id is not null and coalesce(archived,false)=false;
create index if not exists idx_dispatch_default_driver on public.dispatches(default_driver_id) where archived=false;

-- Realtime surfaces used by V26.
do $$ begin
  begin alter publication supabase_realtime add table public.jobs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.job_events; exception when duplicate_object then null; end;
end $$;
