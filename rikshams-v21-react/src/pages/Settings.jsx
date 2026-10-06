import React,{useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Building2,FileText,Palette,ShieldCheck} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import PageTitle from '../components/PageTitle'
import {Field,FormSection} from '../components/FormKit'

const defaults={name:'RikshaMS',subtitle:'Transport & Labour Management',legal_name:'',address:'',phone:'',email:'',pan_vat:'',document_footer:'Thank you for choosing our transport service.',timezone:'Asia/Kathmandu',currency:'NPR'}

export default function Settings(){
 const nav=useNavigate(),{profile}=useAuth(),[company,setCompany]=useState(defaults),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{supabase.from('app_settings').select('*').eq('key','general').maybeSingle().then(({data})=>data?.value&&setCompany(x=>({...x,...data.value})))},[])
 const save=async()=>{setBusy(true);setMessage('');const {error}=await supabase.from('app_settings').upsert({key:'general',value:company,updated_by:profile?.id||null,updated_at:new Date().toISOString()},{onConflict:'key'});setMessage(error?error.message:'Settings saved. New slips will use this company identity.');setBusy(false)}
 return <>
  <PageTitle title="Admin Settings" subtitle="Application identity, professional document header and workflow settings"/>
  <div className="settings-grid modern-settings-grid">
   <section className="panel settings-form-panel">
    <FormSection title="Company Identity" description="Used across the app and on professional slips/vouchers." icon={<Building2 size={18}/>} compact><div className="form-grid cols-2"><Field label="Application / Brand Name" required><input value={company.name||''} onChange={e=>setCompany(x=>({...x,name:e.target.value}))}/></Field><Field label="Subtitle"><input value={company.subtitle||''} onChange={e=>setCompany(x=>({...x,subtitle:e.target.value}))}/></Field><Field label="Legal / Company Name" full><input value={company.legal_name||''} onChange={e=>setCompany(x=>({...x,legal_name:e.target.value}))} placeholder="Registered company name (optional)"/></Field><Field label="Address"><input value={company.address||''} onChange={e=>setCompany(x=>({...x,address:e.target.value}))}/></Field><Field label="Phone"><input value={company.phone||''} onChange={e=>setCompany(x=>({...x,phone:e.target.value}))}/></Field><Field label="Email"><input type="email" value={company.email||''} onChange={e=>setCompany(x=>({...x,email:e.target.value}))}/></Field><Field label="PAN / VAT"><input value={company.pan_vat||''} onChange={e=>setCompany(x=>({...x,pan_vat:e.target.value}))}/></Field></div></FormSection>
    <FormSection title="Document Footer" description="Shown at the bottom of Order Slip, Dispatch Slip, Money Receipt and Payment Voucher." icon={<FileText size={18}/>} compact><Field label="Footer / Customer Note" full><textarea rows="3" value={company.document_footer||''} onChange={e=>setCompany(x=>({...x,document_footer:e.target.value}))}/></Field></FormSection>
    <div className="settings-save-row"><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save Company & Document Settings'}</button>{message&&<span className={message.includes('saved')?'success-text':'danger-text'}>{message}</span>}</div>
   </section>
   <aside className="panel settings-system-panel"><div className="settings-side-icon"><Palette size={22}/></div><h3>Document Design</h3><p>V26.1 uses one professional document family for all official slips, with QR, serial number, original/reprint indicator and print tracking.</p><div className="setting-row"><span>Frontend</span><b>React + Vite</b></div><div className="setting-row"><span>Database</span><b>Supabase PostgreSQL</b></div><div className="setting-row"><span>Business Timezone</span><b>{company.timezone}</b></div><div className="setting-row"><span>Currency</span><b>{company.currency}</b></div><button className="outline full" onClick={()=>nav('/audit')}><ShieldCheck size={16}/> Open Audit History</button></aside>
  </div>
 </>
}
