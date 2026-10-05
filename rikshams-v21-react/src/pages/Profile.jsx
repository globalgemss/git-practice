import React,{useEffect,useMemo,useState} from 'react'
import {useNavigate,useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import {insertRow,updateRow} from '../services/api'
import {formatDateTime,initials,money,num} from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import Timeline from '../components/Timeline'
import EmptyState from '../components/EmptyState'

const tableMap={customer:'customers',driver:'drivers',labour:'labourers',owner:'vehicle_owners',partner:'partners',vehicle:'vehicles',agent:'profiles'}

export default function Profile(){
 const {type,id}=useParams(),table=tableMap[type],nav=useNavigate(),{profile}=useAuth()
 const [entity,setEntity]=useState(null),[notes,setNotes]=useState([]),[orders,setOrders]=useState([]),[txns,setTxns]=useState([]),[docs,setDocs]=useState([])
 const [tab,setTab]=useState('overview'),[note,setNote]=useState(''),[category,setCategory]=useState('General'),[loading,setLoading]=useState(true),[uploading,setUploading]=useState(false),[error,setError]=useState('')
 const load=async()=>{
  if(!table)return
  setLoading(true);setError('')
  try{
   const [e,n,d]=await Promise.all([
    supabase.from(table).select('*').eq('id',id).maybeSingle(),
    supabase.from('profile_notes').select('*').eq('profile_type',type).eq('record_id',id).order('created_at',{ascending:false}),
    supabase.from('attachments').select('*').eq('entity_type',type).eq('entity_id',id).eq('archived',false).order('created_at',{ascending:false})
   ])
   if(e.error)throw e.error
   setEntity(e.data);setNotes(n.data||[]);setDocs(d.data||[])
   let oq=supabase.from('orders').select('*').order('created_at',{ascending:false})
   if(type==='customer')oq=oq.eq('customer_id',id);else if(type==='driver')oq=oq.eq('driver_id',id);else if(type==='partner')oq=oq.eq('partner_id',id);else if(type==='vehicle')oq=oq.eq('vehicle_id',id);else oq=oq.limit(0)
   const o=await oq;setOrders(o.data||[])
   let tq=supabase.from('transactions').select('*').order('created_at',{ascending:false})
   if(type==='customer')tq=tq.eq('party_type','Customer').eq('party_id',id);else if(type==='partner')tq=tq.eq('party_type','Partner').eq('party_id',id);else if(type==='driver')tq=tq.eq('party_type','Driver').eq('party_id',id);else if(type==='labour')tq=tq.eq('party_type','Labour').eq('party_id',id);else tq=tq.limit(0)
   const t=await tq;setTxns(t.data||[])
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[type,id])
 if(loading)return <div className="panel">Loading profile…</div>
 if(!entity)return <EmptyState title="Profile not found" text={error}/>
 const name=entity.name||entity.display_name||entity.number||id,totalJobs=orders.length,completed=orders.filter(o=>o.status==='Completed').length,received=txns.filter(t=>t.direction==='IN'&&t.status!=='Reversed').reduce((s,t)=>s+num(t.amount),0),paid=txns.filter(t=>t.direction==='OUT'&&t.status!=='Reversed').reduce((s,t)=>s+num(t.amount),0)
 const addNote=async()=>{if(!note.trim())return;try{await insertRow('profile_notes',{profile_type:type,record_id:id,category,text:note.trim(),visibility:'Standard',author_profile_id:profile?.id||null});setNote('');load()}catch(e){setError(e.message)}}
 const upload=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>10*1024*1024)return setError('Maximum document size is 10 MB.');setUploading(true);setError('');try{const safe=file.name.replace(/[^A-Za-z0-9._-]+/g,'-'),path=`${type}/${id}/${crypto.randomUUID()}-${safe}`;const up=await supabase.storage.from('rikshams-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});if(up.error)throw up.error;await insertRow('attachments',{entity_type:type,entity_id:id,bucket:'rikshams-documents',path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,uploaded_by:profile?.id||null});load()}catch(e){setError(e.message)}finally{setUploading(false)}}
 const openDoc=async d=>{const {data,error}=await supabase.storage.from(d.bucket||'rikshams-documents').createSignedUrl(d.path,900);if(error)return setError(error.message);window.open(data.signedUrl,'_blank','noopener')}
 const archiveDoc=async d=>{if(!confirm('Archive this document?'))return;try{await updateRow('attachments',d.id,{archived:true});load()}catch(e){setError(e.message)}}
 const info=useMemo(()=>Object.entries(entity).filter(([k,v])=>!['profile_notes','permissions','created_at','updated_at','archived'].includes(k)&&v!==null&&typeof v!=='object').slice(0,18),[entity])
 return <>
  <button className="back-link" onClick={()=>nav(-1)}>← Back</button>
  <section className="profile-hero"><div className="profile-avatar-lg">{initials(name)}</div><div className="profile-hero-copy"><small>{type.toUpperCase()} PROFILE</small><h1>{name}</h1><p>{entity.mobile||entity.area||entity.address||entity.number||id}</p><StatusBadge status={entity.status||entity.role||'Active'}/></div><div className="profile-hero-stats"><div><b>{totalJobs}</b><span>Total Jobs</span></div><div><b>{completed}</b><span>Completed</span></div><div><b>{entity.rating||'—'}</b><span>Rating</span></div></div></section>
  <div className="profile-tabs">{['overview','jobs','payments','notes','documents'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>
  {error&&<div className="form-error mt">{error}</div>}
  {tab==='overview'&&<div className="grid-2"><section className="panel"><div className="panel-head"><h3>Basic Information</h3></div><div className="profile-info-grid">{info.map(([k,v])=><div key={k}><small>{k.replaceAll('_',' ')}</small><b>{String(v)}</b></div>)}</div></section><section className="panel"><div className="panel-head"><h3>Performance</h3></div><div className="performance-grid"><div><span>Total Jobs</span><b>{totalJobs}</b></div><div><span>Completed</span><b>{completed}</b></div><div><span>Completion Rate</span><b>{totalJobs?Math.round(completed/totalJobs*100):0}%</b></div><div><span>Rating</span><b>{entity.rating||'—'}</b></div><div><span>Received</span><b>{money(received)}</b></div><div><span>Paid</span><b>{money(paid)}</b></div></div></section></div>}
  {tab==='jobs'&&<section className="panel"><div className="panel-head"><h3>Jobs / Orders</h3><span className="chip">{orders.length}</span></div>{orders.length?<div className="history-list">{orders.map(o=><div key={o.id}><div><b>{o.id} · {o.pickup} → {o.drop}</b><small>{o.customer}</small></div><StatusBadge status={o.status}/></div>)}</div>:<EmptyState title="No jobs linked"/>}</section>}
  {tab==='payments'&&<section className="panel"><div className="panel-head"><h3>Payments</h3><span className="chip">{txns.length}</span></div>{txns.length?<div className="history-list">{txns.map(t=><div key={t.id}><div><b>{t.type} · {money(t.amount)}</b><small>{t.method} · {t.note||''}</small></div><span>{formatDateTime(t.created_at)}</span></div>)}</div>:<EmptyState title="No payments linked"/>}</section>}
  {tab==='notes'&&<section className="panel"><div className="panel-head"><h3>Notes & Timeline</h3><span className="chip">{notes.length}</span></div><div className="note-compose"><select value={category} onChange={e=>setCategory(e.target.value)}>{['General','Performance','Warning','Complaint','Payment','Job','Admin Note'].map(x=><option key={x}>{x}</option>)}</select><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Add profile note…"/><button className="primary" onClick={addNote}>Add Note</button></div><Timeline items={notes}/></section>}
  {tab==='documents'&&<section className="panel"><div className="panel-head"><div><h3>Documents</h3><small>Private Supabase Storage · JPG, PNG, WEBP or PDF · max 10 MB</small></div><label className={`primary upload-button ${uploading?'disabled':''}`}>{uploading?'Uploading…':'＋ Upload Document'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onChange={upload}/></label></div>{docs.length?<div className="document-list">{docs.map(d=><div className="document-row" key={d.id}><div className="document-icon">{d.mime_type==='application/pdf'?'PDF':'▣'}</div><div><b>{d.file_name}</b><small>{d.mime_type||'Document'} · {d.size_bytes?`${Math.ceil(d.size_bytes/1024)} KB`:''} · {formatDateTime(d.created_at)}</small></div><div className="table-actions"><button className="outline small" onClick={()=>openDoc(d)}>Open</button><button className="ghost small danger-text" onClick={()=>archiveDoc(d)}>Archive</button></div></div>)}</div>:<EmptyState title="No documents" text="Upload license, identity, agreement, photo or other related files."/>}</section>}
 </>
}