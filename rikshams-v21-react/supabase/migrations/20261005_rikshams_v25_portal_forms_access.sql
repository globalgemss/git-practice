-- RikshaMS V25 Modern Forms + Portal Access Upgrade
-- Additive migration. Run after V24 migrations.

alter table public.profiles add column if not exists linked_entity_type text;
alter table public.profiles add column if not exists linked_entity_id text;

alter table public.referral_partners add column if not exists access_profile_id uuid references public.profiles(id) on delete set null;
create unique index if not exists ux_referral_partners_access_profile
  on public.referral_partners(access_profile_id)
  where access_profile_id is not null and archived=false;
create index if not exists idx_profiles_linked_entity
  on public.profiles(linked_entity_type,linked_entity_id)
  where linked_entity_id is not null;

alter table public.public_forms add column if not exists subtitle text;
alter table public.public_forms add column if not exists intro_text text;
alter table public.public_forms add column if not exists location_label text;
alter table public.public_forms add column if not exists submit_label text default 'Submit Enquiry';
alter table public.public_forms add column if not exists success_message text default 'Thank you. Your enquiry has been received.';
alter table public.public_forms add column if not exists settings jsonb not null default '{"show_goods":true,"show_vehicle":true,"show_schedule":true,"show_notes":false,"require_goods":false,"require_vehicle":false}'::jsonb;
alter table public.public_forms add column if not exists published_at timestamptz;

update public.public_forms
set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object(
  'show_goods', coalesce((settings->>'show_goods')::boolean,true),
  'show_vehicle', coalesce((settings->>'show_vehicle')::boolean,true),
  'show_schedule', coalesce((settings->>'show_schedule')::boolean,true),
  'show_notes', coalesce((settings->>'show_notes')::boolean,false),
  'require_goods', coalesce((settings->>'require_goods')::boolean,false),
  'require_vehicle', coalesce((settings->>'require_vehicle')::boolean,false)
)
where settings is null or settings='{}'::jsonb;

create index if not exists idx_public_forms_owner_profile on public.public_forms(owner_profile_id);
create index if not exists idx_public_forms_token_active on public.public_forms(token,active);

-- Allow an Agent/Portal user to view the referral partner record linked to that profile.
drop policy if exists referral_partner_self_select on public.referral_partners;
create policy referral_partner_self_select on public.referral_partners
for select to authenticated
using (
  access_profile_id = private.current_profile_id()
);

-- Keep portal access scoped to the user's own public form.
drop policy if exists public_forms_auth on public.public_forms;
create policy public_forms_auth on public.public_forms
for all to authenticated
using (
  private.has_role(array['Admin','Manager'])
  or owner_profile_id = private.current_profile_id()
)
with check (
  private.has_role(array['Admin','Manager'])
  or owner_profile_id = private.current_profile_id()
);

-- Agent lead access already keys off created_by_profile_id. Keep it explicit and safe.
drop policy if exists lead_agent_select on public.leads;
create policy lead_agent_select on public.leads
for select to authenticated
using (
  private.is_internal()
  or created_by_profile_id = private.current_profile_id()
);

-- Helpful indexes for agent/referral reporting.
create index if not exists idx_leads_referral_partner on public.leads(referral_partner_id,created_at desc) where archived=false;
create index if not exists idx_leads_referral_code on public.leads(referral_code,created_at desc) where archived=false;

-- Backfill linkage when an old referral code already equals a portal token.
-- If duplicate referral codes exist, link only the oldest matching referral record.
with matches as (
  select rp.id as referral_id,p.id as profile_id,
         row_number() over(partition by p.id order by rp.created_at nulls last,rp.id) as rn
  from public.referral_partners rp
  join public.profiles p
    on p.role='Agent'
   and p.login_token is not null
   and rp.referral_code is not null
   and upper(rp.referral_code)=upper(p.login_token)
  where rp.access_profile_id is null and coalesce(rp.archived,false)=false
)
update public.referral_partners rp
set access_profile_id=m.profile_id,
    updated_at=now()
from matches m
where rp.id=m.referral_id and m.rn=1;

update public.profiles p
set linked_entity_type='referral_partner',
    linked_entity_id=rp.id,
    updated_at=now()
from public.referral_partners rp
where rp.access_profile_id=p.id
  and (p.linked_entity_id is null or p.linked_entity_id<>rp.id);

-- Realtime surfaces used by the V25 portal.
do $$ begin
  begin alter publication supabase_realtime add table public.public_forms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.referral_partners; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profile_notes; exception when duplicate_object then null; end;
end $$;

-- Portal users may record timeline events only for their own leads.
drop policy if exists lead_events_portal_select on public.lead_events;
create policy lead_events_portal_select on public.lead_events
for select to authenticated
using (
  private.is_internal()
  or actor_profile_id = private.current_profile_id()
  or exists (
    select 1 from public.leads l
    where l.id=lead_events.lead_id
      and l.created_by_profile_id=private.current_profile_id()
  )
);

drop policy if exists lead_events_portal_insert on public.lead_events;
create policy lead_events_portal_insert on public.lead_events
for insert to authenticated
with check (
  private.is_internal()
  or (
    actor_profile_id = private.current_profile_id()
    and exists (
      select 1 from public.leads l
      where l.id=lead_events.lead_id
        and l.created_by_profile_id=private.current_profile_id()
    )
  )
);

-- Portal users may manage follow-ups only for leads owned by their profile.
drop policy if exists lead_followups_portal_select on public.lead_followups;
create policy lead_followups_portal_select on public.lead_followups
for select to authenticated
using (
  private.is_internal()
  or exists (
    select 1 from public.leads l
    where l.id=lead_followups.lead_id
      and l.created_by_profile_id=private.current_profile_id()
  )
);

drop policy if exists lead_followups_portal_insert on public.lead_followups;
create policy lead_followups_portal_insert on public.lead_followups
for insert to authenticated
with check (
  private.is_internal()
  or (
    created_by=private.current_profile_id()
    and exists (
      select 1 from public.leads l
      where l.id=lead_followups.lead_id
        and l.created_by_profile_id=private.current_profile_id()
    )
  )
);
