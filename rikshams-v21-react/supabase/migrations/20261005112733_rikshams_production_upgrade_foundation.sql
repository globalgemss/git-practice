
-- RikshaMS production migration foundation
-- Additive and compatibility-preserving. Approved V21 UI/workflow remains unchanged.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Missing relational masters / operational job records
-- ---------------------------------------------------------------------------

create sequence if not exists public.riksha_job_seq start 1001;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  zone text,
  latitude numeric,
  longitude numeric,
  active boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_locations_name_area_active
  on public.locations(lower(name), lower(coalesce(area,'')))
  where archived=false;
create index if not exists idx_locations_active_name
  on public.locations(active, archived, name);

create table if not exists public.jobs (
  id text primary key,
  order_id text not null unique references public.orders(id) on delete restrict,
  dispatch_id uuid unique references public.dispatches(id) on delete restrict,
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
  updated_at timestamptz not null default now(),
  constraint jobs_status_chk check (status in ('Assigned','Dispatched','In Transit','Delivered','Completed','Cancelled')),
  constraint jobs_payment_state_chk check (payment_state in ('Open','Partial','Settled','Credit'))
);
create index if not exists idx_jobs_status_created on public.jobs(status, created_at desc);
create index if not exists idx_jobs_vehicle on public.jobs(vehicle_id);
create index if not exists idx_jobs_driver on public.jobs(driver_id);
create index if not exists idx_jobs_partner on public.jobs(partner_id);

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
create index if not exists idx_job_events_job on public.job_events(job_id, created_at);

alter table public.leads
  add column if not exists pickup_location_id uuid references public.locations(id),
  add column if not exists drop_location_id uuid references public.locations(id);

alter table public.orders
  add column if not exists pickup_location_id uuid references public.locations(id),
  add column if not exists drop_location_id uuid references public.locations(id);

create index if not exists idx_leads_pickup_location on public.leads(pickup_location_id);
create index if not exists idx_leads_drop_location on public.leads(drop_location_id);
create index if not exists idx_orders_pickup_location on public.orders(pickup_location_id);
create index if not exists idx_orders_drop_location on public.orders(drop_location_id);

-- ---------------------------------------------------------------------------
-- 2) Profile/master fields required by the approved production specification
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists customer_type text not null default 'Individual',
  add column if not exists alternate_phone text,
  add column if not exists address text,
  add column if not exists billing_name text,
  add column if not exists billing_address text,
  add column if not exists tax_id text;

alter table public.drivers
  add column if not exists alternate_phone text,
  add column if not exists area text,
  add column if not exists citizenship_no text,
  add column if not exists license_expiry date,
  add column if not exists rating numeric,
  add column if not exists discipline_note text,
  add column if not exists reliability_note text;

alter table public.labourers
  add column if not exists alternate_phone text,
  add column if not exists address text,
  add column if not exists discipline_note text,
  add column if not exists reliability_note text;

alter table public.vehicle_owners
  add column if not exists alternate_phone text;

alter table public.partners
  add column if not exists alternate_phone text,
  add column if not exists address text;

alter table public.vehicles
  add column if not exists service_due_date date,
  add column if not exists service_notes text;

-- ---------------------------------------------------------------------------
-- 3) Idempotency / duplicate protection
-- ---------------------------------------------------------------------------

create unique index if not exists uq_orders_create_request
  on public.orders(create_request_id)
  where create_request_id is not null;

create unique index if not exists uq_transactions_action
  on public.transactions(action_id)
  where action_id is not null;

create unique index if not exists uq_slips_order_type_current
  on public.slips(order_id,type)
  where archived=false
    and order_id is not null
    and type in ('ORDER','DISPATCH')
    and status in ('Current','Active');

create unique index if not exists uq_slips_receipt_transaction
  on public.slips(transaction_id)
  where archived=false and type='RECEIPT' and transaction_id is not null;

-- ---------------------------------------------------------------------------
-- 4) Secure order override credential in PRIVATE schema
-- ---------------------------------------------------------------------------

create table if not exists private.order_override_credentials (
  singleton boolean primary key default true check(singleton),
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

revoke all on private.order_override_credentials from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Generic triggers / RLS for new public tables
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='trg_locations_updated_at') then
    create trigger trg_locations_updated_at
      before update on public.locations
      for each row execute function private.set_updated_at();
  end if;
  if not exists(select 1 from pg_trigger where tgname='trg_jobs_updated_at') then
    create trigger trg_jobs_updated_at
      before update on public.jobs
      for each row execute function private.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='trg_locations_audit') then
    create trigger trg_locations_audit
      after insert or update or delete on public.locations
      for each row execute function private.audit_row_change();
  end if;
  if not exists(select 1 from pg_trigger where tgname='trg_jobs_audit') then
    create trigger trg_jobs_audit
      after insert or update or delete on public.jobs
      for each row execute function private.audit_row_change();
  end if;
end $$;

alter table public.locations enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;

