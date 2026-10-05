import { supabase } from '../lib/supabase'
import { num } from '../utils/format'
export async function nextId(kind){const {data,error}=await supabase.rpc('next_business_id',{p_kind:kind});if(error)throw error;return data}
export async function insertRow(table,row){const {data,error}=await supabase.from(table).insert(row).select().single();if(error)throw error;return data}
export async function updateRow(table,id,changes){const {data,error}=await supabase.from(table).update(changes).eq('id',id).select().single();if(error)throw error;return data}
export async function archiveRow(table,id){return updateRow(table,id,{archived:true})}
export async function transitionOrder(orderId,target,note='',override=false){const {data,error}=await supabase.rpc('transition_order_status',{p_order_id:orderId,p_target:target,p_note:note||null,p_override:override});if(error)throw error;return data}
export async function assignResources({orderId,vehicleId,driverId,labourIds,vehicleCost,labourCost}){const {data,error}=await supabase.rpc('assign_dispatch_resources',{p_order_id:orderId,p_vehicle_id:vehicleId,p_driver_id:driverId,p_labour_ids:labourIds||[],p_vehicle_cost:num(vehicleCost),p_labour_cost:num(labourCost)});if(error)throw error;return data}
export async function ensureSlip(type,order,extra={}){
 const transactionId=extra.transactionId||extra.snapshot?.transactionId||null
 let q=supabase.from('slips').select('*').eq('type',type).eq('archived',false).order('created_at',{ascending:false}).limit(1)
 q=type==='RECEIPT'&&transactionId?q.eq('transaction_id',transactionId):q.eq('order_id',order.id)
 const {data:existing,error:lookupError}=await q;if(lookupError)throw lookupError;if(existing?.length)return existing[0]
 const id=await nextId('slip'),now=new Date(),date=now.toISOString().slice(0,10),time=now.toTimeString().slice(0,8)
 const suffix=String(id).replace(/\D/g,'').slice(-4)||String(Date.now()).slice(-4)
 const no=type==='ORDER'?`OS-${order.id.replace(/\D/g,'')||order.id}-01`:type==='DISPATCH'?`DS-${order.id.replace(/\D/g,'')||order.id}-01`:`RCP-${date.replaceAll('-','')}-${suffix}`
 const snap={orderId:order.id,customerName:order.customer,customerPhone:order.phone,pickup:order.pickup,drop:order.drop,goods:order.goods,vehicleType:order.vehicle_type,customerRate:num(order.customer_rate),orderStatus:order.status,...extra.snapshot}
 return insertRow('slips',{id,slip_no:no,type,order_id:order.id,transaction_id:transactionId,customer_id:order.customer_id||null,customer_name:order.customer||'',customer_phone:order.phone||'',vehicle_id:order.vehicle_id||null,partner_id:order.partner_id||null,labour_ids:extra.labourIds||[],created_date:date,created_time:time,created_at:now.toISOString(),status:'Current',amount:type==='RECEIPT'?num(extra.amount):type==='ORDER'?num(order.customer_rate):0,payment_method:extra.paymentMethod||null,snapshot:snap,source:extra.source||'System'})
}
export async function createTransaction(payload){const id=await nextId('transaction');const now=new Date(),row={id,action_id:payload.action_id||crypto.randomUUID(),date:payload.date||now.toISOString().slice(0,10),time:payload.time||now.toTimeString().slice(0,8),order_id:payload.order_id||null,party_type:payload.party_type||null,party_id:payload.party_id||null,party_name:payload.party_name||null,type:payload.type||null,direction:payload.direction,amount:num(payload.amount),method:payload.method||'Cash',reference:payload.reference||null,note:payload.note||null,status:payload.status||'Posted',reversal_of:payload.reversal_of||null,reversed_by:payload.reversed_by||null,created_by:payload.created_by||null};return insertRow('transactions',row)}