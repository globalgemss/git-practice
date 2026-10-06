-- RikshaMS V26.1 — Controlled Order Editing + Audit
-- Additive migration after V26. Safe for existing V26 data.

create or replace function public.update_order_controlled_v26_1(
  p_order_id text,
  p_changes jsonb,
  p_reason text default null,
  p_reset_assignment boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_vehicle public.vehicles%rowtype;
  v_new_vehicle_type_id text;
  v_new_vehicle_type text;
  v_new_loading integer;
  v_new_unloading integer;
  v_new_labour_mode text;
  v_required integer;
  v_lab_count integer;
  v_rate numeric;
  v_received numeric;
  v_operational_change boolean:=false;
  v_resource_change boolean:=false;
  v_route_change boolean:=false;
  v_rate_change boolean:=false;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' then raise exception 'Invalid order changes'; end if;

  select * into v_order from public.orders where id=p_order_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Order not found'; end if;
  if coalesce(v_order.status,'New') in ('Delivered','Completed','Cancelled') then
    raise exception 'This order is locked. Use timeline/amendment notes after delivery or completion.';
  end if;

  v_before:=to_jsonb(v_order);
  v_new_vehicle_type_id:=case when p_changes ? 'vehicle_type_id' then nullif(p_changes->>'vehicle_type_id','') else v_order.vehicle_type_id end;
  v_new_vehicle_type:=case when p_changes ? 'vehicle_type' then nullif(p_changes->>'vehicle_type','') else v_order.vehicle_type end;
  v_new_loading:=case when p_changes ? 'loading' then greatest(0,coalesce((p_changes->>'loading')::integer,0)) else coalesce(v_order.loading,0) end;
  v_new_unloading:=case when p_changes ? 'unloading' then greatest(0,coalesce((p_changes->>'unloading')::integer,0)) else coalesce(v_order.unloading,0) end;
  v_new_labour_mode:=case when p_changes ? 'labour_mode' then coalesce(nullif(p_changes->>'labour_mode',''),'Same Crew') else coalesce(v_order.labour_mode,'Same Crew') end;
  v_rate:=case when p_changes ? 'customer_rate' then greatest(0,coalesce((p_changes->>'customer_rate')::numeric,0)) else coalesce(v_order.customer_rate,0) end;

  v_resource_change := v_new_vehicle_type_id is distinct from v_order.vehicle_type_id
    or v_new_vehicle_type is distinct from v_order.vehicle_type
    or v_new_loading is distinct from coalesce(v_order.loading,0)
    or v_new_unloading is distinct from coalesce(v_order.unloading,0)
    or v_new_labour_mode is distinct from coalesce(v_order.labour_mode,'Same Crew');
  v_route_change := (case when p_changes?'pickup' then nullif(p_changes->>'pickup','') else v_order.pickup end) is distinct from v_order.pickup
    or (case when p_changes?'drop' then nullif(p_changes->>'drop','') else v_order.drop end) is distinct from v_order.drop;
  v_rate_change := v_rate is distinct from coalesce(v_order.customer_rate,0);
  v_operational_change := v_resource_change or v_route_change
    or (case when p_changes?'date' then nullif(p_changes->>'date','')::date else v_order.date end) is distinct from v_order.date
    or (case when p_changes?'time' then nullif(p_changes->>'time','')::time else v_order.time end) is distinct from v_order.time;

  if v_order.status in ('Dispatched','In Transit') then
    if v_reason is null then raise exception 'Reason is required after dispatch confirmation'; end if;
    if v_resource_change then raise exception 'Vehicle type and labour requirement are locked after dispatch confirmation'; end if;
    if v_order.status='In Transit' then
      if (case when p_changes?'pickup' then nullif(p_changes->>'pickup','') else v_order.pickup end) is distinct from v_order.pickup then
        raise exception 'Pickup cannot be changed while the trip is In Transit';
      end if;
      if (case when p_changes?'date' then nullif(p_changes->>'date','')::date else v_order.date end) is distinct from v_order.date
         or (case when p_changes?'time' then nullif(p_changes->>'time','')::time else v_order.time end) is distinct from v_order.time then
        raise exception 'Pickup schedule cannot be changed while the trip is In Transit';
      end if;
    end if;
  end if;

  if v_rate_change then
    select coalesce(sum(case when direction='IN' and coalesce(status,'Posted')<>'Reversed' then amount else 0 end),0)
      into v_received from public.transactions where order_id=p_order_id and coalesce(archived,false)=false;
    if v_received>0 and v_reason is null then raise exception 'Reason is required because payments already exist for this order'; end if;
    if v_received>v_rate then raise exception 'Customer rate cannot be lower than amount already received'; end if;
  end if;

  if v_order.status='Assigned' and v_resource_change and not p_reset_assignment then
    if v_order.vehicle_id is not null then
      select * into v_vehicle from public.vehicles where id=v_order.vehicle_id and coalesce(archived,false)=false;
      if found and not (
        (v_new_vehicle_type_id is not null and v_vehicle.vehicle_type_id=v_new_vehicle_type_id)
        or (v_new_vehicle_type_id is null and lower(coalesce(v_vehicle.type,''))=lower(coalesce(v_new_vehicle_type,'')))
      ) then raise exception 'Current vehicle is not compatible with the updated vehicle type. Reset assignment and save.'; end if;
    end if;
    v_required:=case when v_new_labour_mode='Separate Crew' then v_new_loading+v_new_unloading else greatest(v_new_loading,v_new_unloading) end;
    select count(*)::int into v_lab_count from public.order_labour_assignments where order_id=p_order_id and released_at is null;
    if v_lab_count<v_required then raise exception 'Current labour assignment is insufficient. Reset assignment and save.'; end if;
  end if;

  if p_reset_assignment and v_order.status<>'Assigned' then raise exception 'Assignment reset is available only while the order is Assigned'; end if;

  update public.orders set
    customer=case when p_changes?'customer' then coalesce(nullif(p_changes->>'customer',''),customer) else customer end,
    phone=case when p_changes?'phone' then coalesce(nullif(p_changes->>'phone',''),phone) else phone end,
    pickup=case when p_changes?'pickup' then coalesce(nullif(p_changes->>'pickup',''),pickup) else pickup end,
    drop=case when p_changes?'drop' then coalesce(nullif(p_changes->>'drop',''),drop) else drop end,
    goods=case when p_changes?'goods' then nullif(p_changes->>'goods','') else goods end,
    vehicle_type_id=v_new_vehicle_type_id,
    vehicle_type=v_new_vehicle_type,
    distance=case when p_changes?'distance' then nullif(p_changes->>'distance','')::numeric else distance end,
    loading=v_new_loading,
    unloading=v_new_unloading,
    labour_mode=v_new_labour_mode,
    date=case when p_changes?'date' then nullif(p_changes->>'date','')::date else date end,
    time=case when p_changes?'time' then nullif(p_changes->>'time','')::time else time end,
    customer_rate=v_rate,
    payment=case when p_changes?'payment' then coalesce(nullif(p_changes->>'payment',''),payment) else payment end,
    additional_cost=case when p_changes?'additional_cost' then greatest(0,coalesce((p_changes->>'additional_cost')::numeric,0)) else additional_cost end,
    notes=case when p_changes?'notes' then nullif(p_changes->>'notes','') else notes end,
    updated_at=v_now
  where id=p_order_id returning * into v_order;

  if p_reset_assignment then
    update public.vehicles set status='Available',updated_at=v_now where id=v_order.vehicle_id and status='Reserved';
    update public.drivers set status='Available',updated_at=v_now where id=v_order.driver_id and status='Reserved';
    update public.labourers l set status='Available',updated_at=v_now
      where l.status='Reserved' and exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);
    update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
    update public.dispatches set status='Reset',archived=true,updated_at=v_now where order_id=p_order_id and archived=false;
    update public.orders set status='New',vehicle_id=null,driver_id=null,driver_name=null,partner_id=null,vehicle_cost=0,labour_cost=0,
      assigned_at=null,assigned_by=null,driver_override_reason=null,last_stage_at=v_now,updated_at=v_now
      where id=p_order_id returning * into v_order;
  end if;

  v_after:=to_jsonb(v_order);
  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
  values(
    p_order_id,v_order.status,
    case when p_reset_assignment then 'Order Edited + Assignment Reset' when v_order.status in ('Dispatched','In Transit') then 'Post-Dispatch Amendment' else 'Order Edited' end,
    coalesce(v_reason,case when p_reset_assignment then 'Order updated and resource assignment reset' else 'Order information updated' end),
    jsonb_build_object('before',v_before,'after',v_after,'reason',v_reason,'reset_assignment',p_reset_assignment,'resource_change',v_resource_change,'route_change',v_route_change,'rate_change',v_rate_change),
    v_actor,v_now
  );

  return jsonb_build_object('order',to_jsonb(v_order),'reset_assignment',p_reset_assignment,'resource_change',v_resource_change,'route_change',v_route_change,'rate_change',v_rate_change);