drop policy if exists locations_internal_read on public.locations;
create policy locations_internal_read on public.locations
  for select to authenticated
  using ((select private.is_internal()));

drop policy if exists locations_management_write on public.locations;
create policy locations_management_write on public.locations
  for all to authenticated
  using ((select private.has_role(array['Admin','Manager'])))
  with check ((select private.has_role(array['Admin','Manager'])));

drop policy if exists jobs_internal_all on public.jobs;
create policy jobs_internal_all on public.jobs
  for all to authenticated
  using ((select private.is_internal()))
  with check ((select private.is_internal()));

drop policy if exists job_events_internal_all on public.job_events;
create policy job_events_internal_all on public.job_events
  for all to authenticated
  using ((select private.is_internal()))
  with check ((select private.is_internal()));

-- ---------------------------------------------------------------------------
-- 6) PRIVATE atomic workflow cores
-- ---------------------------------------------------------------------------

create or replace function private.make_slip_core(
  p_type text,
  p_order public.orders,
  p_transaction_id text default null,
  p_amount numeric default 0,
  p_payment_method text default null,
  p_source text default 'System',
  p_snapshot jsonb default '{}'::jsonb
)
returns public.slips
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_existing public.slips%rowtype;
  v_id text;
  v_no text;
  v_now timestamptz := now();
  v_suffix text;
  v_actor uuid := private.current_profile_id();
begin
  if p_type in ('ORDER','DISPATCH') then
    select * into v_existing
    from public.slips
    where order_id=p_order.id
      and type=p_type
      and archived=false
      and status in ('Current','Active')
    order by created_at desc
    limit 1;
  elsif p_type='RECEIPT' and p_transaction_id is not null then
    select * into v_existing
    from public.slips
    where transaction_id=p_transaction_id
      and type='RECEIPT'
      and archived=false
    order by created_at desc
    limit 1;
  end if;

  if found then return v_existing; end if;

  v_id := 'SLIP-' || lpad(nextval('public.riksha_slip_seq')::text,4,'0');
  v_suffix := right(regexp_replace(v_id,'\D','','g'),4);
  v_no := case
    when p_type='ORDER' then 'OS-' || coalesce(nullif(regexp_replace(p_order.id,'\D','','g'),''),p_order.id) || '-01'
    when p_type='DISPATCH' then 'DS-' || coalesce(nullif(regexp_replace(p_order.id,'\D','','g'),''),p_order.id) || '-01'
    else 'RCP-' || to_char(v_now at time zone 'Asia/Kathmandu','YYYYMMDD') || '-' || v_suffix
  end;

  insert into public.slips(
    id,slip_no,type,order_id,transaction_id,customer_id,customer_name,customer_phone,
    vehicle_id,partner_id,labour_ids,created_date,created_time,created_at,created_by,
    version,status,amount,payment_method,snapshot,source,archived
  )
  values(
    v_id,v_no,p_type,p_order.id,p_transaction_id,p_order.customer_id,p_order.customer,p_order.phone,
    p_order.vehicle_id,p_order.partner_id,coalesce(p_order.labour_ids,'[]'::jsonb),
    (v_now at time zone 'Asia/Kathmandu')::date,
    (v_now at time zone 'Asia/Kathmandu')::time,
    v_now,v_actor,1,'Current',coalesce(p_amount,0),p_payment_method,
    jsonb_build_object(
      'orderId',p_order.id,
      'customerName',p_order.customer,
      'customerPhone',p_order.phone,
      'pickup',p_order.pickup,
      'drop',p_order.drop,
      'goods',p_order.goods,
      'vehicleType',p_order.vehicle_type,
      'customerRate',coalesce(p_order.customer_rate,0),
      'orderStatus',p_order.status
    ) || coalesce(p_snapshot,'{}'::jsonb),
    p_source,false
  )
  returning * into v_existing;

  return v_existing;
end $$;

revoke all on function private.make_slip_core(text,public.orders,text,numeric,text,text,jsonb) from public,anon,authenticated;

