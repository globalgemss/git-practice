-- RikshaMS V26.1.10 — Classic Dispatch Assignment Flow
-- Enables classic Vehicle -> Trip Driver -> Labour assignment while keeping reservation/confirmation safeguards.

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
  v_driver_id:=coalesce(nullif(p_driver_id,''),v_default_driver);
  if v_driver_id is null then
    raise exception 'Select a trip driver before saving the assignment';
  end if;

  -- If a regular/default driver exists, choosing another driver is a trip override and needs a reason.
  -- If the vehicle has no regular driver yet, an available trip driver may still be selected for this order.
  if v_default_driver is not null and v_driver_id is distinct from v_default_driver
     and nullif(btrim(coalesce(p_driver_override_reason,'')),'') is null then
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
    driver_override_reason=case when v_default_driver is not null and v_driver_id is distinct from v_default_driver then btrim(p_driver_override_reason) else null end,
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
    p_order_id,p_vehicle_id,v_driver_id,v_default_driver,(v_default_driver is not null and v_driver_id is distinct from v_default_driver),
    case when v_default_driver is not null and v_driver_id is distinct from v_default_driver then btrim(p_driver_override_reason) else null end,
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
    'driver_override',(v_default_driver is not null and v_driver_id is distinct from v_default_driver),'driver_override_reason',p_driver_override_reason,
    'labour_ids',coalesce(to_jsonb(p_labour_ids),'[]'::jsonb)
  ),v_actor,v_now);

  return v_order;
end $$;

revoke all on function public.assign_dispatch_resources_v26(text,text,text,text[],numeric,numeric,text) from public;
grant execute on function public.assign_dispatch_resources_v26(text,text,text,text[],numeric,numeric,text) to authenticated;



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
  select * into v_driver from public.drivers where id=v_order.driver_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Assigned driver not found'; end if;

  if v_vehicle.default_driver_id is not null
     and v_order.driver_id is distinct from v_vehicle.default_driver_id
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
    driver_is_override=(v_vehicle.default_driver_id is not null and v_order.driver_id is distinct from v_vehicle.default_driver_id),
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
        'defaultDriverId',v_vehicle.default_driver_id,'driverOverride',(v_vehicle.default_driver_id is not null and v_order.driver_id is distinct from v_vehicle.default_driver_id),
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
