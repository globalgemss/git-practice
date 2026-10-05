create table if not exists public.data_migration_issues(
  id uuid primary key default gen_random_uuid(), source_table text not null, record_id text,
  field_name text not null, raw_value text, issue text not null, resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.data_migration_issues enable row level security;
drop policy if exists migration_issues_management on public.data_migration_issues;
create policy migration_issues_management on public.data_migration_issues for all to authenticated
using(private.has_role(array['Admin','Manager'])) with check(private.has_role(array['Admin','Manager']));

insert into public.data_migration_issues(source_table,record_id,field_name,raw_value,issue)
select 'leads',id,'distance',distance,'Non-numeric legacy value normalized to NULL during React migration'
from public.leads where distance is not null and btrim(distance)<>'' and distance !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
insert into public.data_migration_issues(source_table,record_id,field_name,raw_value,issue)
select 'leads',id,'loading',loading,'Non-integer legacy value normalized to 0 during React migration'
from public.leads where loading is not null and btrim(loading)<>'' and loading !~ '^\s*-?[0-9]+\s*$';
insert into public.data_migration_issues(source_table,record_id,field_name,raw_value,issue)
select 'leads',id,'unloading',unloading,'Non-integer legacy value normalized to 0 during React migration'
from public.leads where unloading is not null and btrim(unloading)<>'' and unloading !~ '^\s*-?[0-9]+\s*$';
insert into public.data_migration_issues(source_table,record_id,field_name,raw_value,issue)
select 'orders',id,'distance',distance,'Non-numeric legacy value normalized to NULL during React migration'
from public.orders where distance is not null and btrim(distance)<>'' and distance !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
insert into public.data_migration_issues(source_table,record_id,field_name,raw_value,issue)
select 'orders',id,'loading',loading,'Non-integer legacy value normalized to 0 during React migration'
from public.orders where loading is not null and btrim(loading)<>'' and loading !~ '^\s*-?[0-9]+\s*$';
insert into public.data_migration_issues(source_table,record_id,field_name,raw_value,issue)
select 'orders',id,'unloading',unloading,'Non-integer legacy value normalized to 0 during React migration'
from public.orders where unloading is not null and btrim(unloading)<>'' and unloading !~ '^\s*-?[0-9]+\s*$';

update public.leads set distance=null where distance is not null and btrim(distance)<>'' and distance !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
update public.leads set loading='0' where loading is not null and btrim(loading)<>'' and loading !~ '^\s*-?[0-9]+\s*$';
update public.leads set unloading='0' where unloading is not null and btrim(unloading)<>'' and unloading !~ '^\s*-?[0-9]+\s*$';
update public.orders set distance=null where distance is not null and btrim(distance)<>'' and distance !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
update public.orders set loading='0' where loading is not null and btrim(loading)<>'' and loading !~ '^\s*-?[0-9]+\s*$';
update public.orders set unloading='0' where unloading is not null and btrim(unloading)<>'' and unloading !~ '^\s*-?[0-9]+\s*$';

alter table public.leads alter column distance type numeric using nullif(btrim(distance),'')::numeric;
alter table public.leads alter column loading type integer using coalesce(nullif(btrim(loading),'')::integer,0);
alter table public.leads alter column unloading type integer using coalesce(nullif(btrim(unloading),'')::integer,0);
alter table public.leads alter column loading set default 0;
alter table public.leads alter column unloading set default 0;
alter table public.orders alter column distance type numeric using nullif(btrim(distance),'')::numeric;
alter table public.orders alter column loading type integer using coalesce(nullif(btrim(loading),'')::integer,0);
alter table public.orders alter column unloading type integer using coalesce(nullif(btrim(unloading),'')::integer,0);
alter table public.orders alter column loading set default 0;
alter table public.orders alter column unloading set default 0;
alter table public.orders alter column partner_commitment type numeric using case when partner_commitment is null or btrim(partner_commitment)='' then null when partner_commitment ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then btrim(partner_commitment)::numeric else null end;