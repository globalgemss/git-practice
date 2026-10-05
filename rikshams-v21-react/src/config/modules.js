export const adminNav=[
 ['dashboard','▦','Dashboard','/',['Admin','Manager','Staff']],
 ['leads','◎','Leads & Enquiries','/leads',['Admin','Manager','Staff']],
 ['new','＋','New Order','/orders/new',['Admin','Manager','Staff']],
 ['orders','▤','Orders','/orders',['Admin','Manager','Staff']],
 ['dispatch','➤','Dispatch','/dispatch',['Admin','Manager','Staff']],
 ['jobs','◉','Jobs','/jobs',['Admin','Manager','Staff']],
 ['fleet','🚚','Fleet & Crew','/fleet',['Admin','Manager']],
 ['customers','●','Customers','/customers',['Admin','Manager','Staff']],
 ['slips','▣','Slips','/slips',['Admin','Manager','Staff']],
 ['receivepay','रु','Receive & Pay','/receive-pay',['Admin','Manager']],
 ['daybook','◫','Day Book','/day-book',['Admin','Manager']],
 ['reports','▥','Accounts & Reports','/reports',['Admin','Manager']],
 ['publicform','↗','Direct Public Form','/public-form',['Admin','Manager']],
 ['access','🔐','User / Agent Access','/access',['Admin','Manager']],
 ['notices','🔔','Notice Center','/notices',['Admin','Manager']],
 ['settings','⚙','Admin Settings','/settings',['Admin']]
]
export const mobileNav=[
 ['dashboard','⌂','Home','/',['Admin','Manager','Staff']],
 ['leads','◎','Leads','/leads',['Admin','Manager','Staff']],
 ['new','＋','Order','/orders/new',['Admin','Manager','Staff']],
 ['orders','▤','Orders','/orders',['Admin','Manager','Staff']],
 ['dispatch','➤','Dispatch','/dispatch',['Admin','Manager','Staff']]
]
export function canUse(roles,role){return !roles||roles.includes(role)}