create or replace function private.create_order_atomic_core(p_input jsonb)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_lead public.leads%rowtype;
  v_id text;
  v_request text := nullif(btrim(coalesce(p_input->>'create_request_id','')),'');
  v_lead_id text := nullif(btrim(coalesce(p_input->>'source_lead_id','')),'');
  v_now timestamptz := now();
  v_actor uuid := private.current_profile_id();
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  if v_request is not null then
    select * into v_order from public.orders where create_request_id=v_request limit 1;
    if found then return v_order; end if;
  end if;

  if nullif(btrim(coalesce(p_input->>'customer','')),'') is null
     or nullif(btrim(coalesce(p_input->>'phone','')),'') is null
     or nullif(btrim(coalesce(p_input->>'pickup','')),'') is null
     or nullif(btrim(coalesce(p_input->>'drop','')),'') is null
  then
    raise exception 'Customer, phone, pickup and drop are required';
  end if;

  if v_lead_id is not null then
    select * into v_lead from public.leads where id=v_lead_id and archived=false for update;
    if not found then raise exception 'Lead not found'; end if;
    if v_lead.converted_order_id is not null then
      select * into v_order from public.orders where id=v_lead.converted_order_id;
      if found then return v_order; end if;
    end if;
    if v_lead.status <> 'Confirmed' then
      raise exception 'Lead must be Confirmed before conversion';
    end if;
  end if;

  v_id := 'ORD-' || lpad(nextval('public.riksha_order_seq')::text,4,'0');

  insert into public.orders(
    id,create_request_id,source,source_lead_id,date,time,customer_id,customer,phone,
    pickup,drop,goods,pickup_location_id,drop_location_id,vehicle_type_id,vehicle_type,
    distance,loading,unloading,status,payment,customer_rate,estimated_vehicle_cost,
    estimated_labour_cost,vehicle_cost,labour_cost,additional_cost,notes,timeline,contact,
    last_stage_at,archived
  )
  values(
    v_id,coalesce(v_request,gen_random_uuid()::text),
    coalesce(nullif(p_input->>'source',''),case when v_lead_id is null then 'Direct' else 'Lead' end),
    v_lead_id,
    nullif(p_input->>'date','')::date,
    nullif(p_input->>'time','')::time,
    nullif(p_input->>'customer_id',''),
    p_input->>'customer',p_input->>'phone',p_input->>'pickup',p_input->>'drop',
    nullif(p_input->>'goods',''),
    nullif(p_input->>'pickup_location_id','')::uuid,
    nullif(p_input->>'drop_location_id','')::uuid,
    nullif(p_input->>'vehicle_type_id',''),
    nullif(p_input->>'vehicle_type',''),
    nullif(p_input->>'distance','')::numeric,
    coalesce(nullif(p_input->>'loading','')::integer,0),
    coalesce(nullif(p_input->>'unloading','')::integer,0),
    'New',
    coalesce(nullif(p_input->>'payment',''),'Pending'),
    coalesce(nullif(p_input->>'customer_rate','')::numeric,0),
    coalesce(nullif(p_input->>'estimated_vehicle_cost','')::numeric,0),
    coalesce(nullif(p_input->>'estimated_labour_cost','')::numeric,0),
    0,0,
    coalesce(nullif(p_input->>'additional_cost','')::numeric,0),
    nullif(p_input->>'notes',''),
    '[]'::jsonb,'[]'::jsonb,
    v_now,false
  )
  returning * into v_order;

  insert into public.order_events(order_id,stage,event_type,note,actor_profile_id,created_at)
  values(v_id,'New','Created',
         case when v_lead_id is null then 'Order created' else 'Converted from '||v_lead_id end,
         v_actor,v_now);

  if v_lead_id is not null then
    update public.leads
      set status='Converted',converted_order_id=v_id,updated_at=v_now
      where id=v_lead_id;

    insert into public.lead_events(lead_id,event_type,note,metadata,actor_profile_id,created_at)
    values(v_lead_id,'Converted','Converted to Order · '||v_id,
           jsonb_build_object('order_id',v_id),v_actor,v_now);
  end if;

  perform private.make_slip_core(
    'ORDER',v_order,null,coalesce(v_order.customer_rate,0),null,
    case when v_lead_id is null then 'Order Creation' else 'Lead Conversion' end,
    '{}'::jsonb
  );

  return v_order;
end $$;

revoke all on function private.create_order_atomic_core(jsonb) from public,anon;
grant execute on function private.create_order_atomic_core(jsonb) to authenticated;

create or replace function public.create_order_atomic(p_input jsonb)
returns public.orders
language sql
security invoker
set search_path=public,private,pg_temp
as $$
  select private.create_order_atomic_core(p_input);
$$;
revoke all on function public.create_order_atomic(jsonb) from public,anon;
grant execute on function public.create_order_atomic(jsonb) to authenticated;

