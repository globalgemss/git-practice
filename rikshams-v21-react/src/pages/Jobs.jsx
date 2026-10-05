import React,{useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {insertRow} from '../services/api'
import {formatDateTime,money} from '../utils/format'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import Timeline from '../components/Timeline'
import EmptyState from '../components/EmptyState'

const statuses=['All','Assigned','Dispatched','In Transit','Delivered','Completed','Cancelled']

export default function Jobs(){
 const nav=useNavigate()
 const {rows:jobs}=useRealtimeTable('jobs',{filters:[['archived','eq',false]],order:'created_at'})
 const {rows:orders}=useRealtimeTable('orders',{filters:[['archived','eq',false]],order:'created_at'})
 const {rows:vehicles}=useRealtimeTable('vehicles',{filters:[['archived','eq',false]],order:'number'})
 const {rows:drivers}=useRealtimeTable('drivers',{filters:[['archived','eq',false]],order:'name'})
 const {rows:partners}=useRealtimeTable('partners',{filters:[['archived','eq',false]],order:'name'})
 const [search,setSearch]=useState(''),[status,setStatus]=useState('All'),[sort,setSort]=useState('newest'),[view,setView]=useState('table'),[selected,setSelected]=useState(null)

 const byId=(list,id)=>list.find(x=>String(x.id)===String(id))
 const shown=useMemo(()=>{
  const q=search.toLowerCase()
  const a=jobs.filter(j=>{
   const o=byId(orders,j.order_id),v=byId(vehicles,j.vehicle_id),d=byId(drivers,j.driver_id),p=byId(partners,j.partner_id)
   return (status==='All'||j.status===status)&&(!q||[
    j.id,j.order_id,o?.customer,o?.pickup,o?.drop,v?.number,d?.name,p?.name,j.status
   ].join(' ').toLowerCase().includes(q))
  })
  a.sort((a,b)=>sort==='oldest'
   ?String(a.created_at||'').localeCompare(String(b.created_at||''))
   :String(b.created_at||'').localeCompare(String(a.created_at||'')))
  return a
 },[jobs,orders,vehicles,drivers,partners,search,status,sort])

 return <>
  <PageTitle title="Jobs" subtitle="Operational jobs created from confirmed dispatches"/>
  <div className="status-tabs">{statuses.map(s=><button key={s} className={status===s?'active':''} onClick={()=>setStatus(s)}>{s}<span>{s==='All'?jobs.length:jobs.filter(x=>x.status===s).length}</span></button>)}</div>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search job, order, customer, vehicle, driver…">
   <select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
  </SearchFilterBar>

  {view==='table'
   ?<section className="panel"><DataTable rows={shown} onRow={setSelected} columns={[
    {key:'sn',label:'SN',render:(_r,i)=>i+1},
    {key:'id',label:'Job',render:r=><><b>{r.id}</b><small>{r.order_id}</small></>},
    {key:'customer',label:'Customer / Route',render:r=>{const o=byId(orders,r.order_id);return <><b>{o?.customer||'—'}</b><small>{o?o.pickup+' → '+o.drop:'—'}</small></>}},
    {key:'vehicle',label:'Vehicle',render:r=>byId(vehicles,r.vehicle_id)?.number||'—'},
    {key:'driver',label:'Driver',render:r=>byId(drivers,r.driver_id)?.name||'—'},
    {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
    {key:'payment_state',label:'Payment',render:r=><StatusBadge status={r.payment_state}/>},
    {key:'created_at',label:'Created',render:r=>formatDateTime(r.created_at)},
    {key:'action',label:'Action',render:r=><div className="table-actions"><button className="outline small" onClick={e=>{e.stopPropagation();setSelected(r)}}>View</button><button className="ghost small" onClick={e=>{e.stopPropagation();nav('/orders/'+r.order_id)}}>Order</button></div>}
   ]}/></section>
   :shown.length?<div className="card-grid">{shown.map(j=>{const o=byId(orders,j.order_id);return <article className="list-card" key={j.id} onClick={()=>setSelected(j)}>
    <div className="list-card-head"><b>{j.id}</b><StatusBadge status={j.status}/></div>
    <h3>{o?.customer||j.order_id}</h3>
    <div className="route-card">{o?o.pickup+' → '+o.drop:'—'}</div>
    <div className="card-line"><small>Vehicle</small><b>{byId(vehicles,j.vehicle_id)?.number||'—'}</b></div>
    <div className="card-line"><small>Driver</small><b>{byId(drivers,j.driver_id)?.name||'—'}</b></div>
    <div className="card-line"><small>Payment</small><b>{j.payment_state}</b></div>
   </article>})}</div>:<EmptyState title="No jobs match the current filters"/>}

  {selected&&<JobDetail job={selected} order={byId(orders,selected.order_id)} vehicle={byId(vehicles,selected.vehicle_id)} driver={byId(drivers,selected.driver_id)} partner={byId(partners,selected.partner_id)} onClose={()=>setSelected(null)} onOrder={()=>nav('/orders/'+selected.order_id)}/>}
 </>
}

function JobDetail({job,order,vehicle,driver,partner,onClose,onOrder}){
 const {rows:events,reload}=useRealtimeTable('job_events',{filters:[['job_id','eq',job.id]],order:'created_at',ascending:true})
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const addNote=async()=>{
  if(!note.trim()||busy)return
  setBusy(true);setError('')
  try{
   await insertRow('job_events',{job_id:job.id,event_type:'Note',status:job.status,note:note.trim()})
   setNote('');reload()
  }catch(e){setError(e.message||'Note could not be saved.')}
  finally{setBusy(false)}
 }
 return <Modal open title={job.id+' · Job Detail'} onClose={onClose} size="lg" footer={<><button className="outline" onClick={onOrder}>Open Order</button><button className="primary" onClick={onClose}>Close</button></>}>
  <div className="info-grid-2">
   <Info label="Order" value={job.order_id}/>
   <Info label="Status" value={job.status}/>
   <Info label="Customer" value={order?.customer||'—'}/>
   <Info label="Route" value={order?order.pickup+' → '+order.drop:'—'}/>
   <Info label="Vehicle" value={vehicle?.number||'—'}/>
   <Info label="Driver" value={driver?.name||'—'}/>
   <Info label="Partner" value={partner?.name||'—'}/>
   <Info label="Payment State" value={job.payment_state}/>
   <Info label="Started" value={formatDateTime(job.started_at)}/>
   <Info label="Delivered" value={formatDateTime(job.delivered_at)}/>
   <Info label="Completed" value={formatDateTime(job.completed_at)}/>
   <Info label="Customer Rate" value={money(order?.customer_rate||0)}/>
  </div>
  <section className="panel mt">
   <div className="panel-head"><h3>Job Timeline</h3><span className="chip">{events.length}</span></div>
   <Timeline items={events}/>
  </section>
  <div className="form-grid cols-1 mt">
   <label className="field"><span>Add Job Note</span><textarea rows="3" value={note} onChange={e=>setNote(e.target.value)} placeholder="Operational update, delay reason, delivery note…"/></label>
  </div>
  <button className="outline mt" disabled={busy||!note.trim()} onClick={addNote}>{busy?'Saving…':'＋ Add Note'}</button>
  {error&&<div className="form-error">{error}</div>}
 </Modal>
}
function Info({label,value}){return <div className="info-row"><span>{label}</span><b>{value||'—'}</b></div>}
