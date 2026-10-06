import React,{useEffect,useState} from 'react'
import QRCode from 'qrcode'
import {useNavigate,useParams} from 'react-router-dom'
import {BriefcaseBusiness,ExternalLink,FileText,KeyRound,Link2,NotebookPen,ReceiptText,ShieldCheck,Star,TrendingUp,UsersRound} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import {insertRow,updateRow} from '../services/api'
import {formatDateTime,initials,money,num} from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import Timeline from '../components/Timeline'
import EmptyState from '../components/EmptyState'

const tableMap={customer:'customers',driver:'drivers',labour:'labourers',owner:'vehicle_owners',partner:'partners',vehicle:'vehicles',agent:'profiles'}
const partyMap={customer:'Customer',driver:'Driver',labour:'Labour',owner:'Vehicle Owner',partner:'Partner',agent:'Agent'}
const titleMap={customer:'Customer',driver:'Driver',labour:'Labour',owner:'Vehicle Owner',partner:'Transport Partner',vehicle:'Vehicle',agent:'Agent'}

export default function Profile(){
 const {type,id}=useParams(),table=tableMap[type],nav=useNavigate(),{profile}=useAuth()
 const [entity,setEntity]=useState(null),[notes,setNotes]=useState([]),[orders,setOrders]=useState([]),[txns,setTxns]=useState([]),[docs,setDocs]=useState([]),[leads,setLeads]=useState([]),[vehicles,setVehicles]=useState([]),[publicForm,setPublicForm]=useState(null),[linkedPartner,setLinkedPartner]=useState(null),[portalQr,setPortalQr]=useState(''),[publicQr,setPublicQr]=useState('')
 const [tab,setTab]=useState('overview'),[note,setNote]=useState(''),[category,setCategory]=useState('General'),[loading,setLoading]=useState(true),[uploading,setUploading]=useState(false),[error,setError]=useState('')
 const load=async()=>{
  if(!table){setLoading(false);return}
  setLoading(true);setError('')
  try{
   const [e,n,d]=await Promise.all([
    supabase.from(table).select('*').eq('id',id).maybeSingle(),
    supabase.from('profile_notes').select('*').eq('profile_type',type).eq('record_id',id).order('created_at',{ascending:false}),
    supabase.from('attachments').select('*').eq('entity_type',type).eq('entity_id',id).eq('archived',false).order('created_at',{ascending:false})
   ])
   if(e.error)throw e.error
   setEntity(e.data);setNotes(n.data||[]);setDocs(d.data||[])

   let relatedOrders=[],relatedLeads=[],relatedVehicles=[]
   if(type==='customer'){
    const q=await supabase.from('orders').select('*').eq('customer_id',id).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]
   }else if(type==='driver'){
    const q=await supabase.from('orders').select('*').eq('driver_id',id).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]
   }else if(type==='partner'){
    const q=await supabase.from('orders').select('*').eq('partner_id',id).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]
   }else if(type==='vehicle'){
    const q=await supabase.from('orders').select('*').eq('vehicle_id',id).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]
   }else if(type==='labour'){
    const a=await supabase.from('order_labour_assignments').select('order_id').eq('labour_id',id);if(a.error)throw a.error
    const ids=[...new Set((a.data||[]).map(x=>x.order_id).filter(Boolean))]
    if(ids.length){const q=await supabase.from('orders').select('*').in('id',ids).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]}
   }else if(type==='owner'){
    const v=await supabase.from('vehicles').select('*').eq('owner_id',id).eq('archived',false).order('number');if(v.error)throw v.error;relatedVehicles=v.data||[]
    const ids=relatedVehicles.map(x=>x.id).filter(Boolean)
    if(ids.length){const q=await supabase.from('orders').select('*').in('vehicle_id',ids).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]}
   }else if(type==='agent'){
    const l=await supabase.from('leads').select('*').eq('created_by_profile_id',id).eq('archived',false).order('created_at',{ascending:false});if(l.error)throw l.error;relatedLeads=l.data||[]
    const ids=[...new Set(relatedLeads.map(x=>x.converted_order_id).filter(Boolean))]
    if(ids.length){const q=await supabase.from('orders').select('*').in('id',ids).order('created_at',{ascending:false});if(q.error)throw q.error;relatedOrders=q.data||[]}
    const pf=await supabase.from('public_forms').select('*').eq('owner_profile_id',id).maybeSingle();if(pf.error)throw pf.error;setPublicForm(pf.data||null)
    const rp=await supabase.from('referral_partners').select('*').eq('access_profile_id',id).maybeSingle();if(rp.error)throw rp.error;setLinkedPartner(rp.data||null)
    if(e.data?.login_token){
      const portalUrl=`${location.origin}/agent-login/${e.data.login_token}`,publicUrl=`${location.origin}/public/${e.data.login_token}`
      QRCode.toDataURL(portalUrl,{width:220,margin:1}).then(setPortalQr).catch(()=>{})
      QRCode.toDataURL(publicUrl,{width:220,margin:1}).then(setPublicQr).catch(()=>{})
    }
   }
   setOrders(relatedOrders);setLeads(relatedLeads);setVehicles(relatedVehicles)

   const partyType=partyMap[type]
   if(partyType){const t=await supabase.from('transactions').select('*').eq('party_type',partyType).eq('party_id',id).order('created_at',{ascending:false});if(t.error)throw t.error;setTxns(t.data||[])}else setTxns([])
  }catch(e){setError(e.message||'Unable to load profile.')}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[type,id])

 if(loading)return <div className="panel profile-loading">Loading profile…</div>
 if(!entity)return <EmptyState title="Profile not found" text={error||'The requested stakeholder record is not available.'}/>

 const name=entity.name||entity.display_name||entity.number||id
 const totalJobs=orders.length,completed=orders.filter(o=>o.status==='Completed').length,active=orders.filter(o=>['Assigned','Dispatched','In Transit','Delivered'].includes(o.status)).length
 const received=txns.filter(t=>t.direction==='IN'&&t.status!=='Reversed'&&!t.reversal_of).reduce((s,t)=>s+num(t.amount),0)
 const paid=txns.filter(t=>t.direction==='OUT'&&t.status!=='Reversed'&&!t.reversal_of).reduce((s,t)=>s+num(t.amount),0)
 const converted=leads.filter(l=>l.status==='Converted').length
 const info=Object.entries(entity).filter(([k,v])=>!['profile_notes','permissions','auth_user_id','login_token','pin_hash','created_at','updated_at','archived'].includes(k)&&v!==null&&typeof v!=='object').slice(0,20)
 const tabs=['overview','jobs',...(type==='agent'?['leads','access']:[]),'payments','notes','documents']

 const addNote=async()=>{if(!note.trim())return;try{await insertRow('profile_notes',{profile_type:type,record_id:id,category,text:note.trim(),visibility:'Standard',author_profile_id:profile?.id||null});setNote('');load()}catch(e){setError(e.message)}}
 const upload=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>10*1024*1024)return setError('Maximum document size is 10 MB.');setUploading(true);setError('');try{const safe=file.name.replace(/[^A-Za-z0-9._-]+/g,'-'),path=`${type}/${id}/${crypto.randomUUID()}-${safe}`;const up=await supabase.storage.from('rikshams-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});if(up.error)throw up.error;await insertRow('attachments',{entity_type:type,entity_id:id,bucket:'rikshams-documents',path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,uploaded_by:profile?.id||null});load()}catch(e){setError(e.message)}finally{setUploading(false)}}
 const openDoc=async d=>{const {data,error}=await supabase.storage.from(d.bucket||'rikshams-documents').createSignedUrl(d.path,900);if(error)return setError(error.message);window.open(data.signedUrl,'_blank','noopener')}
 const archiveDoc=async d=>{if(!confirm('Archive this document?'))return;try{await updateRow('attachments',d.id,{archived:true});load()}catch(e){setError(e.message)}}

 return <div className="profile-page modern-profile-page">
  <button className="profile-back" onClick={()=>nav(-1)}>← Back</button>
  <section className="profile-hero modern-profile-hero"><div className="profile-avatar-lg">{initials(name)}</div><div className="profile-hero-copy"><small>{(titleMap[type]||type).toUpperCase()} PROFILE</small><h1>{name}</h1><p>{entity.mobile||entity.area||entity.address||entity.number||entity.profile_id||id}</p><div className="profile-tags"><StatusBadge status={entity.status||entity.role||(entity.active===false?'Inactive':'Active')}/>{entity.skill&&<span className="profile-tag">{entity.skill}</span>}{entity.type&&<span className="profile-tag">{entity.type}</span>}</div></div><div className="profile-hero-stats"><div><b>{totalJobs}</b><span>Total Jobs</span></div><div><b>{completed}</b><span>Completed</span></div><div><b>{type==='agent'?(leads.length?`${Math.round(converted/leads.length*100)}%`:'0%'):(entity.rating||'—')}</b><span>{type==='agent'?'Conversion':'Rating'}</span></div></div></section>
  <div className="profile-tabs modern-profile-tabs">{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>
  {error&&<div className="form-error mt">{error}</div>}

  {tab==='overview'&&<><div className="profile-overview-kpis"><div><BriefcaseBusiness size={18}/><span>Total Jobs</span><b>{totalJobs}</b></div><div><TrendingUp size={18}/><span>Active Work</span><b>{active}</b></div><div><Star size={18}/><span>Rating</span><b>{entity.rating||'—'}</b></div><div><ReceiptText size={18}/><span>Received</span><b>{money(received)}</b></div><div><ShieldCheck size={18}/><span>Paid</span><b>{money(paid)}</b></div>{type==='agent'&&<div><UsersRound size={18}/><span>Converted Leads</span><b>{converted}/{leads.length}</b></div>}</div><div className="grid-2 profile-overview-grid"><section className="panel"><div className="panel-head"><div><h3>Basic Information</h3><small>Master record and identity information</small></div></div><div className="profile-info-grid">{info.map(([k,v])=><div key={k}><small>{k.replaceAll('_',' ')}</small><b>{String(v)}</b></div>)}</div></section><section className="panel"><div className="panel-head"><div><h3>Performance & Relationship</h3><small>Live values calculated from linked operations</small></div></div><div className="performance-grid"><div><span>Total Jobs</span><b>{totalJobs}</b></div><div><span>Completed</span><b>{completed}</b></div><div><span>Completion Rate</span><b>{totalJobs?Math.round(completed/totalJobs*100):0}%</b></div><div><span>Active Work</span><b>{active}</b></div><div><span>Received</span><b>{money(received)}</b></div><div><span>Paid</span><b>{money(paid)}</b></div>{type==='agent'&&<><div><span>Total Leads</span><b>{leads.length}</b></div><div><span>Converted</span><b>{converted}</b></div></>}{type==='owner'&&<div><span>Linked Vehicles</span><b>{vehicles.length}</b></div>}</div></section></div></>}

  {tab==='jobs'&&<section className="panel"><div className="panel-head"><div><h3>Jobs / Orders</h3><small>Operational history linked to this stakeholder</small></div><span className="chip">{orders.length}</span></div>{orders.length?<div className="history-list profile-job-list">{orders.map(o=><button type="button" key={o.id} onClick={()=>nav(`/orders/${o.id}`)}><div><b>{o.id} · {o.pickup} → {o.drop}</b><small>{o.customer} · {formatDateTime(o.created_at)}</small></div><StatusBadge status={o.status}/></button>)}</div>:<EmptyState title="No jobs linked" text="Linked orders will appear here automatically."/>}</section>}

  {tab==='leads'&&type==='agent'&&<section className="panel"><div className="panel-head"><div><h3>Agent Leads</h3><small>Lead pipeline generated by this agent or public link</small></div><span className="chip">{leads.length}</span></div>{leads.length?<div className="history-list profile-job-list">{leads.map(l=><button type="button" key={l.id} onClick={()=>nav(`/leads/${l.id}`)}><div><b>{l.id} · {l.name}</b><small>{l.phone} · {l.pickup} → {l.drop}</small></div><StatusBadge status={l.status}/></button>)}</div>:<EmptyState title="No leads linked"/>}</section>}

  {tab==='access'&&type==='agent'&&<section className="panel"><div className="panel-head"><div><h3>Portal Access & Public Form</h3><small>Private login, linked referral partner, public lead form and QR.</small></div><StatusBadge status={entity.active===false?'Inactive':'Active'}/></div><div className="profile-access-grid"><div className="profile-access-card"><KeyRound size={18}/><span><small>Login Token</small><b>{entity.login_token||'—'}</b><em>{entity.profile_type||entity.role}</em></span></div><div className="profile-access-card"><UsersRound size={18}/><span><small>Linked Referral Partner</small><b>{linkedPartner?.name||'Not linked'}</b><em>{linkedPartner?.id||entity.linked_entity_id||'—'}</em></span></div><div className="profile-access-card"><ExternalLink size={18}/><span><small>Public Form</small><b>{publicForm?.title||'Not created'}</b><em>{publicForm?.active?'Live':'Off'}</em></span></div></div>{entity.login_token&&<div className="profile-link-grid mt"><div className="qr-card"><span className="qr-card-kicker">PRIVATE</span><h3>Portal Login</h3>{portalQr&&<img src={portalQr}/>}<code>{`${location.origin}/agent-login/${entity.login_token}`}</code><div className="table-actions"><button className="outline small" onClick={()=>navigator.clipboard?.writeText(`${location.origin}/agent-login/${entity.login_token}`)}><Link2 size={14}/> Copy</button><button className="outline small" onClick={()=>window.open(`${location.origin}/agent-login/${entity.login_token}`,'_blank')}>Open</button></div></div><div className="qr-card"><span className="qr-card-kicker public">PUBLIC</span><h3>Public Lead Form</h3>{publicQr&&<img src={publicQr}/>}<code>{`${location.origin}/public/${entity.login_token}`}</code><div className="table-actions"><button className="outline small" onClick={()=>navigator.clipboard?.writeText(`${location.origin}/public/${entity.login_token}`)}><Link2 size={14}/> Copy</button><button className="outline small" onClick={()=>window.open(`${location.origin}/public/${entity.login_token}`,'_blank')}>Open</button></div></div></div>}</section>}

  {tab==='payments'&&<section className="panel"><div className="panel-head"><div><h3>Payments & Ledger</h3><small>Transaction history linked by stakeholder ID</small></div><span className="chip">{txns.length}</span></div>{txns.length?<div className="history-list">{txns.map(t=><div key={t.id}><div><b>{t.type||'Transaction'} · {money(t.amount)}</b><small>{t.method||'—'} · {t.order_id||'No order'} · {t.note||''}</small></div><div className="profile-payment-meta"><span className={`flow-pill ${t.direction==='IN'?'receive':'pay'}`}>{t.direction==='IN'?'Receive':'Pay'}</span><small>{formatDateTime(t.created_at)}</small></div></div>)}</div>:<EmptyState title="No payments linked"/>}</section>}

  {tab==='notes'&&<section className="panel"><div className="panel-head"><div><h3>Notes & Timeline</h3><small>Performance, warning, complaint, payment and job notes</small></div><span className="chip">{notes.length}</span></div><div className="note-compose"><select value={category} onChange={e=>setCategory(e.target.value)}>{['General','Performance','Warning','Complaint','Payment','Job','Admin Note'].map(x=><option key={x}>{x}</option>)}</select><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Add profile note…"/><button className="primary" onClick={addNote} disabled={!note.trim()}><NotebookPen size={16}/> Add Note</button></div><Timeline items={notes}/></section>}

  {tab==='documents'&&<section className="panel"><div className="panel-head"><div><h3>Documents</h3><small>Private Supabase Storage · JPG, PNG, WEBP or PDF · max 10 MB</small></div><label className={`primary upload-button ${uploading?'disabled':''}`}><FileText size={16}/>{uploading?'Uploading…':' Upload Document'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onChange={upload}/></label></div>{docs.length?<div className="document-list">{docs.map(d=><div className="document-row" key={d.id}><div className="document-icon">{d.mime_type==='application/pdf'?'PDF':'▣'}</div><div><b>{d.file_name}</b><small>{d.mime_type||'Document'} · {d.size_bytes?`${Math.ceil(d.size_bytes/1024)} KB`:''} · {formatDateTime(d.created_at)}</small></div><div className="table-actions"><button className="outline small" onClick={()=>openDoc(d)}>Open</button><button className="ghost small danger-text" onClick={()=>archiveDoc(d)}>Archive</button></div></div>)}</div>:<EmptyState title="No documents" text="Upload license, identity, agreement, photo or other related files."/>}</section>}
 </div>
}
