import React,{useEffect,useMemo,useRef,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {createOrderAtomic} from '../services/api'
import {money,num,todayKathmandu} from '../utils/format'
import PageTitle from '../components/PageTitle'

export default function NewOrder(){
 const nav=useNavigate(),[sp]=useSearchParams()
 const requestId=useRef(crypto.randomUUID())
 const [customers,setCustomers]=useState([]),[leads,setLeads]=useState([]),[rates,setRates]=useState([]),[types,setTypes]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [f,setF]=useState({sourceMode:'direct',leadId:'',customer_id:'',customer:'',phone:'',pickup:'Jorpati',drop:'',goods:'',vehicle_type_id:'',vehicle_type:'',distance:'',loading:0,unloading:0,date:todayKathmandu(),time:'',additional_cost:0,notes:'',customer_rate:'',payment:'Pending'})

 useEffect(()=>{
  Promise.all([
   supabase.from('customers').select('id,name,mobile,area').eq('archived',false).order('name'),
   supabase.from('leads').select('*').eq('archived',false).eq('status','Confirmed').order('created_at',{ascending:false}),
   supabase.from('rates').select('*').eq('active',true).order('sort_order'),
   supabase.from('vehicle_types').select('*').eq('active',true).eq('archived',false).order('sort_order')
  ]).then(([c,l,r,t])=>{
   if(c.error||l.error||r.error||t.error){
    setError(c.error?.message||l.error?.message||r.error?.message||t.error?.message||'Unable to load order masters.')
    return
   }
   setCustomers(c.data||[])
   setLeads(l.data||[])
   setRates(r.data||[])
   setTypes(t.data||[])
   const leadId=sp.get('lead')
   if(leadId){
    const x=(l.data||[]).find(v=>v.id===leadId)
    if(x)applyLead(x)
   }
  })
 },[])

 const applyLead=l=>setF(x=>({
  ...x,
  sourceMode:'lead',
  leadId:l.id,
  customer_id:l.customer_id||'',
  customer:l.name||'',
  phone:l.phone||'',
  pickup:l.pickup||'',
  drop:l.drop||'',
  goods:l.goods||'',
  vehicle_type_id:l.vehicle_type_id||'',
  vehicle_type:l.vehicle_type||'',
  distance:l.distance??'',
  loading:num(l.loading),
  unloading:num(l.unloading),
  date:l.preferred_date||todayKathmandu(),
  time:l.preferred_time||'',
  notes:l.notes||'',
  customer_rate:String(l.confirmed_rate||l.latest_quote||'')
 }))

 const rate=useMemo(()=>rates.find(r=>r.vehicle_type_id===f.vehicle_type_id)||rates.find(r=>r.vehicle_type===f.vehicle_type)||{},[rates,f.vehicle_type_id,f.vehicle_type])
 const suggested=useMemo(()=>Math.max(
  num(rate.min_fare),
  num(rate.customer_base||rate.customer_rate)
   +Math.max(0,num(f.distance)-num(rate.base_km))*num(rate.customer_per_km)
   +num(f.additional_cost)
   +num(f.loading)*num(rate.loading_charge)
   +num(f.unloading)*num(rate.unloading_charge)
 ),[rate,f])
 const vehicleCost=useMemo(()=>num(rate.partner_base||rate.partner_rate)+Math.max(0,num(f.distance)-num(rate.base_km))*num(rate.partner_per_km),[rate,f.distance])
 const labourCost=(num(f.loading)+num(f.unloading))*num(rate.labour_pay)
 const finalRate=num(f.customer_rate)||suggested

 const set=(k,v)=>setF(x=>({...x,[k]:v}))

 const submit=async()=>{
  if(busy)return
  if(!f.customer||!f.phone||!f.pickup||!f.drop||!f.vehicle_type){
   return setError('Customer, phone, route and vehicle type are required.')
  }
  if(f.sourceMode==='lead'&&!f.leadId){
   return setError('Choose a confirmed lead before creating the order.')
  }

  setBusy(true)
  setError('')
  try{
   const row=await createOrderAtomic({
    create_request_id:requestId.current,
    source:f.sourceMode==='lead'?'Lead':'Direct',
    source_lead_id:f.sourceMode==='lead'?f.leadId:null,
    date:f.date||null,
    time:f.time||null,
    customer_id:f.customer_id||null,
    customer:f.customer,
    phone:f.phone,
    pickup:f.pickup,
    drop:f.drop,
    goods:f.goods||null,
    vehicle_type_id:f.vehicle_type_id||null,
    vehicle_type:f.vehicle_type||null,
    distance:f.distance===''?null:num(f.distance),
    loading:num(f.loading),
    unloading:num(f.unloading),
    payment:f.payment,
    customer_rate:finalRate,
    estimated_vehicle_cost:vehicleCost,
    estimated_labour_cost:labourCost,
    additional_cost:num(f.additional_cost),
    notes:f.notes||null
   })
   nav(`/orders/${row.id}`)
  }catch(e){
   setError(e.message||'Order could not be created.')
  }finally{
   setBusy(false)
  }
 }

 return <>
  <PageTitle title="New Order" subtitle="Create booking with live customer and pricing summary"/>
  <div className="new-order-layout">
   <div className="form-stack">
    <section className="panel form-section">
     <div className="section-title"><span>1</span><h3>Customer & Route</h3></div>
     <div className="form-grid cols-2">
      <label className="field"><span>Source</span><select value={f.sourceMode} onChange={e=>set('sourceMode',e.target.value)}><option value="direct">Direct Order</option><option value="lead">From Lead</option></select></label>
      {f.sourceMode==='lead'
       ?<label className="field"><span>Select Confirmed Lead</span><select value={f.leadId} onChange={e=>{set('leadId',e.target.value);const l=leads.find(x=>x.id===e.target.value);if(l)applyLead(l)}}><option value="">Choose confirmed lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}</select></label>
       :<label className="field"><span>Existing Customer</span><select value={f.customer_id} onChange={e=>{const c=customers.find(x=>x.id===e.target.value);setF(x=>({...x,customer_id:e.target.value,customer:c?.name||x.customer,phone:c?.mobile||x.phone}))}}><option value="">New / not linked</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label className="field"><span>Customer Name *</span><input value={f.customer} onChange={e=>set('customer',e.target.value)}/></label>
      <label className="field"><span>Phone *</span><input value={f.phone} onChange={e=>set('phone',e.target.value)}/></label>
      <label className="field"><span>Pickup *</span><input value={f.pickup} onChange={e=>set('pickup',e.target.value)}/></label>
      <label className="field"><span>Drop *</span><input value={f.drop} onChange={e=>set('drop',e.target.value)}/></label>
      <label className="field span-2"><span>Goods / Load</span><input value={f.goods} onChange={e=>set('goods',e.target.value)}/></label>
     </div>
    </section>

    <section className="panel form-section">
     <div className="section-title"><span>2</span><h3>Vehicle & Labour</h3></div>
     <div className="vehicle-choices">{types.map(v=><button type="button" key={v.id} className={f.vehicle_type_id===v.id?'selected':''} onClick={()=>setF(x=>({...x,vehicle_type_id:v.id,vehicle_type:v.name}))}><b>{v.icon||'🚚'} {v.name}</b><span>{v.capacity||'Vehicle type'}</span></button>)}</div>
     <div className="form-grid cols-3 mt">
      <label className="field"><span>Approx KM</span><input type="number" min="0" value={f.distance} onChange={e=>set('distance',e.target.value)}/></label>
      <label className="field"><span>Loading Labour</span><input type="number" min="0" value={f.loading} onChange={e=>set('loading',e.target.value)}/></label>
      <label className="field"><span>Unloading Labour</span><input type="number" min="0" value={f.unloading} onChange={e=>set('unloading',e.target.value)}/></label>
      <label className="field"><span>Pickup Date</span><input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></label>
      <label className="field"><span>Pickup Time</span><input type="time" value={f.time} onChange={e=>set('time',e.target.value)}/></label>
      <label className="field"><span>Additional Cost</span><input type="number" min="0" value={f.additional_cost} onChange={e=>set('additional_cost',e.target.value)}/></label>
     </div>
    </section>

    <section className="panel form-section">
     <div className="section-title"><span>3</span><h3>Pricing & Notes</h3></div>
     <div className="form-grid cols-2">
      <label className="field"><span>Final Customer Rate (Admin Controlled)</span><input type="number" min="0" value={f.customer_rate} placeholder={String(suggested)} onChange={e=>set('customer_rate',e.target.value)}/></label>
      <label className="field"><span>Payment Status</span><select value={f.payment} onChange={e=>set('payment',e.target.value)}><option>Pending</option><option>Paid</option><option>Partial</option><option>Credit</option></select></label>
      <button type="button" className="suggest-btn" onClick={()=>set('customer_rate',String(suggested))}>Use Suggested Rate {money(suggested)}</button>
      <label className="field span-2"><span>Notes / Special Instructions</span><textarea rows="4" value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Floor, lift, fragile load, customer instructions…"/></label>
     </div>
     {error&&<div className="form-error">{error}</div>}
    </section>
   </div>

   <aside className="order-summary">
    <small className="live-preview-kicker">Live Preview</small>
    <h3>Order Summary</h3>
    <div className="summary-item"><span>👤</span><div><b>{f.customer||'Customer not selected'}</b><small>{f.phone||'Mobile number'}</small></div></div>
    <div className="summary-item"><span>📍</span><div><b>{f.pickup||'—'} → {f.drop||'—'}</b><small>{f.distance||0} KM approx.</small></div></div>
    <div className="summary-item"><span>🚚</span><div><b>{f.vehicle_type||'Vehicle not selected'}</b><small>Loading {f.loading} · Unloading {f.unloading}</small></div></div>
    <div className="preview-row"><span>Pickup</span><b>{f.date||'Not selected'} · {f.time||'—'}</b></div>
    <div className="preview-row"><span>Goods</span><b>{f.goods||'—'}</b></div>
    <div className="quote-box">
     <b>Company Rate Preview</b>
     <div><span>Suggested Customer Rate</span><strong>{money(suggested)}</strong></div>
     <div><span>Estimated Vehicle Cost</span><strong>{money(vehicleCost)}</strong></div>
     <div><span>Estimated Labour Cost</span><strong>{money(labourCost)}</strong></div>
     <div className="total"><span>Final Customer Rate</span><strong>{money(finalRate)}</strong></div>
     <div className="margin"><span>Estimated Margin</span><strong>{money(finalRate-vehicleCost-labourCost)}</strong></div>
    </div>
    <button className="primary full" onClick={submit} disabled={busy}>{busy?'Creating…':'✓ Create Order'}</button>
    <button className="outline full" onClick={()=>nav('/orders')}>Cancel</button>
   </aside>
  </div>
 </>
}
