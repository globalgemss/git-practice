
-- Keep PIN-based order overrides operationally consistent.

create or replace function private.transition_order_with_pin_core(
  p_order_id text,
  p_target text,
  p_reason text,
  p_pin text
)
returns public.orders
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_cred private.order_override_credentials%rowtype;
  v_order public.orders%rowtype;
  v_stages text[]:=array['New','Assigned','Dispatched','In Transit','Delivered','Completed'];
  v_current_idx integer;
  v_target_idx integer;
  v_next text;
  v_i integer;
begin
  if not private.has_role(array['Admin','Manager']) then
    raise exception 'Permission denied';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Override reason is required';
  end if;

  select * into v_cred
  from private.order_override_credentials
  where singleton=true
  for update;

  if not found then raise exception 'Override PIN is not configured'; end if;
  if v_cred.locked_until is not null and v_cred.locked_until>now() then
    raise exception 'Override PIN is temporarily locked';
  end if;

  if crypt(coalesce(p_pin,''),v_cred.pin_hash) <> v_cred.pin_hash then
    update private.order_override_credentials
    set failed_attempts=failed_attempts+1,
        locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else null end,
        updated_at=now()
    where singleton=true;
    raise exception 'Invalid override PIN';
  end if;

  update private.order_override_credentials
  set failed_attempts=0,locked_until=null,updated_at=now()
  where singleton=true;

  select * into v_order
  from public.orders
  where id=p_order_id and archived=false
  for update;

  if not found then raise exception 'Order not found'; end if;
  if p_target=v_order.status then return v_order; end if;

  if p_target='Cancelled' then
    return private.transition_order_status_core(
      p_order_id,'Cancelled','PIN override · '||btrim(p_reason),true
    );
  end if;

  v_current_idx:=array_position(v_stages,v_order.status);
  v_target_idx:=array_position(v_stages,p_target);

  if v_current_idx is null or v_target_idx is null then
    raise exception 'Unsupported override stage';
  end if;

  -- Rolling all the way back to New would require clearing assignment/payment history.
  -- Keep that as a deliberate correction workflow rather than a status-only override.
  if v_target_idx=1 and v_current_idx>1 then
    raise exception 'Cannot override back to New. Use a correction workflow instead.';
  end if;

  if v_target_idx>v_current_idx then
    for v_i in v_current_idx+1..v_target_idx loop
      v_next:=v_stages[v_i];

      if v_next='Assigned' then
        select * into v_order from public.orders where id=p_order_id;
        if v_order.vehicle_id is null or v_order.driver_id is null then
          raise exception 'Assign vehicle and driver before advancing to Assigned';
        end if;
        if (
          select count(*) from public.order_labour_assignments
          where order_id=p_order_id and released_at is null
        ) < greatest(coalesce(v_order.loading,0),coalesce(v_order.unloading,0)) then
          raise exception 'Required labour assignment is incomplete';
        end if;
        v_order:=private.transition_order_status_core(
          p_order_id,'Assigned','PIN override step · '||btrim(p_reason),true
        );

      elsif v_next='Dispatched' then
        v_order:=private.confirm_dispatch_core(p_order_id);
        insert into public.order_events(order_id,stage,event_type,note,actor_profile_id)
        values(
          p_order_id,'Dispatched','Override',
          'PIN override · '||btrim(p_reason),private.current_profile_id()
        );

      else
        v_order:=private.transition_order_status_core(
          p_order_id,v_next,'PIN override · '||btrim(p_reason),true
        );
      end if;
    end loop;
  else
    v_order:=private.transition_order_status_core(
      p_order_id,p_target,'PIN override · '||btrim(p_reason),true
    );

    if p_target in ('Assigned','Dispatched') then
      update public.dispatches
      set status=p_target,updated_at=now()
      where order_id=p_order_id and archived=false;

      update public.jobs
      set status=p_target,updated_at=now()
      where order_id=p_order_id;
    end if;

    if p_target in ('Assigned','Dispatched','In Transit','Delivered') then
      update public.vehicles set status='Busy' where id=v_order.vehicle_id;
      update public.drivers set status='Busy' where id=v_order.driver_id;
      update public.labourers l set status='Busy'
      where exists(
        select 1 from public.order_labour_assignments a
        where a.order_id=p_order_id
          and a.labour_id=l.id
          and a.released_at is null
      );
    end if;
  end if;

  return v_order;
end $$;

revoke all on function private.transition_order_with_pin_core(text,text,text,text)
from public,anon;
grant execute on function private.transition_order_with_pin_core(text,text,text,text)
to authenticated;
