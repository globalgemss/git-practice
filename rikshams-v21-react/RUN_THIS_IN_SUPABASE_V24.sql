-- RikshaMS V24 dispatch/accounting operational fixes
-- Safe additive migration. Run after the V23 production migrations.

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

  if p_target='Dispatched' then
    update public.dispatches set
      status='Dispatched',
      dispatched_at=coalesce(dispatched_at,v_now),
      updated_at=v_now
    where order_id=p_order_id and archived=false;
  elsif p_target='In Transit' then
    update public.dispatches set
      status='In Transit',
      trip_started_at=coalesce(trip_started_at,v_now),
      updated_at=v_now
    where order_id=p_order_id and archived=false;
  elsif p_target='Delivered' then
    update public.dispatches set
      status='Delivered',
      delivered_at=coalesce(delivered_at,v_now),
      updated_at=v_now
    where order_id=p_order_id and archived=false;
  elsif p_target in ('Completed','Cancelled') then
    update public.vehicles set status='Available' where id=v_order.vehicle_id and status='Busy';
    update public.drivers set status='Available' where id=v_order.driver_id and status='Busy';
    update public.labourers l set status='Available'
      where exists(select 1 from public.order_labour_assignments a where a.order_id=p_order_id and a.labour_id=l.id and a.released_at is null);
    update public.order_labour_assignments set released_at=v_now where order_id=p_order_id and released_at is null;
    update public.dispatches set
      status=p_target,
      completed_at=case when p_target='Completed' then coalesce(completed_at,v_now) else completed_at end,
      updated_at=v_now
    where order_id=p_order_id and archived=false;
  end if;
  return v_order;
end $$;

revoke all on function public.transition_order_status(text,text,text,boolean) from public;
grant execute on function public.transition_order_status(text,text,text,boolean) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.order_labour_assignments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.daybook_closings; exception when duplicate_object then null; end;
end $$;

create index if not exists idx_transactions_order_direction_status on public.transactions(order_id,direction,status) where archived=false;
create index if not exists idx_daybook_closings_date on public.daybook_closings(date);

-- Profile/workspace lookup indexes used by the modern stakeholder screens.
create index if not exists idx_orders_customer_profile on public.orders(customer_id,created_at desc) where archived=false;
create index if not exists idx_orders_driver_profile on public.orders(driver_id,created_at desc) where archived=false;
create index if not exists idx_orders_partner_profile on public.orders(partner_id,created_at desc) where archived=false;
create index if not exists idx_orders_vehicle_profile on public.orders(vehicle_id,created_at desc) where archived=false;
create index if not exists idx_vehicles_owner_profile on public.vehicles(owner_id) where archived=false;
create index if not exists idx_leads_creator_profile on public.leads(created_by_profile_id,created_at desc) where archived=false;
create index if not exists idx_transactions_party_profile on public.transactions(party_type,party_id,created_at desc) where archived=false;
create index if not exists idx_profile_notes_record on public.profile_notes(profile_type,record_id,created_at desc);