-- Existing resource assignment moved behind a private security-definer core.
create or replace function private.assign_dispatch_resources_core(
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

  select * into v_order from public.orders
    where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('New','Assigned') then
    raise exception 'Resources can only be assigned before dispatch';
  end if;

  select * into v_vehicle from public.vehicles
    where id=p_vehicle_id and archived=false for update;
  if not found then raise exception 'Vehicle not found'; end if;

  if v_order.vehicle_type_id is not null
     and v_vehicle.vehicle_type_id is not null
     and v_order.vehicle_type_id <> v_vehicle.vehicle_type_id
  then
    raise exception 'Vehicle type does not match order requirement';
  end if;

  if v_vehicle.status not in ('Available','Busy')
     or (v_vehicle.status='Busy' and v_order.vehicle_id is distinct from p_vehicle_id)
  then
    raise exception 'Vehicle is not available';
  end if;

  if p_driver_id is null then raise exception 'Driver is required'; end if;
  if not exists(select 1 from public.drivers where id=p_driver_id and archived=false) then
    raise exception 'Driver not found';
  end if;
  if exists(select 1 from public.drivers where id=p_driver_id and status='Busy')
     and v_order.driver_id is distinct from p_driver_id
  then
    raise exception 'Driver is busy';
  end if;

  if exists(
    select 1 from public.labourers l
    where l.id=any(coalesce(p_labour_ids,array[]::text[]))
      and l.archived=false
      and l.status='Busy'
      and not exists(
        select 1 from public.order_labour_assignments a
        where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null
      )
  ) then
    raise exception 'One or more labourers are busy';
  end if;

  if greatest(coalesce(v_order.loading,0),coalesce(v_order.unloading,0)) >
     cardinality(coalesce(p_labour_ids,array[]::text[]))
  then
    raise exception 'Required labour assignment is incomplete';
  end if;

  if v_order.vehicle_id is not null and v_order.vehicle_id is distinct from p_vehicle_id then
    update public.vehicles set status='Available'
      where id=v_order.vehicle_id and status='Busy';
  end if;

  if v_order.driver_id is not null and v_order.driver_id is distinct from p_driver_id then
    update public.drivers set status='Available'
      where id=v_order.driver_id and status='Busy';
  end if;

  update public.labourers l set status='Available'
    where exists(
      select 1 from public.order_labour_assignments a
      where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null
    )
    and not (l.id=any(coalesce(p_labour_ids,array[]::text[])));

  update public.orders set
    vehicle_id=p_vehicle_id,
    driver_id=p_driver_id,
    driver_name=(select name from public.drivers where id=p_driver_id),
    partner_id=coalesce(v_vehicle.partner_id,partner_id),
    vehicle_cost=coalesce(p_vehicle_cost,0),
    labour_cost=coalesce(p_labour_cost,0),
    assigned_at=coalesce(assigned_at,v_now),
    assigned_by=v_actor,
    status=case when status='New' then 'Assigned' else status end,
    last_stage_at=v_now,
    labour_ids=to_jsonb(coalesce(p_labour_ids,array[]::text[]))
  where id=p_order_id returning * into v_order;

  insert into public.dispatches(
    order_id,vehicle_id,driver_id,partner_id,status,customer_rate,vehicle_cost,labour_cost,
    gross_margin,assigned_at,created_by
  )
  values(
    p_order_id,p_vehicle_id,p_driver_id,v_order.partner_id,'Assigned',
    coalesce(v_order.customer_rate,0),coalesce(p_vehicle_cost,0),coalesce(p_labour_cost,0),
    coalesce(v_order.customer_rate,0)-coalesce(p_vehicle_cost,0)-coalesce(p_labour_cost,0),
    v_now,v_actor
  )
  on conflict(order_id) where archived=false do update set
    vehicle_id=excluded.vehicle_id,
    driver_id=excluded.driver_id,
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
    insert into public.order_labour_assignments(
      order_id,dispatch_id,labour_id,rate_snapshot,created_by
    )
    values(
      p_order_id,v_dispatch,v_lab,
      coalesce((select rate from public.labourers where id=v_lab),0),v_actor
    );
  end loop;

  update public.vehicles set status='Busy' where id=p_vehicle_id;
  update public.drivers set status='Busy' where id=p_driver_id;
  update public.labourers set status='Busy'
    where id=any(coalesce(p_labour_ids,array[]::text[]));

  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id)
  values(
    p_order_id,'Assigned','Assignment','Resources assigned',
    jsonb_build_object('vehicle_id',p_vehicle_id,'driver_id',p_driver_id,'labour_ids',p_labour_ids),
    v_actor
  );

  return v_order;
end $$;

revoke all on function private.assign_dispatch_resources_core(text,text,text,text[],numeric,numeric) from public,anon;
grant execute on function private.assign_dispatch_resources_core(text,text,text,text[],numeric,numeric) to authenticated;

create or replace function public.assign_dispatch_resources(
  p_order_id text,
  p_vehicle_id text,
  p_driver_id text,
  p_labour_ids text[] default array[]::text[],
  p_vehicle_cost numeric default 0,
  p_labour_cost numeric default 0
)
returns public.orders
language sql
security invoker
set search_path=public,private,pg_temp
as $$
  select private.assign_dispatch_resources_core(
    p_order_id,p_vehicle_id,p_driver_id,p_labour_ids,p_vehicle_cost,p_labour_cost
  );
$$;
revoke all on function public.assign_dispatch_resources(text,text,text,text[],numeric,numeric) from public,anon;
grant execute on function public.assign_dispatch_resources(text,text,text,text[],numeric,numeric) to authenticated;

