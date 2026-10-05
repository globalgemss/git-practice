create extension if not exists "pgcrypto";

create table if not exists public.profiles(
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete cascade,
 profile_type text not null default 'Staff',
 profile_id text unique,
 display_name text not null,
 mobile text,
 role text not null default 'Staff',
 login_token text unique,
 active boolean not null default true,
 permissions jsonb not null default '[]'::jsonb,
 last_login_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.leads(
 id text primary key, customer_id text, name text not null, phone text not null, pickup text not null, drop text not null,
 goods text, vehicle_type_id text, vehicle_type text, distance text, loading text, unloading text, preferred_date date, preferred_time time,
 source text, referral_partner_id text, referral_partner_name text, referral_code text, status text not null default 'New',
 latest_quote numeric(14,2), confirmed_rate numeric(14,2), notes text, quote_history jsonb not null default '[]'::jsonb,
 followups jsonb not null default '[]'::jsonb, timeline jsonb not null default '[]'::jsonb, converted_order_id text,
 created_by_profile_id uuid references public.profiles(id), archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.customers(
 id text primary key default ('CUS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 name text not null,mobile text,business text,area text,status text default 'Active',orders int default 0,total numeric(14,2) default 0,received numeric(14,2) default 0,outstanding numeric(14,2) default 0,last_order_at timestamptz,archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.vehicle_owners(
 id text primary key default ('OWN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),name text not null,mobile text,address text,status text default 'Active',vehicle_ids jsonb default '[]',notes text,profile_notes jsonb default '[]',archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.drivers(
 id text primary key default ('DRV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),name text not null,mobile text,address text,license_no text,status text default 'Available',vehicle_id text,notes text,profile_notes jsonb default '[]',archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.partners(
 id text primary key default ('PAR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),name text not null,mobile text,area text,type text,status text default 'Active',jobs int default 0,total_earned numeric(14,2) default 0,total_paid numeric(14,2) default 0,balance_payable numeric(14,2) default 0,notes text,profile_notes jsonb default '[]',archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.vehicles(
 id text primary key default ('VEH-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),vehicle_type_id text,type text,number text unique not null,capacity text,area text,status text default 'Available',ownership_type text,partner_id text,owner_id text references public.vehicle_owners(id),default_driver_id text references public.drivers(id),owner text,driver text,mobile text,notes text,trips int default 0,rating numeric(5,2),profile_notes jsonb default '[]',archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
alter table public.drivers drop constraint if exists drivers_vehicle_id_fkey;
alter table public.drivers add constraint drivers_vehicle_id_fkey foreign key(vehicle_id) references public.vehicles(id);

create table if not exists public.labourers(
 id text primary key default ('LAB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),name text not null,mobile text,area text,skill text,status text default 'Available',rate numeric(14,2) default 0,payment numeric(14,2) default 0,jobs int default 0,rating numeric(5,2),profile_notes jsonb default '[]',notes text,archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.referral_partners(
 id text primary key default ('REF-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),name text not null,mobile text,area text,status text default 'Active',referral_code text unique,commission_type text,commission_value numeric(14,2) default 0,total_leads int default 0,converted int default 0,earned numeric(14,2) default 0,paid numeric(14,2) default 0,notes text,profile_notes jsonb default '[]',archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.orders(
 id text primary key,create_request_id text unique,source text,source_lead_id text references public.leads(id),created_at timestamptz default now(),last_stage_at timestamptz,assigned_at timestamptz,dispatched_at timestamptz,trip_started_at timestamptz,delivered_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,date date,time time,customer_id text references public.customers(id),customer text,phone text,pickup text,drop text,goods text,vehicle_type_id text,vehicle_type text,distance text,loading text,unloading text,status text default 'New',payment text default 'Pending',customer_rate numeric(14,2) default 0,vehicle_cost numeric(14,2) default 0,labour_cost numeric(14,2) default 0,estimated_vehicle_cost numeric(14,2) default 0,estimated_labour_cost numeric(14,2) default 0,vehicle_id text references public.vehicles(id),partner_id text references public.partners(id),driver_id text references public.drivers(id),driver_name text,partner_commitment text,labour_ids jsonb default '[]',labour_commitments jsonb default '[]',settlement_status text,cancellation_charge numeric(14,2) default 0,notes text,timeline jsonb default '[]',contact jsonb default '[]',archived boolean default false,updated_at timestamptz default now()
);
create table if not exists public.transactions(
 id text primary key,action_id text unique,date date,time time,order_id text references public.orders(id),party_type text,party_id text,party_name text,type text,direction text,amount numeric(14,2) not null default 0,method text,reference text,note text,created_by uuid references public.profiles(id),created_at timestamptz default now(),status text default 'Posted',reversal_of text,reversed_by text,archived boolean default false,updated_at timestamptz default now()
);
create table if not exists public.slips(
 id text primary key,revision_request_id text,slip_no text unique not null,type text,order_id text references public.orders(id),transaction_id text references public.transactions(id),customer_id text,customer_name text,customer_phone text,vehicle_id text,partner_id text,labour_ids jsonb default '[]',created_date date,created_time time,created_at timestamptz default now(),created_by uuid references public.profiles(id),version int default 1,status text default 'Active',amount numeric(14,2) default 0,payment_method text,snapshot jsonb default '{}'::jsonb,print_count int default 0,last_printed_at timestamptz,source text,archived boolean default false,updated_at timestamptz default now()
);
create table if not exists public.daybook_closings(
 id text primary key default ('DBC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),date date unique,cash numeric(14,2) default 0,bank numeric(14,2) default 0,esewa numeric(14,2) default 0,khalti numeric(14,2) default 0,other numeric(14,2) default 0,total numeric(14,2) default 0,verified_by uuid references public.profiles(id),verified_at timestamptz,note text,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table if not exists public.notices(
 id text primary key default ('NOT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),title text not null,text text not null,audience text,profile_ids jsonb default '[]',targets jsonb default '[]',display_type text default 'Static',semantic_type text default 'info',custom_color text,text_color text,icon text,priority int default 0,start_at timestamptz,end_at timestamptz,active boolean default true,dismissible boolean default true,cta_text text,cta_action text,marquee_speed int default 8,sort_order int default 0,owner_type text default 'Admin',owner_profile_id uuid references public.profiles(id),archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now(),created_by uuid references public.profiles(id)
);
create table if not exists public.rates(id uuid primary key default gen_random_uuid(),vehicle_type text unique,customer_rate numeric(14,2) default 0,partner_rate numeric(14,2) default 0,driver_rate numeric(14,2) default 0,labour_customer numeric(14,2) default 0,labour_pay numeric(14,2) default 0,waiting_per_hour numeric(14,2) default 0,updated_at timestamptz default now());
create table if not exists public.public_forms(id uuid primary key default gen_random_uuid(),token text unique not null,owner_type text not null default 'Admin',owner_profile_id uuid references public.profiles(id),title text default 'Transport Enquiry',active boolean default true,notice text,vehicle_types jsonb default '[]',created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists public.profile_notes(id uuid primary key default gen_random_uuid(),profile_type text not null,record_id text not null,category text default 'Note',text text not null,visibility text default 'Standard',author_profile_id uuid references public.profiles(id),created_at timestamptz default now());
create table if not exists public.audit_logs(id uuid primary key default gen_random_uuid(),actor_profile_id uuid references public.profiles(id),action text not null,module text,record_id text,detail text,old_value jsonb,new_value jsonb,created_at timestamptz default now());

create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_vehicle on public.orders(vehicle_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_source on public.leads(source);
create index if not exists idx_transactions_order on public.transactions(order_id);
create index if not exists idx_notices_live on public.notices(active,archived,start_at,end_at);