end $$;

revoke all on function public.update_order_controlled_v26_1(text,jsonb,text,boolean) from public;
grant execute on function public.update_order_controlled_v26_1(text,jsonb,text,boolean) to authenticated;

-- Locked-order amendment notes preserve the original delivered/completed order.
create table if not exists public.order_amendments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  reason text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_order_amendments_order on public.order_amendments(order_id,created_at desc);
alter table public.order_amendments enable row level security;
drop policy if exists order_amendments_internal_all on public.order_amendments;
create policy order_amendments_internal_all on public.order_amendments for all to authenticated
using ((select private.is_internal())) with check ((select private.is_internal()));

create or replace function public.add_order_amendment_v26_1(p_order_id text,p_reason text,p_note text default null)
returns public.order_amendments
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_row public.order_amendments%rowtype;
  v_actor uuid:=private.current_profile_id();
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  select * into v_order from public.orders where id=p_order_id and coalesce(archived,false)=false;
  if not found then raise exception 'Order not found'; end if;
  if coalesce(v_order.status,'') not in ('Delivered','Completed') then raise exception 'Amendment notes are for delivered/completed locked orders'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Amendment reason is required'; end if;

  insert into public.order_amendments(order_id,reason,note,created_by)
  values(p_order_id,btrim(p_reason),nullif(btrim(coalesce(p_note,'')),''),v_actor)
  returning * into v_row;

  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
  values(p_order_id,v_order.status,'Order Amendment',btrim(p_reason),jsonb_build_object('amendment_id',v_row.id,'details',v_row.note),v_actor,v_row.created_at);
  return v_row;
end $$;

revoke all on function public.add_order_amendment_v26_1(text,text,text) from public;
grant execute on function public.add_order_amendment_v26_1(text,text,text) to authenticated;