create or replace function private.confirm_dispatch_core(p_order_id text)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_dispatch public.dispatches%rowtype;
  v_job public.jobs%rowtype;
  v_now timestamptz:=now();
  v_actor uuid:=private.current_profile_id();
  v_labour_count integer;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  select * into v_order from public.orders
    where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;

  if v_order.status='Dispatched' then return v_order; end if;
  if v_order.status<>'Assigned' then
    raise exception 'Order must be Assigned before dispatch confirmation';
  end if;
  if v_order.vehicle_id is null or v_order.driver_id is null then
    raise exception 'Vehicle and driver are required';
  end if;

  select count(*) into v_labour_count
  from public.order_labour_assignments
  where order_id=p_order_id and released_at is null;

  if v_labour_count < greatest(coalesce(v_order.loading,0),coalesce(v_order.unloading,0)) then
    raise exception 'Required labour assignment is incomplete';
  end if;

  select * into v_dispatch from public.dispatches
  where order_id=p_order_id and archived=false for update;
  if not found then raise exception 'Dispatch assignment not found'; end if;

  update public.orders
    set status='Dispatched',dispatched_at=coalesce(dispatched_at,v_now),last_stage_at=v_now
    where id=p_order_id
    returning * into v_order;

  update public.dispatches
    set status='Dispatched',dispatched_at=coalesce(dispatched_at,v_now),updated_at=v_now
    where id=v_dispatch.id
    returning * into v_dispatch;

  insert into public.order_events(order_id,stage,event_type,note,actor_profile_id,created_at)
  values(p_order_id,'Dispatched','Stage','Dispatch confirmed',v_actor,v_now);

  perform private.make_slip_core(
    'DISPATCH',v_order,null,0,null,'Dispatch',
    jsonb_build_object(
      'dispatchId',v_dispatch.id,
      'driverId',v_order.driver_id,
      'vehicleId',v_order.vehicle_id,
      'labourIds',coalesce(v_order.labour_ids,'[]'::jsonb),
      'vehicleCost',coalesce(v_order.vehicle_cost,0),
      'labourCost',coalesce(v_order.labour_cost,0)
    )
  );

  select * into v_job from public.jobs where order_id=p_order_id for update;
  if not found then
    insert into public.jobs(
      id,order_id,dispatch_id,vehicle_id,driver_id,partner_id,labour_ids,status,
      payment_state,created_by,created_at,updated_at
    )
    values(
      'JOB-' || lpad(nextval('public.riksha_job_seq')::text,4,'0'),
      p_order_id,v_dispatch.id,v_order.vehicle_id,v_order.driver_id,v_order.partner_id,
      coalesce(v_order.labour_ids,'[]'::jsonb),'Dispatched','Open',v_actor,v_now,v_now
    )
    returning * into v_job;

    insert into public.job_events(job_id,event_type,status,note,actor_profile_id,created_at)
    values(v_job.id,'Created','Dispatched','Job created from confirmed dispatch',v_actor,v_now);
  else
    update public.jobs set
      dispatch_id=v_dispatch.id,
      vehicle_id=v_order.vehicle_id,
      driver_id=v_order.driver_id,
      partner_id=v_order.partner_id,
      labour_ids=coalesce(v_order.labour_ids,'[]'::jsonb),
      status='Dispatched',
      updated_at=v_now
    where id=v_job.id returning * into v_job;
  end if;

  return v_order;
end $$;

revoke all on function private.confirm_dispatch_core(text) from public,anon;
grant execute on function private.confirm_dispatch_core(text) to authenticated;

create or replace function public.confirm_dispatch(p_order_id text)
returns public.orders
language sql
security invoker
set search_path=public,private,pg_temp
as $$
  select private.confirm_dispatch_core(p_order_id);
$$;
revoke all on function public.confirm_dispatch(text) from public,anon;
grant execute on function public.confirm_dispatch(text) to authenticated;

