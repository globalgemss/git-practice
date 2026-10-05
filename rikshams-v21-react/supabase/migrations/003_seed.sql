insert into public.public_forms(token,owner_type,title,active) values('DIRECT','Admin','Transport Enquiry',true) on conflict(token) do nothing;
insert into public.rates(vehicle_type,customer_rate,partner_rate,driver_rate,labour_customer,labour_pay,waiting_per_hour) values
('Tata Ace',0,0,0,0,0,0),('Pickup',0,0,0,0,0,0),('Truck',0,0,0,0,0,0)
on conflict(vehicle_type) do nothing;
