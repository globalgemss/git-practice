import { supabase } from '../lib/supabase'
import { num } from '../utils/format'

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

export async function archiveRow(table,id){return updateRow(table,id,{archived:true})}

export async function transitionOrder(orderId,target,note='',override=false){
  const {data,error}=await supabase.rpc('transition_order_status',{p_order_id:orderId,p_target:target,p_note:note||null,p_override:override})
  if(error)throw error
  return data
}

export async function assignResources({orderId,vehicleId,driverId,labourIds,vehicleCost,labourCost,driverOverrideReason=''}){
  const {data,error}=await supabase.rpc('assign_dispatch_resources_v26',{
    p_order_id:orderId,
    p_vehicle_id:vehicleId,
    p_driver_id:driverId||null,
    p_labour_ids:labourIds||[],
    p_vehicle_cost:num(vehicleCost),
    p_labour_cost:num(labourCost),
    p_driver_override_reason:driverOverrideReason||null
  })
  if(error)throw error
  return data
}


export async function updateOrderControlled(orderId,changes,{reason=null,resetAssignment=false}={}){
  const {data,error}=await supabase.rpc('update_order_controlled_v26_1',{
    p_order_id:orderId,
    p_changes:changes||{},
    p_reason:reason||null,
    p_reset_assignment:!!resetAssignment
  })
  if(error)throw error
  return data
}

export async function addOrderAmendment(orderId,reason,note=''){
  const {data,error}=await supabase.rpc('add_order_amendment_v26_1',{
    p_order_id:orderId,
    p_reason:reason,
    p_note:note||null
  })
  if(error)throw error
  return data
}


export async function overrideOrderStage(orderId,target,reason,pin){
  const {data,error}=await supabase.rpc('override_order_stage_v26_1_6',{
    p_order_id:orderId,
    p_target:target,
    p_reason:reason,
    p_pin:String(pin||'')
  })
  if(error)throw error
  return data
}

export async function confirmDispatch(orderId){
  const {data,error}=await supabase.rpc('confirm_dispatch',{p_order_id:orderId})
  if(error)throw error
  return data
}

const transactionSlipTypes=new Set(['RECEIPT','PAYMENT_VOUCHER'])
export async function ensureSlip(type,order,extra={}){
  const transactionId=extra.transactionId||extra.snapshot?.transactionId||null
  const orderId=order?.id||extra.orderId||null
  let q=supabase.from('slips').select('*').eq('type',type).eq('archived',false).order('created_at',{ascending:false}).limit(1)
  if(transactionSlipTypes.has(type)&&transactionId)q=q.eq('transaction_id',transactionId)
  else if(orderId)q=q.eq('order_id',orderId)
  else q=q.eq('id','__no_existing_slip__')
  const {data:existing,error:lookupError}=await q
  if(lookupError)throw lookupError
  if(existing?.length)return existing[0]

  const id=await nextId('slip'),now=new Date(),date=now.toISOString().slice(0,10),time=now.toTimeString().slice(0,8)
  const suffix=String(id).replace(/\D/g,'').slice(-4)||String(Date.now()).slice(-4)
  const cleanOrder=String(orderId||'GENERAL').replace(/\D/g,'')||String(orderId||'GENERAL').replace(/[^A-Za-z0-9]/g,'')
  const no=type==='ORDER'
    ?`OS-${cleanOrder}-01`
    :type==='DISPATCH'
      ?`DS-${cleanOrder}-01`
      :type==='PAYMENT_VOUCHER'
        ?`PV-${date.replaceAll('-','')}-${suffix}`
        :`RCP-${date.replaceAll('-','')}-${suffix}`
  const snap={
    orderId,
    customerName:order?.customer||'',
    customerPhone:order?.phone||'',
    pickup:order?.pickup||'',
    drop:order?.drop||'',
    goods:order?.goods||'',
    vehicleType:order?.vehicle_type||'',
    loading:num(order?.loading),
    unloading:num(order?.unloading),
    labourMode:order?.labour_mode||'Same Crew',
    pickupDateTime:[order?.date,order?.time].filter(Boolean).join(' · '),
    paymentTerms:order?.payment||'Pending',
    notes:order?.notes||'',
    customerRate:num(order?.customer_rate),
    orderStatus:order?.status||'',
    ...extra.snapshot
  }
  return insertRow('slips',{
    id,slip_no:no,type,order_id:orderId,transaction_id:transactionId,
    customer_id:order?.customer_id||null,
    customer_name:extra.customerName||order?.customer||extra.partyName||'',
    customer_phone:extra.customerPhone||order?.phone||'',
    vehicle_id:order?.vehicle_id||extra.vehicleId||null,
    partner_id:order?.partner_id||extra.partnerId||null,
    labour_ids:extra.labourIds||[],
    created_date:date,created_time:time,created_at:now.toISOString(),
    status:'Current',amount:transactionSlipTypes.has(type)?num(extra.amount):type==='ORDER'?num(order?.customer_rate):0,
    payment_method:extra.paymentMethod||null,snapshot:snap,source:extra.source||'System'
  })
}

export async function createTransaction(payload){
  const id=await nextId('transaction'),now=new Date(),row={
    id,
    action_id:payload.action_id||crypto.randomUUID(),
    date:payload.date||now.toISOString().slice(0,10),
    time:payload.time||now.toTimeString().slice(0,8),
    order_id:payload.order_id||null,
    party_type:payload.party_type||null,
    party_id:payload.party_id||null,
    party_name:payload.party_name||null,
    type:payload.type||null,
    direction:payload.direction,
    amount:num(payload.amount),
    method:payload.method||'Cash',
    reference:payload.reference||null,
    note:payload.note||null,
    status:payload.status||'Posted',
    reversal_of:payload.reversal_of||null,
    reversed_by:payload.reversed_by||null,
    created_by:payload.created_by||null
  }
  return insertRow('transactions',row)
}