-- Order stage core. Override is private-only; public normal wrapper rejects override=true.
create or replace function private.transition_order_status_core(
  p_order_id text,
  p_target text,
  p_note text default null,
  p_override boolean default false
)
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
  v_job public.jobs%rowtype;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  select * into v_order from public.orders
    where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;

  v_current:=coalesce(v_order.status,'New');
  v_allowed:=case v_current
    when 'New' then 'Assigned'
    when 'Assigned' then 'Dispatched'
    when 'Dispatched' then 'In Transit'
    when 'In Transit' then 'Delivered'
    when 'Delivered' then 'Completed'
    else null
  end;

  if p_target<>'Cancelled' and not p_override and p_target is distinct from v_allowed then
    raise exception 'Invalid stage transition: % -> %',v_current,p_target;
  end if;

  if p_override and not private.has_role(array['Admin','Manager']) then
    raise exception 'Override permission denied';
  end if;

  if p_target='Dispatched' and not p_override then
    raise exception 'Use confirm_dispatch for dispatch confirmation';
  end if;

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
  values(
    p_order_id,p_target,
    case when p_override then 'Override' else 'Stage' end,
    coalesce(p_note,p_target),v_actor,v_now
  );

  select * into v_job from public.jobs where order_id=p_order_id for update;

  if p_target in ('Completed','Cancelled') then
    update public.vehicles set status='Available'
      where id=v_order.vehicle_id and status='Busy';
    update public.drivers set status='Available'
      where id=v_order.driver_id and status='Busy';
    update public.labourers l set status='Available'
      where exists(
        select 1 from public.order_labour_assignments a
        where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null
      );
    update public.order_labour_assignments
      set released_at=v_now
      where order_id=p_order_id and released_at is null;

    update public.dispatches set
      status=p_target,
      completed_at=case when p_target='Completed' then v_now else completed_at end,
      updated_at=v_now
      where order_id=p_order_id and archived=false;

    if found then
      update public.jobs set
        status=p_target,
        completed_at=case when p_target='Completed' then v_now else completed_at end,
        cancelled_at=case when p_target='Cancelled' then v_now else cancelled_at end,
        updated_at=v_now
      where order_id=p_order_id;
    end if;

  elsif p_target='In Transit' then
    update public.dispatches set
      status='In Transit',
      trip_started_at=coalesce(trip_started_at,v_now),
      updated_at=v_now
      where order_id=p_order_id and archived=false;

    update public.jobs set
      status='In Transit',
      started_at=coalesce(started_at,v_now),
      updated_at=v_now
      where order_id=p_order_id;

  elsif p_target='Delivered' then
    update public.dispatches set
      status='Delivered',
      delivered_at=coalesce(delivered_at,v_now),
      updated_at=v_now
      where order_id=p_order_id and archived=false;

    update public.jobs set
      status='Delivered',
      delivered_at=coalesce(delivered_at,v_now),
      updated_at=v_now
      where order_id=p_order_id;
  end if;

  if exists(select 1 from public.jobs where order_id=p_order_id) then
    insert into public.job_events(job_id,event_type,status,note,actor_profile_id,created_at)
    select id,
           case when p_override then 'Override' else 'Stage' end,
           p_target,coalesce(p_note,p_target),v_actor,v_now
    from public.jobs where order_id=p_order_id;
  end if;

  return v_order;
end $$;

revoke all on function private.transition_order_status_core(text,text,text,boolean) from public,anon;
grant execute on function private.transition_order_status_core(text,text,text,boolean) to authenticated;

create or replace function public.transition_order_status(
  p_order_id text,p_target text,p_note text default null,p_override boolean default false
)
returns public.orders
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
begin
  if p_override then
    raise exception 'PIN override required';
  end if;
  return private.transition_order_status_core(p_order_id,p_target,p_note,false);
end $$;

revoke all on function public.transition_order_status(text,text,text,boolean) from public,anon;
grant execute on function public.transition_order_status(text,text,text,boolean) to authenticated;

-- Secure PIN setup and override transition.
create or replace function private.set_order_override_pin_core(p_pin text)
returns boolean
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_actor uuid:=private.current_profile_id();
begin
  if not private.has_role(array['Admin','Manager']) then raise exception 'Permission denied'; end if;
  if p_pin !~ '^\d{4,8}$' then raise exception 'PIN must be 4 to 8 digits'; end if;

  insert into private.order_override_credentials(singleton,pin_hash,failed_attempts,locked_until,updated_at,updated_by)
  values(true,crypt(p_pin,gen_salt('bf',10)),0,null,now(),v_actor)
  on conflict(singleton) do update set
    pin_hash=excluded.pin_hash,
    failed_attempts=0,
    locked_until=null,
    updated_at=now(),
    updated_by=v_actor;

  return true;
end $$;

revoke all on function private.set_order_override_pin_core(text) from public,anon;
grant execute on function private.set_order_override_pin_core(text) to authenticated;

create or replace function public.set_order_override_pin(p_pin text)
returns boolean
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.set_order_override_pin_core(p_pin); $$;

revoke all on function public.set_order_override_pin(text) from public,anon;
grant execute on function public.set_order_override_pin(text) to authenticated;

create or replace function private.transition_order_with_pin_core(
  p_order_id text,p_target text,p_reason text,p_pin text
)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_cred private.order_override_credentials%rowtype;
begin
  if not private.has_role(array['Admin','Manager']) then raise exception 'Permission denied'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Override reason is required';
  end if;

  select * into v_cred from private.order_override_credentials
    where singleton=true for update;
  if not found then raise exception 'Override PIN is not configured'; end if;

  if v_cred.locked_until is not null and v_cred.locked_until>now() then
    raise exception 'Override PIN is temporarily locked';
  end if;

  if crypt(coalesce(p_pin,''),v_cred.pin_hash) <> v_cred.pin_hash then
    update private.order_override_credentials set
      failed_attempts=failed_attempts+1,
      locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else null end,
      updated_at=now()
    where singleton=true;
    raise exception 'Invalid override PIN';
  end if;

  update private.order_override_credentials
    set failed_attempts=0,locked_until=null,updated_at=now()
    where singleton=true;

  return private.transition_order_status_core(
    p_order_id,p_target,'PIN override · '||btrim(p_reason),true
  );
end $$;

revoke all on function private.transition_order_with_pin_core(text,text,text,text) from public,anon;
grant execute on function private.transition_order_with_pin_core(text,text,text,text) to authenticated;

