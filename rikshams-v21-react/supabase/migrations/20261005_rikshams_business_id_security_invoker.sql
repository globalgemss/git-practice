alter function public.next_business_id(text) security invoker;
grant usage, select, update on sequence public.riksha_lead_seq to authenticated, service_role;
grant usage, select, update on sequence public.riksha_order_seq to authenticated, service_role;
grant usage, select, update on sequence public.riksha_txn_seq to authenticated, service_role;
grant usage, select, update on sequence public.riksha_slip_seq to authenticated, service_role;