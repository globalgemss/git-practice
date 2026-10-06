insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rikshams-documents','rikshams-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists rikshams_documents_internal_select on storage.objects;
drop policy if exists rikshams_documents_internal_insert on storage.objects;
drop policy if exists rikshams_documents_internal_update on storage.objects;
drop policy if exists rikshams_documents_internal_delete on storage.objects;
create policy rikshams_documents_internal_select on storage.objects for select to authenticated using(bucket_id='rikshams-documents' and private.is_internal());
create policy rikshams_documents_internal_insert on storage.objects for insert to authenticated with check(bucket_id='rikshams-documents' and private.is_internal());
create policy rikshams_documents_internal_update on storage.objects for update to authenticated using(bucket_id='rikshams-documents' and private.is_internal()) with check(bucket_id='rikshams-documents' and private.is_internal());
create policy rikshams_documents_internal_delete on storage.objects for delete to authenticated using(bucket_id='rikshams-documents' and private.has_role(array['Admin','Manager']));

drop policy if exists vehicle_types_read_auth on public.vehicle_types;
create policy vehicle_types_read_auth on public.vehicle_types for select to authenticated using(active=true and archived=false);

drop policy if exists notices_select_auth on public.notices;
create policy notices_select_auth on public.notices for select to authenticated using(
  private.is_internal() or owner_profile_id=private.current_profile_id() or (
    archived=false and active=true and coalesce(owner_type,'Admin')='Admin' and (
      coalesce(audience,'All Agents') <> 'Selected Agents'
      or coalesce(profile_ids,'[]'::jsonb) ? coalesce(private.current_profile_id()::text,'')
    )
  )
);

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='audit_dispatches') then
    create trigger audit_dispatches after insert or update or delete on public.dispatches for each row execute function private.audit_row_change();
  end if;
  if not exists(select 1 from pg_trigger where tgname='audit_vehicle_types') then
    create trigger audit_vehicle_types after insert or update or delete on public.vehicle_types for each row execute function private.audit_row_change();
  end if;
end $$;

create index if not exists idx_vehicles_status_type on public.vehicles(status,vehicle_type_id) where archived=false;
create index if not exists idx_drivers_status on public.drivers(status) where archived=false;
create index if not exists idx_labourers_status_area on public.labourers(status,area) where archived=false;
create index if not exists idx_transactions_date_direction on public.transactions(date,direction) where archived=false;
create index if not exists idx_leads_created_at on public.leads(created_at desc) where archived=false;
create index if not exists idx_orders_updated_at on public.orders(updated_at desc) where archived=false;
create index if not exists idx_public_forms_token_active on public.public_forms(token,active);

do $$ begin
  begin alter publication supabase_realtime add table public.vehicle_types; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.slips; exception when duplicate_object then null; end;
end $$;

-- Seed V21 default rate rows for dynamic vehicle types
insert into public.rates(vehicle_type,vehicle_type_id,code,icon,active,sort_order,customer_rate,partner_rate,driver_rate,labour_customer,labour_pay,waiting_per_hour)
select vt.name,vt.id,vt.code,vt.icon,true,vt.sort_order,0,0,0,0,0,0
from public.vehicle_types vt
where vt.name in ('Rickshaw','Hatti Gadi','Mini Truck')
  and not exists(select 1 from public.rates r where r.vehicle_type=vt.name);