create or replace function public.transition_order_status_with_pin(
  p_order_id text,p_target text,p_reason text,p_pin text
)
returns public.orders
language sql
security invoker
set search_path=public,private,pg_temp
as $$
  select private.transition_order_with_pin_core(p_order_id,p_target,p_reason,p_pin);
$$;

revoke all on function public.transition_order_status_with_pin(text,text,text,text) from public,anon;
grant execute on function public.transition_order_status_with_pin(text,text,text,text) to authenticated;

-- Atomic transaction + receipt + payment-state/timeline update.
create or replace function private.create_financial_transaction_core(p_input jsonb)
returns public.transactions
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
  v_order public.orders%rowtype;
  v_id text;
  v_action text := nullif(btrim(coalesce(p_input->>'action_id','')),'');
  v_now timestamptz := now();
  v_actor uuid := private.current_profile_id();
  v_received numeric := 0;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  if v_action is not null then
    select * into v_tx from public.transactions where action_id=v_action limit 1;
    if found then return v_tx; end if;
  end if;

  if coalesce(nullif(p_input->>'amount','')::numeric,0)<=0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if coalesce(p_input->>'direction','') not in ('IN','OUT') then
    raise exception 'Invalid transaction direction';
  end if;

  v_id := 'TXN-' || lpad(nextval('public.riksha_txn_seq')::text,4,'0');

  insert into public.transactions(
    id,action_id,date,time,order_id,party_type,party_id,party_name,type,direction,
    amount,method,reference,note,created_by,created_at,status,archived
  )
  values(
    v_id,coalesce(v_action,gen_random_uuid()::text),
    coalesce(nullif(p_input->>'date','')::date,(v_now at time zone 'Asia/Kathmandu')::date),
    coalesce(nullif(p_input->>'time','')::time,(v_now at time zone 'Asia/Kathmandu')::time),
    nullif(p_input->>'order_id',''),
    nullif(p_input->>'party_type',''),
    nullif(p_input->>'party_id',''),
    nullif(p_input->>'party_name',''),
    nullif(p_input->>'type',''),
    p_input->>'direction',
    (p_input->>'amount')::numeric,
    coalesce(nullif(p_input->>'method',''),'Cash'),
    nullif(p_input->>'reference',''),
    nullif(p_input->>'note',''),
    v_actor,v_now,'Posted',false
  )
  returning * into v_tx;

  if v_tx.order_id is not null then
    select * into v_order from public.orders where id=v_tx.order_id for update;
    if found then
      insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
      values(
        v_order.id,v_order.status,'Payment',
        coalesce(v_tx.type,'Transaction')||' · '||v_tx.amount::text,
        jsonb_build_object('transaction_id',v_tx.id,'direction',v_tx.direction,'amount',v_tx.amount,'method',v_tx.method),
        v_actor,v_now
      );

      if v_tx.direction='IN' and coalesce(v_tx.party_type,'')='Customer' then
        select coalesce(sum(
          case
            when direction='IN' and status<>'Reversed' then amount
            when direction='OUT' and reversal_of is not null and status<>'Reversed' then -amount
            else 0
          end
        ),0)
        into v_received
        from public.transactions
        where order_id=v_order.id;

        update public.orders
          set payment=case
            when v_received>=coalesce(customer_rate,0) and coalesce(customer_rate,0)>0 then 'Paid'
            when v_received>0 then 'Partial'
            else 'Pending'
          end,
          updated_at=v_now
          where id=v_order.id
          returning * into v_order;

        perform private.make_slip_core(
          'RECEIPT',v_order,v_tx.id,v_tx.amount,v_tx.method,'Customer Payment',
          jsonb_build_object(
            'transactionId',v_tx.id,
            'totalBill',coalesce(v_order.customer_rate,0),
            'thisPayment',v_tx.amount,
            'receivedTotal',v_received
          )
        );
      end if;
    end if;
  end if;

  return v_tx;
end $$;

revoke all on function private.create_financial_transaction_core(jsonb) from public,anon;
grant execute on function private.create_financial_transaction_core(jsonb) to authenticated;

create or replace function public.create_financial_transaction(p_input jsonb)
returns public.transactions
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.create_financial_transaction_core(p_input); $$;

revoke all on function public.create_financial_transaction(jsonb) from public,anon;
grant execute on function public.create_financial_transaction(jsonb) to authenticated;

