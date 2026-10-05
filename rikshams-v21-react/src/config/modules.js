export const orderStages=['New','Quoted','Assigned','Dispatched','In Transit','Delivered','Completed','Cancelled'];
export const nav=[
['dashboard','▦','Dashboard'],['leads','◎','Leads & Enquiries'],['new','＋','New Order'],['orders','▤','Orders'],['dispatch','➤','Dispatch'],['fleet','🚚','Fleet & Crew'],['customers','●','Customers'],['slips','▣','Slips'],['receivepay','रु','Receive & Pay'],['daybook','◫','Day Book'],['reports','▥','Accounts & Reports'],['publicform','↗','Direct Public Form'],['access','🔐','User / Agent Access'],['notices','🔔','Notice Center'],['settings','⚙','Admin Settings']
];
const f=(key,label,type='text',options)=>({key,label,type,options});
export const modules={
 leads:{table:'leads',title:'Leads & Enquiries',search:['id','name','phone','pickup','drop','source','status'],fields:[
  f('name','Customer Name'),f('phone','Phone'),f('pickup','Pickup'),f('drop','Drop'),f('goods','Goods'),f('vehicle_type','Vehicle Type'),
  f('distance','Distance'),f('loading','Loading'),f('unloading','Unloading'),f('preferred_date','Preferred Date','date'),f('preferred_time','Preferred Time','time'),
  f('source','Source'),f('referral_partner_name','Referral Partner'),f('referral_code','Referral Code'),f('status','Status','select',['New','Follow-up','Quoted','Confirmed','Converted','Lost']),
  f('latest_quote','Latest Quote','number'),f('confirmed_rate','Confirmed Rate','number'),f('notes','Notes','textarea')
 ]},
 vehicles:{table:'vehicles',title:'Vehicles',search:['id','number','type','area','owner','driver','mobile','status'],fields:[
  f('type','Vehicle Type'),f('number','Vehicle Number'),f('capacity','Capacity'),f('area','Area'),f('status','Status','select',['Available','Busy','Maintenance','Inactive']),
  f('ownership_type','Ownership Type'),f('owner','Owner'),f('driver','Driver'),f('mobile','Mobile'),f('rating','Rating','number'),f('notes','Notes','textarea')
 ]},
 labour:{table:'labourers',title:'Labour',search:['id','name','mobile','area','skill','status'],fields:[
  f('name','Name'),f('mobile','Mobile'),f('area','Area'),f('skill','Skill'),f('status','Status','select',['Available','Busy','Off-duty','Inactive']),
  f('rate','Rate','number'),f('payment','Payment','number'),f('jobs','Jobs','number'),f('rating','Rating','number'),f('notes','Notes','textarea')
 ]},
 customers:{table:'customers',title:'Customers',search:['id','name','mobile','business','area','status'],fields:[
  f('name','Name'),f('mobile','Mobile'),f('business','Business'),f('area','Area'),f('status','Status','select',['Active','Inactive']),
  f('orders','Orders','number'),f('total','Total Business','number'),f('received','Received','number'),f('outstanding','Outstanding','number'),f('last_order_at','Last Order','datetime-local')
 ]},
 partners:{table:'partners',title:'Partners',search:['id','name','mobile','area','type','status'],fields:[
  f('name','Name'),f('mobile','Mobile'),f('area','Area'),f('type','Type'),f('status','Status','select',['Active','Inactive']),f('jobs','Jobs','number'),
  f('total_earned','Total Earned','number'),f('total_paid','Total Paid','number'),f('balance_payable','Balance Payable','number'),f('notes','Notes','textarea')
 ]},
 vehicleOwners:{table:'vehicle_owners',title:'Vehicle Owners',search:['id','name','mobile','address','status'],fields:[
  f('name','Name'),f('mobile','Mobile'),f('address','Address','textarea'),f('status','Status','select',['Active','Inactive']),f('notes','Notes','textarea')
 ]},
 drivers:{table:'drivers',title:'Drivers',search:['id','name','mobile','license_no','status'],fields:[
  f('name','Name'),f('mobile','Mobile'),f('address','Address','textarea'),f('license_no','License No.'),f('status','Status','select',['Available','Busy','Off-duty','Inactive']),f('notes','Notes','textarea')
 ]},
 referralPartners:{table:'referral_partners',title:'Referral Partners',search:['id','name','mobile','area','referral_code','status'],fields:[
  f('name','Name'),f('mobile','Mobile'),f('area','Area'),f('status','Status','select',['Active','Inactive']),f('referral_code','Referral Code'),
  f('commission_type','Commission Type'),f('commission_value','Commission Value','number'),f('total_leads','Total Leads','number'),f('converted','Converted','number'),
  f('earned','Earned','number'),f('paid','Paid','number'),f('notes','Notes','textarea')
 ]},
 notices:{table:'notices',title:'Notice Center',search:['title','text','audience','display_type','semantic_type'],fields:[
  f('title','Title'),f('text','Notice Text','textarea'),f('audience','Audience'),f('display_type','Display Type','select',['Static','Marquee','Banner']),
  f('semantic_type','Semantic Type','select',['info','success','warning','danger']),f('custom_color','Background Color','color'),f('text_color','Text Color','color'),
  f('icon','Icon'),f('priority','Priority','number'),f('start_at','Start','datetime-local'),f('end_at','End','datetime-local'),f('cta_text','CTA Text'),f('cta_action','CTA Action'),
  f('marquee_speed','Marquee Speed','number'),f('sort_order','Sort Order','number')
 ]}
};