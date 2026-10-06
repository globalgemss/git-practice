-- RikshaMS V26.1.6 — Dispatch Stage Control + PIN Override
-- Additive migration after V26 / V26.1.

create extension if not exists pgcrypto;

-- Keep the override secret outside the public schema. The default PIN requested for
-- the operational stage override is 4462. Only backend functions can read this row.
create table if not exists private.dispatch_stage_override_config (
  id smallint primary key default 1 check (id=1),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

insert into private.dispatch_stage_override_config(id,pin_hash)
values(1,crypt('4462',gen_salt('bf')))
on conflict(id) do nothing;

revoke all on private.dispatch_stage_override_config from public,anon,authenticated;

-- Normal stage transitions remain sequential. Direct override=true is deliberately
-- blocked so exception moves must go through the PIN-verified RPC below.
create or replace function public.transition_order_status(
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
  v_job_id text;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  if p_override then raise exception 'Use the PIN-verified stage override action'; end if;

  select * into v_order from public.orders where id=p_order_id and archived=false for update;
  if not found then raise exception 'Order not found'; end if;
  v_current:=coalesce(v_order.status,'New');

  if p_target='Dispatched' then raise exception 'Use confirm_dispatch for dispatch confirmation'; end if;
  if p_target='Cancelled' and v_current in ('Dispatched','In Transit') then
    raise exception 'Override PIN is required to cancel after dispatch';
  end if;

  v_allowed:=case v_current
    when 'New' then 'Assigned'
    when 'Dispatched' then 'In Transit'
    when 'In Transit' then 'Delivered'
    when 'Delivered' then 'Completed'
    else null end;

  if p_target<>'Cancelled' and p_target is distinct from v_allowed then
    raise exception 'Invalid stage transition: % -> %',v_current,p_target;
  end if;

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

create or replace function public.override_order_stage_v26_1_6(
  p_order_id text,
  p_target text,
  p_reason text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_current text;
  v_from text;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
  v_hash text;
  v_current_rank int;
  v_target_rank int;
  v_job_id text;
  v_lab text;
  v_other_conflict boolean;
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Override reason is required'; end if;

  select pin_hash into v_hash from private.dispatch_stage_override_config where id=1;
  if v_hash is null or crypt(coalesce(p_pin,''),v_hash)<>v_hash then raise exception 'Invalid stage override PIN'; end if;

  if p_target not in ('New','Assigned','Dispatched','In Transit','Delivered','Completed','Cancelled') then
    raise exception 'Invalid target stage';
  end if;

  select * into v_order from public.orders where id=p_order_id and coalesce(archived,false)=false for update;
  if not found then raise exception 'Order not found'; end if;
  v_current:=coalesce(v_order.status,'New');
  v_from:=v_current;
  if v_current=p_target then return jsonb_build_object('order',to_jsonb(v_order),'changed',false); end if;

  if p_target='Cancelled' then
    if v_current in ('Delivered','Completed') then raise exception 'Delivered or completed orders cannot be cancelled. Use an amendment/reversal process.'; end if;
    update public.vehicles set status='Available',updated_at=v_now where id=v_order.vehicle_id and status in ('Reserved','Busy');
    update public.drivers set status='Available',updated_at=v_now where id=v_order.driver_id and status in ('Reserved','Busy');
    update public.labourers l set status='Available',updated_at=v_now
      where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null)
        and l.status in ('Reserved','Busy');
    update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
    update public.orders set status='Cancelled',cancelled_at=coalesce(cancelled_at,v_now),last_stage_at=v_now,updated_at=v_now where id=p_order_id returning * into v_order;
    update public.dispatches set status='Cancelled',updated_at=v_now where order_id=p_order_id and archived=false;
    update public.jobs set status='Cancelled',cancelled_at=coalesce(cancelled_at,v_now),updated_at=v_now where order_id=p_order_id and archived=false;
  else
    v_current_rank:=case v_current when 'New' then 1 when 'Assigned' then 2 when 'Dispatched' then 3 when 'In Transit' then 4 when 'Delivered' then 5 when 'Completed' then 6 else 0 end;
    v_target_rank:=case p_target when 'New' then 1 when 'Assigned' then 2 when 'Dispatched' then 3 when 'In Transit' then 4 when 'Delivered' then 5 when 'Completed' then 6 else 0 end;

    if v_current='New' and v_target_rank>1 then
      raise exception 'Assign vehicle, driver and labour first. New orders cannot jump past assignment.';
    end if;

    -- Forward jump: replay every required business action instead of only changing text status.
    if v_target_rank>v_current_rank then
      if v_current='Assigned' and v_target_rank>=3 then
        perform public.confirm_dispatch(p_order_id);
        v_current:='Dispatched';
      end if;
      if v_current='Dispatched' and v_target_rank>=4 then
        perform public.transition_order_status(p_order_id,'In Transit','Override path: trip started',false);
        v_current:='In Transit';
      end if;
      if v_current='In Transit' and v_target_rank>=5 then
        perform public.transition_order_status(p_order_id,'Delivered','Override path: delivered',false);
        v_current:='Delivered';
      end if;
      if v_current='Delivered' and v_target_rank>=6 then
        perform public.transition_order_status(p_order_id,'Completed','Override path: completed',false);
        v_current:='Completed';
      end if;
      select * into v_order from public.orders where id=p_order_id;
    else
      -- Safe reset to New is only supported from Assigned before dispatch confirmation.
      if p_target='New' then
        if v_current<>'Assigned' then raise exception 'Reset to New is only allowed from Assigned. Use an amendment for later stages.'; end if;
        update public.vehicles set status='Available',updated_at=v_now where id=v_order.vehicle_id and status='Reserved';
        update public.drivers set status='Available',updated_at=v_now where id=v_order.driver_id and status='Reserved';
        update public.labourers l set status='Available',updated_at=v_now where l.status='Reserved' and exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);
        update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
        update public.dispatches set status='Reset',archived=true,updated_at=v_now where order_id=p_order_id and archived=false;
        update public.orders set status='New',vehicle_id=null,driver_id=null,driver_name=null,partner_id=null,vehicle_cost=0,labour_cost=0,assigned_at=null,assigned_by=null,driver_override_reason=null,last_stage_at=v_now,updated_at=v_now where id=p_order_id returning * into v_order;
      elsif p_target in ('Assigned','Dispatched','In Transit') then
        if v_order.vehicle_id is null or v_order.driver_id is null then raise exception 'Historical vehicle and driver assignment is missing'; end if;

        select exists(select 1 from public.orders o where o.id<>p_order_id and coalesce(o.archived,false)=false and o.vehicle_id=v_order.vehicle_id and o.status in ('Assigned','Dispatched','In Transit')) into v_other_conflict;
        if v_other_conflict then raise exception 'Assigned vehicle is already active on another order'; end if;
        select exists(select 1 from public.orders o where o.id<>p_order_id and coalesce(o.archived,false)=false and o.driver_id=v_order.driver_id and o.status in ('Assigned','Dispatched','In Transit')) into v_other_conflict;
        if v_other_conflict then raise exception 'Assigned driver is already active on another order'; end if;
        if exists(select 1 from public.order_labour_assignments a join public.order_labour_assignments b on a.labour_id=b.labour_id and b.order_id<>p_order_id and b.released_at is null where a.order_id=p_order_id) then
          raise exception 'One or more labour resources are active on another order';
        end if;

        update public.order_labour_assignments set released_at=null where order_id=p_order_id;
        if p_target='Assigned' then
          update public.vehicles set status='Reserved',updated_at=v_now where id=v_order.vehicle_id;
          update public.drivers set status='Reserved',updated_at=v_now where id=v_order.driver_id;
          update public.labourers l set status='Reserved',updated_at=v_now where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);
        else
          update public.vehicles set status='Busy',updated_at=v_now where id=v_order.vehicle_id;
          update public.drivers set status='Busy',updated_at=v_now where id=v_order.driver_id;
          update public.labourers l set status='Busy',updated_at=v_now where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);
        end if;

        update public.orders set status=p_target,last_stage_at=v_now,updated_at=v_now where id=p_order_id returning * into v_order;
        update public.dispatches set status=p_target,updated_at=v_now where order_id=p_order_id and archived=false;
        update public.jobs set status=p_target,updated_at=v_now where order_id=p_order_id and archived=false;
      elsif p_target='Delivered' then
        update public.orders set status='Delivered',last_stage_at=v_now,updated_at=v_now where id=p_order_id returning * into v_order;
        update public.dispatches set status='Delivered',updated_at=v_now where order_id=p_order_id and archived=false;
        update public.jobs set status='Delivered',updated_at=v_now where order_id=p_order_id and archived=false;
      end if;
    end if;
  end if;

  insert into public.order_events(order_id,stage,event_type,note,metadata,actor_profile_id,created_at)
  values(p_order_id,p_target,'Stage Override',btrim(p_reason),jsonb_build_object('from',v_from,'to',p_target,'pin_verified',true),v_actor,v_now);

  select id into v_job_id from public.jobs where order_id=p_order_id and archived=false limit 1;
  if v_job_id is not null then
    insert into public.job_events(job_id,event_type,status,note,metadata,actor_profile_id,created_at)
    values(v_job_id,'Stage Override',p_target,btrim(p_reason),jsonb_build_object('pin_verified',true),v_actor,v_now);
  end if;

  return jsonb_build_object('order',to_jsonb(v_order),'changed',true,'target',p_target);
end $$;

revoke all on function public.override_order_stage_v26_1_6(text,text,text,text) from public;
grant execute on function public.override_order_stage_v26_1_6(text,text,text,text) to authenticated;