create or replace function private.reverse_financial_transaction_core(
  p_transaction_id text,
  p_note text default null
)
returns public.transactions
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_old public.transactions%rowtype;
  v_rev public.transactions%rowtype;
  v_order public.orders%rowtype;
  v_id text;
  v_now timestamptz:=now();
  v_actor uuid:=private.current_profile_id();
  v_received numeric:=0;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;

  select * into v_old from public.transactions where id=p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_old.status='Reversed' or v_old.reversed_by is not null then
    raise exception 'Transaction is already reversed';
  end if;

  v_id := 'TXN-' || lpad(nextval('public.riksha_txn_seq')::text,4,'0');

  insert into public.transactions(
    id,action_id,date,time,order_id,party_type,party_id,party_name,type,direction,
    amount,method,reference,note,created_by,created_at,status,reversal_of,archived
  )
  values(
    v_id,gen_random_uuid()::text,
    (v_now at time zone 'Asia/Kathmandu')::date,
    (v_now at time zone 'Asia/Kathmandu')::time,
    v_old.order_id,v_old.party_type,v_old.party_id,v_old.party_name,
    'Reversal · '||coalesce(v_old.type,'Transaction'),
    case when v_old.direction='IN' then 'OUT' else 'IN' end,
    v_old.amount,v_old.method,v_old.reference,
    coalesce(nullif(p_note,''),'Reversal of '||v_old.id),
    v_actor,v_now,'Posted',v_old.id,false
  )
  returning * into v_rev;

  update public.transactions
    set status='Reversed',reversed_by=v_rev.id,updated_at=v_now
    where id=v_old.id;

  update public.slips
    set status='Reversed',updated_at=v_now
    where transaction_id=v_old.id and archived=false;

  if v_old.order_id is not null then
    select * into v_order from public.orders where id=v_old.order_id for update;
    if found then
      select coalesce(sum(
        case
          when direction='IN' and status<>'Reversed' then amount
          when direction='OUT' and reversal_of is not null and status<>'Reversed' then -amount
          else 0
        end
      ),0)
      into v_received
      from public.transactions
      where order_id=v_order.id;

      update public.orders set
        payment=case
          when v_received>=coalesce(customer_rate,0) and coalesce(customer_rate,0)>0 then 'Paid'
          when v_received>0 then 'Partial'
          else 'Pending'
        end,
        updated_at=v_now
      where id=v_order.id;

      insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
      values(
        v_order.id,v_order.status,'Payment Reversal',
        'Reversed '||v_old.id,
        jsonb_build_object('original_transaction_id',v_old.id,'reversal_transaction_id',v_rev.id),
        v_actor,v_now
      );
    end if;
  end if;

  return v_rev;
end $$;

revoke all on function private.reverse_financial_transaction_core(text,text) from public,anon;
grant execute on function private.reverse_financial_transaction_core(text,text) to authenticated;

create or replace function public.reverse_financial_transaction(
  p_transaction_id text,p_note text default null
)
returns public.transactions
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.reverse_financial_transaction_core(p_transaction_id,p_note); $$;

revoke all on function public.reverse_financial_transaction(text,text) from public,anon;
grant execute on function public.reverse_financial_transaction(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Lightweight dashboard summary (no full-table browser scans)
-- ---------------------------------------------------------------------------

create or replace function public.dashboard_summary()
returns jsonb
language sql
security invoker
set search_path=public,private,pg_temp
as $$
  select jsonb_build_object(
    'leads_total',(select count(*) from public.leads where archived=false),
    'orders_total',(select count(*) from public.orders where archived=false),
    'today_orders',(select count(*) from public.orders where archived=false and (created_at at time zone 'Asia/Kathmandu')::date=(now() at time zone 'Asia/Kathmandu')::date),
    'need_dispatch',(select count(*) from public.orders where archived=false and status='New'),
    'assigned',(select count(*) from public.orders where archived=false and status='Assigned'),
    'dispatched',(select count(*) from public.orders where archived=false and status='Dispatched'),
    'in_transit',(select count(*) from public.orders where archived=false and status='In Transit'),
    'delivered',(select count(*) from public.orders where archived=false and status='Delivered'),
    'completed_today',(select count(*) from public.orders where archived=false and status='Completed' and (completed_at at time zone 'Asia/Kathmandu')::date=(now() at time zone 'Asia/Kathmandu')::date),
    'available_vehicles',(select count(*) from public.vehicles where archived=false and status='Available'),
    'vehicles_total',(select count(*) from public.vehicles where archived=false),
    'available_labour',(select count(*) from public.labourers where archived=false and status='Available'),
    'labour_total',(select count(*) from public.labourers where archived=false),
    'customers_total',(select count(*) from public.customers where archived=false),
    'receive_total',(select coalesce(sum(amount),0) from public.transactions where archived=false and direction='IN' and status<>'Reversed'),
    'pay_total',(select coalesce(sum(amount),0) from public.transactions where archived=false and direction='OUT' and status<>'Reversed' and reversal_of is null),
    'pending_receivable',(select coalesce(sum(greatest(coalesce(customer_rate,0)-coalesce((select sum(t.amount) from public.transactions t where t.order_id=o.id and t.direction='IN' and t.status<>'Reversed'),0),0)),0) from public.orders o where archived=false)
  );
$$;
revoke all on function public.dashboard_summary() from public,anon;
grant execute on function public.dashboard_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Realtime for new operational tables
-- ---------------------------------------------------------------------------

do $$ begin
  begin alter publication supabase_realtime add table public.jobs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.job_events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.locations; exception when duplicate_object then null; end;
end $$;
