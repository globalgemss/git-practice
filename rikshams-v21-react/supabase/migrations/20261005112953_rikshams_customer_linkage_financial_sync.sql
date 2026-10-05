
-- RikshaMS customer linkage and financial summary sync

create or replace function private.refresh_customer_financials(p_customer_id text)
returns void
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_orders integer:=0;
  v_total numeric:=0;
  v_received numeric:=0;
  v_last timestamptz;
begin
  if p_customer_id is null then return; end if;

  select count(*),coalesce(sum(coalesce(customer_rate,0)),0),max(created_at)
    into v_orders,v_total,v_last
  from public.orders
  where customer_id=p_customer_id and archived=false;

  select coalesce(sum(
    case
      when t.direction='IN' and t.status<>'Reversed' then t.amount
      when t.direction='OUT' and t.reversal_of is not null and t.status<>'Reversed' then -t.amount
      else 0
    end
  ),0)
    into v_received
  from public.transactions t
  join public.orders o on o.id=t.order_id
  where o.customer_id=p_customer_id and o.archived=false and t.archived=false;

  update public.customers set
    orders=v_orders,
    total=v_total,
    received=v_received,
    outstanding=greatest(v_total-v_received,0),
    last_order_at=v_last,
    updated_at=now()
  where id=p_customer_id;
end $$;

revoke all on function private.refresh_customer_financials(text) from public,anon,authenticated;

create or replace function private.sync_customer_from_order()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
begin
  if tg_op='DELETE' then
    perform private.refresh_customer_financials(old.customer_id);
    return old;
  end if;

  if tg_op='UPDATE' and old.customer_id is distinct from new.customer_id then
    perform private.refresh_customer_financials(old.customer_id);
  end if;

  perform private.refresh_customer_financials(new.customer_id);
  return new;
end $$;

create or replace function private.sync_customer_from_transaction()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_old_customer text;
  v_new_customer text;
begin
  if tg_op in ('UPDATE','DELETE') and old.order_id is not null then
    select customer_id into v_old_customer from public.orders where id=old.order_id;
    perform private.refresh_customer_financials(v_old_customer);
  end if;

  if tg_op in ('INSERT','UPDATE') and new.order_id is not null then
    select customer_id into v_new_customer from public.orders where id=new.order_id;
    if v_new_customer is distinct from v_old_customer or tg_op='INSERT' then
      perform private.refresh_customer_financials(v_new_customer);
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists trg_orders_customer_financials on public.orders;
create trigger trg_orders_customer_financials
after insert or update of customer_id,customer_rate,archived or delete
on public.orders
for each row execute function private.sync_customer_from_order();

drop trigger if exists trg_transactions_customer_financials on public.transactions;
create trigger trg_transactions_customer_financials
after insert or update of order_id,direction,amount,status,archived,reversal_of or delete
on public.transactions
for each row execute function private.sync_customer_from_transaction();

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
  v_customer_id text := nullif(btrim(coalesce(p_input->>'customer_id','')),'');
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
    v_customer_id:=coalesce(v_customer_id,v_lead.customer_id);
  end if;

  if v_customer_id is null then
    select id into v_customer_id
    from public.customers
    where archived=false
      and mobile is not null
      and regexp_replace(mobile,'\s+','','g')=regexp_replace(p_input->>'phone','\s+','','g')
    order by created_at
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers(
      name,mobile,customer_type,area,address,status,archived,created_at,updated_at
    )
    values(
      p_input->>'customer',
      p_input->>'phone',
      coalesce(nullif(p_input->>'customer_type',''),'Individual'),
      p_input->>'pickup',
      nullif(p_input->>'customer_address',''),
      'Active',false,v_now,v_now
    )
    returning id into v_customer_id;
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
    v_customer_id,
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
  values(
    v_id,'New','Created',
    case when v_lead_id is null then 'Order created' else 'Converted from '||v_lead_id end,
    v_actor,v_now
  );

  if v_lead_id is not null then
    update public.leads
      set status='Converted',converted_order_id=v_id,customer_id=v_customer_id,updated_at=v_now
      where id=v_lead_id;

    insert into public.lead_events(lead_id,event_type,note,metadata,actor_profile_id,created_at)
    values(
      v_lead_id,'Converted','Converted to Order · '||v_id,
      jsonb_build_object('order_id',v_id,'customer_id',v_customer_id),v_actor,v_now
    );
  end if;

  perform private.make_slip_core(
    'ORDER',v_order,null,coalesce(v_order.customer_rate,0),null,
    case when v_lead_id is null then 'Order Creation' else 'Lead Conversion' end,
    '{}'::jsonb
  );

  perform private.refresh_customer_financials(v_customer_id);
  return v_order;
end $$;
