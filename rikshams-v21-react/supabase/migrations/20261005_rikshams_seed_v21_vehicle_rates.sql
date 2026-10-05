insert into public.rates(vehicle_type,vehicle_type_id,code,icon,active,sort_order,customer_rate,partner_rate,driver_rate,labour_customer,labour_pay,waiting_per_hour)
select vt.name,vt.id,vt.code,vt.icon,true,vt.sort_order,0,0,0,0,0,0
from public.vehicle_types vt
where vt.name in ('Rickshaw','Hatti Gadi','Mini Truck')
  and not exists(select 1 from public.rates r where r.vehicle_type=vt.name);