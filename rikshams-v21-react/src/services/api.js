import {supabase} from '../lib/supabase'
import {num} from '../utils/format'

export async function nextId(kind){
 const {data,error}=await supabase.rpc('next_business_id',{p_kind:kind})
 if(error)throw error
 return data
}

export async function insertRow(table,row){
 const {data,error}=await supabase.from(table).insert(row).select().single()
 if(error)throw error
 return data
}

export async function updateRow(table,id,changes){
 const {data,error}=await supabase.from(table).update(changes).eq('id',id).select().single()
 if(error)throw error
 return data
}

export async function archiveRow(table,id){
 return updateRow(table,id,{archived:true})
}

export async function addLeadQuote(leadId,amount,note=''){
 const {data,error}=await supabase.rpc('add_lead_quote',{
  p_lead_id:leadId,
  p_amount:num(amount),
  p_note:note||null
 })
 if(error)throw error
 return data
}

export async function addLeadFollowup(leadId,note,channel=null,nextFollowupAt=null){
 const {data,error}=await supabase.rpc('add_lead_followup',{
  p_lead_id:leadId,
  p_note:note,
  p_channel:channel||null,
  p_next_followup_at:nextFollowupAt||null
 })
 if(error)throw error
 return data
}

export async function confirmLead(leadId,rate,preferredDate=null,preferredTime=null,note=''){
 const {data,error}=await supabase.rpc('confirm_lead',{
  p_lead_id:leadId,
  p_rate:num(rate),
  p_preferred_date:preferredDate||null,
  p_preferred_time:preferredTime||null,
  p_note:note||null
 })
 if(error)throw error
 return data
}

export async function createOrderAtomic(input){
 const payload={
  ...input,
  create_request_id:input.create_request_id||input.requestId||crypto.randomUUID(),
  loading:num(input.loading),
  unloading:num(input.unloading),
  customer_rate:num(input.customer_rate),
  estimated_vehicle_cost:num(input.estimated_vehicle_cost),
  estimated_labour_cost:num(input.estimated_labour_cost),
  additional_cost:num(input.additional_cost)
 }
 const {data,error}=await supabase.rpc('create_order_atomic',{p_input:payload})
 if(error)throw error
 return data
}

export async function transitionOrder(orderId,target,note='',override=false){
 if(override)throw new Error('Status override must use the secure PIN override action.')
 const {data,error}=await supabase.rpc('transition_order_status',{
  p_order_id:orderId,
  p_target:target,
  p_note:note||null,
  p_override:false
 })
 if(error)throw error
 return data
}

export async function transitionOrderWithPin(orderId,target,reason,pin){
 const {data,error}=await supabase.rpc('transition_order_status_with_pin',{
  p_order_id:orderId,
  p_target:target,
  p_reason:reason,
  p_pin:String(pin||'')
 })
 if(error)throw error
 return data
}

export async function setOrderOverridePin(pin){
 const {data,error}=await supabase.rpc('set_order_override_pin',{p_pin:String(pin||'')})
 if(error)throw error
 return data
}

export async function assignResources({orderId,vehicleId,driverId,labourIds,vehicleCost,labourCost}){
 const {data,error}=await supabase.rpc('assign_dispatch_resources',{
  p_order_id:orderId,
  p_vehicle_id:vehicleId,
  p_driver_id:driverId,
  p_labour_ids:labourIds||[],
  p_vehicle_cost:num(vehicleCost),
  p_labour_cost:num(labourCost)
 })
 if(error)throw error
 return data
}

export async function confirmDispatch(orderId){
 const {data,error}=await supabase.rpc('confirm_dispatch',{p_order_id:orderId})
 if(error)throw error
 return data
}

export async function ensureSlip(type,order,extra={}){
 const transactionId=extra.transactionId||extra.snapshot?.transactionId||null
 let q=supabase.from('slips').select('*').eq('type',type).eq('archived',false).order('created_at',{ascending:false}).limit(1)
 q=type==='RECEIPT'&&transactionId?q.eq('transaction_id',transactionId):q.eq('order_id',order.id)
 const {data:existing,error:lookupError}=await q
 if(lookupError)throw lookupError
 if(existing?.length)return existing[0]

 // Compatibility fallback for manual/revision workflows. Critical create/dispatch/payment
 // flows now create slips atomically in PostgreSQL.
 const id=await nextId('slip')
 const now=new Date()
 const date=now.toISOString().slice(0,10)
 const time=now.toTimeString().slice(0,8)
 const suffix=String(id).replace(/\D/g,'').slice(-4)||String(Date.now()).slice(-4)
 const no=type==='ORDER'
  ?`OS-${order.id.replace(/\D/g,'')||order.id}-01`
  :type==='DISPATCH'
   ?`DS-${order.id.replace(/\D/g,'')||order.id}-01`
   :`RCP-${date.replaceAll('-','')}-${suffix}`
 const snap={
  orderId:order.id,
  customerName:order.customer,
  customerPhone:order.phone,
  pickup:order.pickup,
  drop:order.drop,
  goods:order.goods,
  vehicleType:order.vehicle_type,
  customerRate:num(order.customer_rate),
  orderStatus:order.status,
  ...extra.snapshot
 }
 return insertRow('slips',{
  id,
  slip_no:no,
  type,
  order_id:order.id,
  transaction_id:transactionId,
  customer_id:order.customer_id||null,
  customer_name:order.customer||'',
  customer_phone:order.phone||'',
  vehicle_id:order.vehicle_id||null,
  partner_id:order.partner_id||null,
  labour_ids:extra.labourIds||[],
  created_date:date,
  created_time:time,
  created_at:now.toISOString(),
  status:'Current',
  amount:type==='RECEIPT'?num(extra.amount):type==='ORDER'?num(order.customer_rate):0,
  payment_method:extra.paymentMethod||null,
  snapshot:snap,
  source:extra.source||'System'
 })
}

export async function createTransaction(payload){
 const input={
  ...payload,
  action_id:payload.action_id||crypto.randomUUID(),
  amount:num(payload.amount)
 }
 const {data,error}=await supabase.rpc('create_financial_transaction',{p_input:input})
 if(error)throw error
 return data
}

export async function reverseTransaction(transactionId,note=''){
 const {data,error}=await supabase.rpc('reverse_financial_transaction',{
  p_transaction_id:transactionId,
  p_note:note||null
 })
 if(error)throw error
 return data
}

export async function getDashboardSummary(){
 const {data,error}=await supabase.rpc('dashboard_summary')
 if(error)throw error
 return data||{}
}
