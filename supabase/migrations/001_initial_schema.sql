create extension if not exists "pgcrypto";

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role_id uuid references public.roles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  code text unique,
  referral_slug text unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null default 'individual' check (customer_type in ('individual','corporate')),
  name text not null,
  phone text,
  alternate_phone text,
  email text,
  address text,
  status text not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.vehicle_owners(id),
  registration_no text not null unique,
  vehicle_type text,
  capacity text,
  availability_status text not null default 'available',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  alternate_phone text,
  license_no text,
  address text,
  performance_score numeric(5,2),
  discipline_score numeric(5,2),
  reliability_score numeric(5,2),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labourers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  alternate_phone text,
  address text,
  performance_score numeric(5,2),
  discipline_score numeric(5,2),
  reliability_score numeric(5,2),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  source text not null default 'direct',
  agent_id uuid references public.agents(id),
  pickup_location_id uuid references public.locations(id),
  drop_location_id uuid references public.locations(id),
  status text not null default 'new',
  follow_up_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references public.customers(id),
  lead_id uuid references public.leads(id),
  pickup_location_id uuid references public.locations(id),
  drop_location_id uuid references public.locations(id),
  pickup_at timestamptz,
  status text not null default 'new' check (status in ('new','quoted','assigned','in_transit','delivered','completed','cancelled')),
  quoted_amount numeric(14,2) not null default 0,
  final_amount numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  vehicle_id uuid references public.vehicles(id),
  driver_id uuid references public.drivers(id),
  status text not null default 'assigned',
  dispatched_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(order_id)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  dispatch_id uuid references public.dispatches(id),
  status text not null default 'assigned' check (status in ('assigned','work_started','in_progress','completed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_labourers (
  job_id uuid not null references public.jobs(id) on delete cascade,
  labourer_id uuid not null references public.labourers(id),
  assigned_at timestamptz not null default now(),
  primary key (job_id, labourer_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  payment_type text not null check (payment_type in ('receive','pay','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  payment_mode text,
  reference_no text,
  paid_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  body text not null,
  visibility text not null default 'standard',
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  display_type text not null default 'static',
  background_color text,
  text_color text,
  priority integer not null default 0,
  target_audience text not null default 'all',
  target_agent_id uuid references public.agents(id),
  target_module text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.slips (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  dispatch_id uuid references public.dispatches(id),
  payment_id uuid references public.payments(id),
  slip_type text not null check (slip_type in ('order','dispatch','receipt')),
  slip_no text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_agent on public.leads(agent_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_payments_order on public.payments(order_id);
create index if not exists idx_activity_entity on public.activity_logs(entity_type, entity_id);
