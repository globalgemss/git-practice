import React,{useEffect,useState} from 'react'
import {Clock3,MapPin,PackageCheck,Phone,Truck,UserRound} from 'lucide-react'
import {useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import NoticeRenderer from '../components/NoticeRenderer'

const blank={name:'',phone:'',pickup:'',drop:'',goods:'',vehicle_type_id:'',vehicle_type:'',preferred_date:'',preferred_time:'',notes:''}
const defaults={show_goods:true,show_vehicle:true,show_schedule:true,show_notes:false,require_goods:false,require_vehicle:false}

export default function PublicLead(){
 const {token}=useParams()
 const [form,setForm]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[done,setDone]=useState(null),[showDoneDetails,setShowDoneDetails]=useState(false),[busy,setBusy]=useState(false),[f,setF]=useState(blank)
 const load=async()=>{setLoading(true);setError('');try{const cached=sessionStorage.getItem(`public:${token}`);if(cached)try{setForm(JSON.parse(cached))}catch{}const {data,error}=await supabase.functions.invoke('public-form-config',{body:{token}});if(error)throw error;if(!data?.success)throw new Error(data?.message||'Form unavailable');setForm(data.form);sessionStorage.setItem(`public:${token}`,JSON.stringify(data.form))}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[token])
 const set=(k,v)=>setF(x=>({...x,[k]:v}))
 const settings={...defaults,...(form?.settings||{})}
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{const {data,error}=await supabase.functions.invoke('public-lead-submit',{body:{token,input:f}});if(error)throw error;if(!data?.success)throw new Error(data?.message||'Unable to submit');setDone(data);setShowDoneDetails(false);setF(blank)}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(loading&&!form)return <div className="public-page"><div className="public-card skeleton-card">Loading enquiry form…</div></div>
 if(error&&!form)return <div className="public-page"><div className="public-card"><div className="public-brand">🛺 <b>RikshaMS</b></div><h2>Form unavailable</h2><p>{error}</p></div></div>
 if(done)return <div className="public-page"><div className="public-card success-card"><div className="success-icon">✓</div><h1>Enquiry Submitted</h1><p>{done.message||form?.success_message||'Thank you. Your enquiry has been received.'}</p><div className="lead-id-box"><small>Lead ID</small><b>{done.leadId}</b></div>{done.duplicate&&<p>{done.message}</p>}{done.lead&&<><button className="outline full" onClick={()=>setShowDoneDetails(v=>!v)}>{showDoneDetails?'Hide Submitted Details':'View Submitted Details'}</button>{showDoneDetails&&<div className="submitted-detail-card"><div><small>Customer</small><b>{done.lead.name}</b></div><div><small>Phone</small><b>{done.lead.phone}</b></div><div><small>Route</small><b>{done.lead.pickup} → {done.lead.drop}</b></div><div><small>Goods</small><b>{done.lead.goods||'—'}</b></div><div><small>Vehicle</small><b>{done.lead.vehicle_type||'Not Decided'}</b></div></div>}</>}<button className="primary full" onClick={()=>{setDone(null);setShowDoneDetails(false)}}>Add Another Lead</button></div></div>
 return <div className="public-page v25-public-page"><div className="public-card public-form-shell v25-public-shell">
  <div className="public-brand"><div>🛺</div><div><b>RikshaMS</b><small>Transport Management</small></div></div>
  <div className="public-form-head"><span className="public-kicker">TRANSPORT ENQUIRY</span><h1>{form?.title||'Transport Enquiry'}</h1>{form?.subtitle&&<h3>{form.subtitle}</h3>}{form?.intro_text&&<p>{form.intro_text}</p>}{form?.owner_display_name&&<div className="public-referral"><UserRound size={15}/><span>Referral: <b>{form.owner_display_name}</b></span></div>}{form?.location_label&&<div className="public-location"><MapPin size={15}/>{form.location_label}</div>}</div>
  <NoticeRenderer notices={form?.notices||[]} limit={3}/>{form?.notice&&!(form?.notices||[]).length?<div className="legacy-notice">{form.notice}</div>:null}
  <form onSubmit={submit} className="public-lead-form v25-public-form">
   <div className="public-field-grid"><label className="field modern-field"><span className="field-label"><UserRound size={14}/> Full Name *</span><input required autoComplete="name" value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Your full name"/></label><label className="field modern-field"><span className="field-label"><Phone size={14}/> Phone *</span><input required inputMode="tel" autoComplete="tel" value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="98XXXXXXXX"/></label></div>
   <div className="public-route-block"><div className="public-route-line"/><label className="field modern-field"><span className="field-label"><MapPin size={14}/> Pickup *</span><input required value={f.pickup} onChange={e=>set('pickup',e.target.value)} placeholder="Pickup location"/></label><label className="field modern-field"><span className="field-label"><MapPin size={14}/> Drop *</span><input required value={f.drop} onChange={e=>set('drop',e.target.value)} placeholder="Destination"/></label></div>
   {settings.show_goods&&<label className="field modern-field"><span className="field-label"><PackageCheck size={14}/> Goods / Load {settings.require_goods?'*':''}</span><input required={!!settings.require_goods} value={f.goods} onChange={e=>set('goods',e.target.value)} placeholder="Furniture, boxes, construction material…"/></label>}
   {settings.show_vehicle&&<label className="field modern-field"><span className="field-label"><Truck size={14}/> Vehicle Type {settings.require_vehicle?'*':''}</span><select required={!!settings.require_vehicle} value={f.vehicle_type_id} onChange={e=>{const v=(form?.vehicle_types||[]).find(x=>x.id===e.target.value);setF(x=>({...x,vehicle_type_id:e.target.value,vehicle_type:v?.name||''}))}}><option value="">Not Decided</option>{(form?.vehicle_types||[]).map(v=><option key={v.id} value={v.id}>{v.icon||'🚚'} {v.name}</option>)}</select></label>}
   {settings.show_schedule&&<div className="form-grid cols-2"><label className="field modern-field"><span className="field-label"><Clock3 size={14}/> Preferred Date</span><input type="date" value={f.preferred_date} onChange={e=>set('preferred_date',e.target.value)}/></label><label className="field modern-field"><span className="field-label">Preferred Time</span><input type="time" value={f.preferred_time} onChange={e=>set('preferred_time',e.target.value)}/></label></div>}
   {settings.show_notes&&<label className="field modern-field"><span className="field-label">Additional Notes</span><textarea rows="3" value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Floor, lift, fragile items or other instructions…"/></label>}
   {error&&<div className="form-error">{error}</div>}
   <button className="primary full public-submit" disabled={busy}>{busy?'Submitting…':(form?.submit_label||'Submit Enquiry')}</button>
  </form>
  <small className="public-foot">Fast, secure enquiry powered by RikshaMS</small>
 </div></div>
}
