
create index if not exists idx_order_override_credentials_updated_by
  on private.order_override_credentials(updated_by);
create index if not exists idx_job_events_actor
  on public.job_events(actor_profile_id);
create index if not exists idx_jobs_created_by
  on public.jobs(created_by);
