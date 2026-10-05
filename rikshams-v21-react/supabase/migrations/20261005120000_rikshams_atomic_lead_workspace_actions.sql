
-- Atomic Lead workspace actions: quote, follow-up and confirmation.

create or replace function private.add_lead_quote_core(
  p_lead_id text,
  p_amount numeric,
  p_note text default null
)
returns public.leads
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Quote amount must be greater than zero'; end if;

  select * into v_lead from public.leads
  where id=p_lead_id and archived=false for update;
  if not found then raise exception 'Lead not found'; end if;
  if v_lead.status in ('Converted','Lost','Cancelled') then
    raise exception 'Closed lead cannot be quoted';
  end if;

  insert into public.lead_quotes(lead_id,amount,note,created_by,created_at)
  values(p_lead_id,p_amount,nullif(btrim(coalesce(p_note,'')),''),v_actor,v_now);

  update public.leads
  set latest_quote=p_amount,
      status=case when status='New Enquiry' then 'Quoted' else status end,
      updated_at=v_now
  where id=p_lead_id
  returning * into v_lead;

  insert into public.lead_events(lead_id,event_type,note,metadata,actor_profile_id,created_at)
  values(
    p_lead_id,'Quote','Quote saved · '||p_amount::text,
    jsonb_build_object('amount',p_amount,'note',nullif(btrim(coalesce(p_note,'')),'')),
    v_actor,v_now
  );

  return v_lead;
end $$;

revoke all on function private.add_lead_quote_core(text,numeric,text) from public,anon;
grant execute on function private.add_lead_quote_core(text,numeric,text) to authenticated;

create or replace function public.add_lead_quote(
  p_lead_id text,p_amount numeric,p_note text default null
)
returns public.leads
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.add_lead_quote_core(p_lead_id,p_amount,p_note); $$;

revoke all on function public.add_lead_quote(text,numeric,text) from public,anon;
grant execute on function public.add_lead_quote(text,numeric,text) to authenticated;


create or replace function private.add_lead_followup_core(
  p_lead_id text,
  p_note text,
  p_channel text default null,
  p_next_followup_at timestamptz default null
)
returns public.leads
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'Follow-up note is required';
  end if;

  select * into v_lead from public.leads
  where id=p_lead_id and archived=false for update;
  if not found then raise exception 'Lead not found'; end if;
  if v_lead.status in ('Converted','Lost','Cancelled') then
    raise exception 'Closed lead cannot receive follow-up';
  end if;

  insert into public.lead_followups(
    lead_id,note,channel,next_followup_at,created_by,created_at
  )
  values(
    p_lead_id,btrim(p_note),nullif(btrim(coalesce(p_channel,'')),''),
    p_next_followup_at,v_actor,v_now
  );

  update public.leads set updated_at=v_now where id=p_lead_id
  returning * into v_lead;

  insert into public.lead_events(lead_id,event_type,note,metadata,actor_profile_id,created_at)
  values(
    p_lead_id,'Follow-up',btrim(p_note),
    jsonb_build_object('channel',p_channel,'next_followup_at',p_next_followup_at),
    v_actor,v_now
  );

  return v_lead;
end $$;

revoke all on function private.add_lead_followup_core(text,text,text,timestamptz) from public,anon;
grant execute on function private.add_lead_followup_core(text,text,text,timestamptz) to authenticated;

create or replace function public.add_lead_followup(
  p_lead_id text,p_note text,p_channel text default null,p_next_followup_at timestamptz default null
)
returns public.leads
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.add_lead_followup_core(p_lead_id,p_note,p_channel,p_next_followup_at); $$;

revoke all on function public.add_lead_followup(text,text,text,timestamptz) from public,anon;
grant execute on function public.add_lead_followup(text,text,text,timestamptz) to authenticated;


create or replace function private.confirm_lead_core(
  p_lead_id text,
  p_rate numeric,
  p_preferred_date date default null,
  p_preferred_time time default null,
  p_note text default null
)
returns public.leads
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_actor uuid:=private.current_profile_id();
  v_now timestamptz:=now();
begin
  if not private.is_internal() then raise exception 'Permission denied'; end if;
  if coalesce(p_rate,0)<=0 then raise exception 'Confirmed rate must be greater than zero'; end if;

  select * into v_lead from public.leads
  where id=p_lead_id and archived=false for update;
  if not found then raise exception 'Lead not found'; end if;
  if v_lead.status in ('Converted','Lost','Cancelled') then
    raise exception 'Closed lead cannot be confirmed';
  end if;

  update public.leads
  set confirmed_rate=p_rate,
      latest_quote=coalesce(latest_quote,p_rate),
      preferred_date=coalesce(p_preferred_date,preferred_date),
      preferred_time=coalesce(p_preferred_time,preferred_time),
      status='Confirmed',
      updated_at=v_now
  where id=p_lead_id
  returning * into v_lead;

  insert into public.lead_events(lead_id,event_type,note,metadata,actor_profile_id,created_at)
  values(
    p_lead_id,'Confirmed','Customer confirmed · '||p_rate::text,
    jsonb_build_object(
      'rate',p_rate,
      'date',p_preferred_date,
      'time',p_preferred_time,
      'note',nullif(btrim(coalesce(p_note,'')),'')
    ),
    v_actor,v_now
  );

  return v_lead;
end $$;

revoke all on function private.confirm_lead_core(text,numeric,date,time,text) from public,anon;
grant execute on function private.confirm_lead_core(text,numeric,date,time,text) to authenticated;

create or replace function public.confirm_lead(
  p_lead_id text,p_rate numeric,p_preferred_date date default null,p_preferred_time time default null,p_note text default null
)
returns public.leads
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.confirm_lead_core(p_lead_id,p_rate,p_preferred_date,p_preferred_time,p_note); $$;

revoke all on function public.confirm_lead(text,numeric,date,time,text) from public,anon;
grant execute on function public.confirm_lead(text,numeric,date,time,text) to authenticated;
