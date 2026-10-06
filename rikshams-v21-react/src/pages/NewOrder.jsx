import React,{useEffect,useMemo,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {CalendarDays,Check,Clock3,MapPin,PackageOpen,Phone,Truck,UserRound,UsersRound,WalletCards} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {nextId,insertRow,ensureSlip} from '../services/api'
import {formatDate,money,num,todayKathmandu} from '../utils/format'
import PageTitle from '../components/PageTitle'
import SearchPicker from '../components/SearchPicker'
import {Field,FormNote} from '../components/FormKit'

export default function NewOrder(){
 const nav=useNavigate(),[sp]=useSearchParams()
 const [customers,setCustomers]=useState([]),[leads,setLeads]=useState([]),[rates,setRates]=useState([]),[types,setTypes]=useState([])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [f,setF]=useState({sourceMode:'direct',leadId:'',customer_id:'',customer:'',phone:'',pickup:'Jorpati',drop:'',goods:'',vehicle_type_id:'',vehicle_type:'',distance:'',loading:0,unloading:0,labour_mode:'Same Crew',waiting_hours:0,date:todayKathmandu(),time:'',additional_cost:0,notes:'',customer_rate:'',payment:'Pending'})
 const set=(k,v)=>setF(x=>({...x,[k]:v}))
 const applyLead=l=>setF(x=>({...x,sourceMode:'lead',leadId:l.id,customer_id:l.customer_id||'',customer:l.name||'',phone:l.phone||'',pickup:l.pickup||'',drop:l.drop||'',goods:l.goods||'',vehicle_type_id:l.vehicle_type_id||'',vehicle_type:l.vehicle_type||'',distance:l.distance??'',loading:num(l.loading),unloading:num(l.unloading),labour_mode:l.labour_mode||'Same Crew',date:l.preferred_date||todayKathmandu(),time:l.preferred_time||'',notes:l.notes||'',customer_rate:String(l.confirmed_rate||l.latest_quote||'')}))
 useEffect(()=>{
  Promise.all([
   supabase.from('customers').select('*').eq('archived',false).order('name'),
   supabase.from('leads').select('*').eq('archived',false).in('status',['Confirmed','Quoted','New Enquiry']).order('created_at',{ascending:false}),
   supabase.from('rates').select('*').eq('active',true).order('sort_order'),
   supabase.from('vehicle_types').select('*').eq('active',true).eq('archived',false).order('sort_order')
  ]).then(([c,l,r,t])=>{
   setCustomers(c.data||[]);setLeads(l.data||[]);setRates(r.data||[]);setTypes(t.data||[])
   const leadId=sp.get('lead');if(leadId){const x=(l.data||[]).find(v=>v.id===leadId);if(x)applyLead(x)}
  })
 },[])
 const rate=useMemo(()=>rates.find(r=>r.vehicle_type_id===f.vehicle_type_id)||rates.find(r=>r.vehicle_type===f.vehicle_type)||{},[rates,f.vehicle_type_id,f.vehicle_type])
 const suggested=useMemo(()=>Math.max(num(rate.min_fare),num(rate.customer_base||rate.customer_rate)+Math.max(0,num(f.distance)-num(rate.base_km))*num(rate.customer_per_km)+num(f.additional_cost)+num(f.loading)*num(rate.loading_charge)+num(f.unloading)*num(rate.unloading_charge)+num(f.waiting_hours)*num(rate.waiting_per_hour)),[rate,f])
 const vehicleCost=useMemo(()=>num(rate.partner_base||rate.partner_rate)+Math.max(0,num(f.distance)-num(rate.base_km))*num(rate.partner_per_km),[rate,f.distance])
 const requiredLabour=f.labour_mode==='Separate Crew'?num(f.loading)+num(f.unloading):Math.max(num(f.loading),num(f.unloading))
 const labourCost=requiredLabour*num(rate.labour_pay)
 const finalRate=num(f.customer_rate)||suggested
 const customerOptions=customers.map(c=>({value:c.id,label:c.name,sub:[c.mobile,c.address||c.area].filter(Boolean).join(' · ')}))
 const leadOptions=leads.map(l=>({value:l.id,label:`${l.id} · ${l.name}`,sub:[l.phone,l.pickup&&l.drop?`${l.pickup} → ${l.drop}`:''].filter(Boolean).join(' · ')}))
 const typeOptions=types.map(t=>({value:t.id,label:`${t.icon||'🚚'} ${t.name}`,sub:[t.capacity,t.code].filter(Boolean).join(' · '),row:t}))
 const prominentTypes=useMemo(()=>{
  const base=types.slice(0,4)
  const selected=types.find(t=>t.id===f.vehicle_type_id)
  if(selected&&!base.some(t=>t.id===selected.id))return [selected,...base.slice(0,3)]
  return base
 },[types,f.vehicle_type_id])
 const chooseType=t=>setF(x=>({...x,vehicle_type_id:t.id,vehicle_type:t.name}))
 const submit=async()=>{
  if(!f.customer||!f.phone||!f.pickup||!f.drop||!f.vehicle_type)return setError('Customer, phone, route and vehicle type are required.')
  setBusy(true);setError('')
  try{
   const id=await nextId('order')
   const row=await insertRow('orders',{id,create_request_id:crypto.randomUUID(),source:f.sourceMode==='lead'?'Lead':'Direct',source_lead_id:f.leadId||null,date:f.date||null,time:f.time||null,customer_id:f.customer_id||null,customer:f.customer,phone:f.phone,pickup:f.pickup,drop:f.drop,goods:f.goods||null,vehicle_type_id:f.vehicle_type_id||null,vehicle_type:f.vehicle_type||null,distance:f.distance===''?null:num(f.distance),loading:num(f.loading),unloading:num(f.unloading),labour_mode:f.labour_mode||'Same Crew',status:'New',payment:f.payment,customer_rate:finalRate,estimated_vehicle_cost:vehicleCost,estimated_labour_cost:labourCost,vehicle_cost:0,labour_cost:0,additional_cost:num(f.additional_cost),notes:f.notes||null,timeline:[],contact:[]})
   await insertRow('order_events',{order_id:id,stage:'New',event_type:'Created',note:'Order created',metadata:{source:f.sourceMode==='lead'?'Lead':'Direct'}})
   if(f.leadId){await supabase.from('leads').update({status:'Converted',converted_order_id:id}).eq('id',f.leadId);await insertRow('lead_events',{lead_id:f.leadId,event_type:'Converted',note:`Converted to Order · ${id}`,metadata:{order_id:id}})}
   await ensureSlip('ORDER',row,{source:'Order Created',snapshot:{loading:num(f.loading),unloading:num(f.unloading),labourMode:f.labour_mode||'Same Crew',waitingHours:num(f.waiting_hours),pickupDateTime:[f.date,f.time].filter(Boolean).join(' · '),paymentTerms:f.payment,notes:f.notes||null}})
   nav(`/orders/${id}`)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <>
  <PageTitle title="New Order" subtitle="Create directly, or bring confirmed values from a Lead / Enquiry."/>
  <div className="legacy-modern-order-shell">
   <main className="legacy-modern-order-form">
    <div className="order-source-switch" role="tablist" aria-label="Order source">
     <button type="button" className={f.sourceMode==='direct'?'active':''} onClick={()=>setF(x=>({...x,sourceMode:'direct',leadId:''}))}><b>Direct Order</b><small>Existing / confirmed customer</small></button>
     <button type="button" className={f.sourceMode==='lead'?'active':''} onClick={()=>set('sourceMode','lead')}><b>From Lead</b><small>Bring values from enquiry</small></button>
    </div>

    <OrderStep number="1" title="Customer Details" icon={<UserRound size={17}/>}>
     <div className="form-grid cols-3 order-step-grid">
      {f.sourceMode==='lead'?<Field label="Lead / Enquiry" required><SearchPicker title="Lead / Enquiry" value={f.leadId} options={leadOptions} placeholder="Select confirmed enquiry…" onChange={v=>{const l=leads.find(x=>x.id===v);if(l)applyLead(l)}}/></Field>:<Field label="Existing Customer (optional)"><SearchPicker title="Customer" value={f.customer_id} options={customerOptions} allowClear placeholder="New / Walk-in Customer" onChange={v=>{const c=customers.find(x=>x.id===v);setF(x=>({...x,customer_id:v||'',customer:c?.name||x.customer,phone:c?.mobile||x.phone}))}}/></Field>}
      <Field label="Customer Name" required><input value={f.customer} onChange={e=>set('customer',e.target.value)} placeholder="Customer / business name"/></Field>
      <Field label="Mobile Number" required><div className="input-with-icon"><Phone size={15}/><input inputMode="tel" value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="98XXXXXXXX"/></div></Field>
     </div>
    </OrderStep>

    <OrderStep number="2" title="Route & Goods" icon={<MapPin size={17}/>}>
     <div className="form-grid cols-2 order-step-grid route-row">
      <Field label="Pickup Location" required><div className="input-with-icon"><MapPin size={15}/><input value={f.pickup} onChange={e=>set('pickup',e.target.value)} placeholder="Pickup location"/></div></Field>
      <Field label="Drop Location" required><div className="input-with-icon"><MapPin size={15}/><input value={f.drop} onChange={e=>set('drop',e.target.value)} placeholder="Drop location"/></div></Field>
     </div>
     <div className="form-grid cols-3 order-step-grid mt">
      <Field label="Goods / Load" required><div className="input-with-icon"><PackageOpen size={15}/><input value={f.goods} onChange={e=>set('goods',e.target.value)} placeholder="e.g. furniture, cartons"/></div></Field>
      <Field label="Approx. Distance (KM)"><input type="number" min="0" value={f.distance} onChange={e=>set('distance',e.target.value)} placeholder="0"/></Field>
      <Field label="Vehicle Type" required><SearchPicker title="Vehicle Type" value={f.vehicle_type_id} options={typeOptions} placeholder="Select vehicle type…" onChange={(v,o)=>setF(x=>({...x,vehicle_type_id:v,vehicle_type:o?.row?.name||''}))}/></Field>
     </div>
    </OrderStep>

    <OrderStep number="3" title="Vehicle & Labour Requirement" icon={<Truck size={17}/>}>
     <div className="vehicle-choice-grid legacy-vehicle-cards">
      {prominentTypes.map(t=><button type="button" key={t.id} className={f.vehicle_type_id===t.id?'selected':''} onClick={()=>chooseType(t)}><span className="vehicle-choice-icon">{t.icon||'🚚'}</span><b>{t.name}</b><small>{t.capacity||'Set in Rate Master'}</small>{f.vehicle_type_id===t.id&&<i><Check size={13}/></i>}</button>)}
     </div>
     {types.length>prominentTypes.length&&<div className="all-type-picker"><span>Need another vehicle type?</span><SearchPicker title="All Vehicle Types" value={f.vehicle_type_id} options={typeOptions} placeholder="Search all vehicle types…" onChange={(v,o)=>setF(x=>({...x,vehicle_type_id:v,vehicle_type:o?.row?.name||''}))}/></div>}
     <div className="form-grid cols-4 order-step-grid mt">
      <Field label="Labour Mode"><select value={f.labour_mode} onChange={e=>set('labour_mode',e.target.value)}><option>Same Crew</option><option>Separate Crew</option></select></Field>
      <Field label="Loading Labour"><select value={f.loading} onChange={e=>set('loading',Number(e.target.value))}>{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} {n===1?'person':'persons'}</option>)}</select></Field>
      <Field label="Unloading Labour"><select value={f.unloading} onChange={e=>set('unloading',Number(e.target.value))}>{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} {n===1?'person':'persons'}</option>)}</select></Field>
      <Field label="Waiting (hours)"><input type="number" min="0" value={f.waiting_hours} onChange={e=>set('waiting_hours',e.target.value)}/></Field>
     </div>
     <FormNote><UsersRound size={14}/> {f.labour_mode==='Same Crew'?`Dispatch requires ${requiredLabour} labour (maximum of loading/unloading).`:`Dispatch requires ${requiredLabour} total labour as separate loading and unloading crew.`}</FormNote>
    </OrderStep>

    <OrderStep number="4" title="Schedule & Company Rate" icon={<WalletCards size={17}/>}>
     <div className="form-grid cols-3 order-step-grid">
      <Field label="Pickup Date"><div className="input-with-icon"><CalendarDays size={15}/><input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></div></Field>
      <Field label="Pickup Time"><div className="input-with-icon"><Clock3 size={15}/><input type="time" value={f.time} onChange={e=>set('time',e.target.value)}/></div></Field>
      <Field label="Extra Charge (रु)"><input type="number" min="0" value={f.additional_cost} onChange={e=>set('additional_cost',e.target.value)}/></Field>
     </div>
     <div className="form-grid cols-2 order-step-grid mt">
      <Field label="Final Customer Rate (Admin Controlled)" required><input type="number" min="0" value={f.customer_rate} placeholder={String(suggested||0)} onChange={e=>set('customer_rate',e.target.value)}/></Field>
      <Field label="Payment Terms"><select value={f.payment} onChange={e=>set('payment',e.target.value)}><option>Pending</option><option>Credit</option></select></Field>
     </div>
     <button type="button" className="suggested-rate-chip" onClick={()=>set('customer_rate',String(suggested))}>Use Suggested Rate {money(suggested)}</button><FormNote><WalletCards size={14}/> Actual advance/partial/full money is recorded after Create Order from the order-linked Receive Payment action, so a receipt and timeline entry are always created.</FormNote>
     <Field label="Notes / Special Instructions" full><textarea rows="3" value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Floor, lift, fragile load, customer instructions…"/></Field>
     {error&&<div className="form-error">{error}</div>}
    </OrderStep>
   </main>

   <aside className="legacy-order-live-preview">
    <small className="live-preview-kicker">Live Preview</small>
    <h3>Order Summary</h3>
    <div className="live-customer"><span><UserRound size={19}/></span><div><b>{f.customer||'Customer not selected'}</b><small>{f.phone||'Mobile number'}</small></div></div>
    <PreviewLine label="Route" value={`${f.pickup||'—'} → ${f.drop||'—'}`}/>
    <PreviewLine label="Distance" value={`${num(f.distance)} KM approx.`}/>
    <PreviewLine label="Goods / Load" value={f.goods||'—'}/>
    <PreviewLine label="Required Vehicle" value={`${types.find(t=>t.id===f.vehicle_type_id)?.icon||'🚚'} ${f.vehicle_type||'Not selected'}`}/>
    <PreviewLine label="Loading Labour" value={`${num(f.loading)} required`}/>
    <PreviewLine label="Unloading Labour" value={`${num(f.unloading)} required`}/>
    <PreviewLine label="Pickup" value={`${f.date?formatDate(f.date):'—'} · ${f.time||'—'}`}/>
    <div className="legacy-rate-preview">
     <b>Customer Rate</b>
     <div><span>Suggested Customer Rate</span><strong>{money(suggested)}</strong></div>
     <div><span>Final Customer Rate</span><strong>{money(finalRate)}</strong></div>
    </div>
    <PreviewLine label="Payment Terms" value={f.payment}/>
    <div className="preview-note-card"><b>Notes / Special Instructions</b><span>{f.notes||'No special instructions'}</span></div>
    <button className="primary full legacy-create-order-btn" onClick={submit} disabled={busy}>{busy?'Creating Order…':'✓ Create Order'}</button>
   </aside>
  </div>
 </>
}

function OrderStep({number,title,icon,children}){return <section className="legacy-order-step"><header><span className="step-number">{number}</span><span className="step-icon">{icon}</span><b>{title}</b></header><div className="legacy-order-step-body">{children}</div></section>}
function PreviewLine({label,value}){return <div className="legacy-preview-line"><span>{label}</span><b>{value||'—'}</b></div>}
