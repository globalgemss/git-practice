import React,{useEffect,useMemo,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {assignResources,confirmDispatch,transitionOrder} from '../services/api'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {formatDate,formatTime,money,num} from '../utils/format'
import PageTitle from '../components/PageTitle'
import StatusBadge from '../components/StatusBadge'
import SearchPicker from '../components/SearchPicker'
import EmptyState from '../components/EmptyState'

function useClock(active=true){
 const [now,setNow]=useState(Date.now())
 useEffect(()=>{
  if(!active)return
  const t=setInterval(()=>setNow(Date.now()),1000)
  return()=>clearInterval(t)
 },[active])
 return now
}
function duration(start,now){
 if(!start)return '00:00:00'
 const ms=Math.max(0,now-new Date(start).getTime()),s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60
 return [h,m,ss].map(x=>String(x).padStart(2,'0')).join(':')
}

const eligible=['New','Assigned','Dispatched','In Transit']

export default function Dispatch(){
 const nav=useNavigate(),[sp,setSp]=useSearchParams()
 const {rows:orders,reload:reloadOrders}=useRealtimeTable('orders',{filters:[['archived','eq',false],['status','in',eligible]],order:'created_at'})
 const {rows:vehicles,reload:reloadVehicles}=useRealtimeTable('vehicles',{filters:[['archived','eq',false]],order:'number',ascending:true})
 const {rows:drivers,reload:reloadDrivers}=useRealtimeTable('drivers',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const {rows:labour,reload:reloadLabour}=useRealtimeTable('labourers',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const {rows:rates}=useRealtimeTable('rates',{filters:[['active','eq',true]],order:'sort_order',ascending:true})
 const {rows:assignments,reload:reloadAssignments}=useRealtimeTable('order_labour_assignments',{filters:[['released_at','is',null]],order:'created_at',ascending:true})

 const [search,setSearch]=useState(''),[status,setStatus]=useState('All'),[vehicleId,setVehicleId]=useState(''),[driverId,setDriverId]=useState(''),[labourIds,setLabourIds]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const selectedId=sp.get('order')||''
 const selected=orders.find(o=>o.id===selectedId)

 useEffect(()=>{
  if(!selected){
   setVehicleId('');setDriverId('');setLabourIds([])
   return
  }
  setVehicleId(selected.vehicle_id||'')
  setDriverId(selected.driver_id||'')
  setLabourIds(assignments.filter(a=>a.order_id===selected.id&&!a.released_at).map(a=>a.labour_id))
 },[selectedId,selected?.vehicle_id,selected?.driver_id,assignments])

 const matchesVehicle=v=>selected&&(
  (selected.vehicle_type_id&&v.vehicle_type_id&&selected.vehicle_type_id===v.vehicle_type_id)
  ||(!selected.vehicle_type_id&&String(v.type||'').toLowerCase()===String(selected.vehicle_type||'').toLowerCase())
  ||(!v.vehicle_type_id&&String(v.type||'').toLowerCase()===String(selected.vehicle_type||'').toLowerCase())
 )
 const eligibleVehicles=selected?vehicles.filter(v=>matchesVehicle(v)&&(v.status==='Available'||v.id===selected.vehicle_id)):[]
 const eligibleDrivers=drivers.filter(d=>d.status==='Available'||d.id===selected?.driver_id)
 const eligibleLabour=labour.filter(l=>l.status==='Available'||labourIds.includes(l.id))
 const rate=selected?(rates.find(r=>r.vehicle_type_id===selected.vehicle_type_id)||rates.find(r=>r.vehicle_type===selected.vehicle_type)||{}):{}
 const vehicleCost=selected&&vehicleId?Math.round(num(rate.partner_base||rate.partner_rate)+Math.max(0,num(selected.distance)-num(rate.base_km))*num(rate.partner_per_km)):0
 const labourCost=labourIds.reduce((s,id)=>s+num(labour.find(x=>x.id===id)?.rate),0)
 const required=selected?Math.max(num(selected.loading),num(selected.unloading)):0
 const ready=!!vehicleId&&!!driverId&&(required===0||labourIds.length>=required)

 const queue=useMemo(()=>{
  const q=search.toLowerCase()
  return orders.filter(o=>(status==='All'||o.status===status)&&(!q||[o.id,o.customer,o.phone,o.pickup,o.drop,o.vehicle_type].join(' ').toLowerCase().includes(q)))
 },[orders,search,status])

 const selectVehicle=(id,obj)=>{
  setVehicleId(id)
  if(obj?.default_driver_id)setDriverId(obj.default_driver_id)
  else{
   const vehicle=eligibleVehicles.find(v=>v.id===id)
   if(vehicle?.default_driver_id)setDriverId(vehicle.default_driver_id)
  }
 }

 const refreshOperational=async()=>{
  await Promise.all([
   reloadOrders({silent:true}),
   reloadVehicles({silent:true}),
   reloadDrivers({silent:true}),
   reloadLabour({silent:true}),
   reloadAssignments({silent:true})
  ])
 }

 const persistAssignment=async()=>assignResources({orderId:selected.id,vehicleId,driverId,labourIds,vehicleCost,labourCost})

 const saveAssign=async()=>{
  if(!selected||!ready||busy)return
  setBusy(true);setError('')
  try{
   await persistAssignment()
   await refreshOperational()
  }catch(e){
   setError(e.message||'Assignment could not be saved.')
  }finally{setBusy(false)}
 }

 const stage=async target=>{
  if(!selected||busy)return
  setBusy(true);setError('')
  try{
   if(target==='Dispatched'){
    if(!ready)throw new Error('Assign vehicle, driver and required labour first.')
    await persistAssignment()
    await confirmDispatch(selected.id)
   }else{
    await transitionOrder(selected.id,target,'Stage changed to '+target)
   }
   await refreshOperational()
  }catch(e){
   setError(e.message||'Dispatch stage could not be changed.')
  }finally{setBusy(false)}
 }

 const now=useClock(orders.some(o=>o.status==='In Transit'))
 const stats={
  need:orders.filter(o=>o.status==='New').length,
  ready:orders.filter(o=>o.status==='Assigned').length,
  dispatched:orders.filter(o=>o.status==='Dispatched').length,
  transit:orders.filter(o=>o.status==='In Transit').length
 }

 return <>
  <PageTitle title="Dispatch" subtitle="Assign resources, confirm dispatch and track active trips" actions={<button className="outline" onClick={()=>nav('/orders')}>View Orders</button>}/>

  <div className="dispatch-stats">
   <button onClick={()=>setStatus('New')}><span>Need Dispatch</span><b>{stats.need}</b></button>
   <button onClick={()=>setStatus('Assigned')}><span>Ready</span><b>{stats.ready}</b></button>
   <button onClick={()=>setStatus('Dispatched')}><span>Dispatched</span><b>{stats.dispatched}</b></button>
   <button onClick={()=>setStatus('In Transit')}><span>In Transit</span><b>{stats.transit}</b></button>
  </div>

  <div className="panel dispatch-toolbar-panel">
   <div className="filterbar">
    <label className="searchbox">⌕<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order, customer, route…"/></label>
    <select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option>{eligible.map(x=><option key={x}>{x}</option>)}</select>
    <button className="ghost" onClick={()=>{setSearch('');setStatus('All')}}>Reset</button>
   </div>
  </div>

  <div className="dispatch-dashboard-grid">
   <section className="dispatch-queue">
    <div className="panel-head"><div><h3>Dispatch Queue</h3><small>{queue.length} operational orders</small></div></div>
    {queue.length?queue.map(o=>{
     const ass=!!o.vehicle_id&&!!o.driver_id
     const need=Math.max(num(o.loading),num(o.unloading))
     const labCount=assignments.filter(a=>a.order_id===o.id&&!a.released_at).length
     return <article key={o.id} className={'dispatch-queue-card '+(o.id===selectedId?'selected ':'')+(o.status==='Dispatched'?'dispatched':ass&&(need===0||labCount>=need)?'ready':'partial')} onClick={()=>setSp({order:o.id})}>
      <div className="dispatch-card-top">
       <div><b>{o.id}</b><h3>{o.customer}</h3><span>{o.phone}</span></div>
       <StatusBadge status={o.status}/>
      </div>
      <div className="dispatch-route"><span>📍 {o.pickup}</span><i>→</i><span>{o.drop}</span></div>
      <div className="dispatch-card-meta">
       <div><small>Vehicle Required</small><b>{o.vehicle_type||'—'}</b></div>
       <div><small>Labour</small><b>{need?labCount+'/'+need:'None'}</b></div>
       <div><small>Pickup</small><b>{formatDate(o.date)} · {formatTime(o.time)}</b></div>
       <div><small>Rate</small><b>{money(o.customer_rate)}</b></div>
      </div>
      {o.status==='In Transit'&&<div className="queue-timer">🚚 In Transit · {duration(o.trip_started_at,now)}</div>}
      <div className="dispatch-card-actions">
       <button className="outline small" onClick={e=>{e.stopPropagation();nav('/orders/'+o.id)}}>Open</button>
       <button className="primary small">{o.status==='New'?'Assign':'Manage Dispatch'}</button>
      </div>
     </article>
    }):<EmptyState title="No orders in dispatch queue"/>}
   </section>

   <aside className="panel dispatch-live-preview">
    {selected?<DispatchWorkspace order={selected} vehicles={eligibleVehicles} drivers={eligibleDrivers} labour={eligibleLabour} vehicleId={vehicleId} driverId={driverId} labourIds={labourIds} setVehicle={selectVehicle} setDriver={setDriverId} setLabourIds={setLabourIds} required={required} ready={ready} vehicleCost={vehicleCost} labourCost={labourCost} busy={busy} error={error} onAssign={saveAssign} onStage={stage} now={now}/>
    :<div className="dispatch-empty">
     <div className="dispatch-empty-icon">➤</div>
     <h3>Select an order to start dispatch</h3>
     <p>Choose from the queue to assign vehicle, driver and labour.</p>
     <div className="availability-grid">
      <div><b>{vehicles.filter(v=>v.status==='Available').length}</b><span>Available Vehicles</span></div>
      <div><b>{drivers.filter(d=>d.status==='Available').length}</b><span>Available Drivers</span></div>
      <div><b>{labour.filter(l=>l.status==='Available').length}</b><span>Available Labour</span></div>
     </div>
    </div>}
   </aside>
  </div>
 </>
}

function DispatchWorkspace({order,vehicles,drivers,labour,vehicleId,driverId,labourIds,setVehicle,setDriver,setLabourIds,required,ready,vehicleCost,labourCost,busy,error,onAssign,onStage,now}){
 const vehicleOptions=vehicles.map(v=>({value:v.id,label:(v.number+' · '+(v.type||'')),sub:((v.area||'Area —')+' · '+v.status),number:v.number,area:v.area,default_driver_id:v.default_driver_id}))
 const driverOptions=drivers.map(d=>({value:d.id,label:d.name,sub:((d.mobile||'')+' · '+d.status)}))
 const toggle=id=>setLabourIds(labourIds.includes(id)?labourIds.filter(x=>x!==id):[...labourIds,id])
 const gross=num(order.customer_rate)-vehicleCost-labourCost

 return <>
  <div className="dispatch-preview-head">
   <div><small className="live-preview-kicker">Live Dispatch Workspace</small><h3>{order.id}</h3><span>{order.customer}</span></div>
   <StatusBadge status={order.status}/>
  </div>

  <div className="dispatch-preview-section">
   <b>Selected Order</b>
   <div className="preview-row"><span>Route</span><b>{order.pickup} → {order.drop}</b></div>
   <div className="preview-row"><span>Goods</span><b>{order.goods||'—'}</b></div>
   <div className="preview-row"><span>Required Vehicle</span><b>{order.vehicle_type||'—'}</b></div>
  </div>

  {order.status==='In Transit'&&<div className="trip-timer-wrap">
   <div><small>LIVE TRIP TIMER</small><b className="trip-timer-value">{duration(order.trip_started_at,now)}</b><div className="trip-timer-meta">Started {formatTime(order.trip_started_at)}</div></div><span>🚚</span>
  </div>}

  <div className="dispatch-preview-section">
   <b>Vehicle & Driver</b>
   <label className="field"><span>Vehicle</span><SearchPicker value={vehicleId} onChange={setVehicle} options={vehicleOptions} placeholder="Search / select vehicle" searchKeys={['label','sub','number','area']} disabled={['Dispatched','In Transit'].includes(order.status)}/></label>
   <label className="field"><span>Driver</span><SearchPicker value={driverId} onChange={setDriver} options={driverOptions} placeholder="Search / select driver" disabled={['Dispatched','In Transit'].includes(order.status)}/></label>
  </div>

  <div className="dispatch-preview-section">
   <div className="section-inline"><b>Labour Assignment</b><span>{labourIds.length}/{required||0}</span></div>
   {required===0?<div className="muted-box">No labour requested.</div>:<div className="labour-choice-list">{labour.map(l=><label key={l.id} className={labourIds.includes(l.id)?'selected':''}>
    <input type="checkbox" checked={labourIds.includes(l.id)} onChange={()=>toggle(l.id)} disabled={['Dispatched','In Transit'].includes(order.status)}/>
    <span><b>{l.name}</b><small>{l.area||'—'} · {money(l.rate)}</small></span>
   </label>)}</div>}
  </div>

  <div className={'dispatch-ready '+(ready?'':'warn')}>
   <b>{ready?'✓ Ready to Dispatch':'⚠ Assignment Incomplete'}</b>
   <div className="dispatch-checks">
    <span className="dispatch-check">{vehicleId?'✓':'○'} Vehicle</span>
    <span className="dispatch-check">{driverId?'✓':'○'} Driver</span>
    <span className="dispatch-check">{required===0||labourIds.length>=required?'✓':'○'} Labour</span>
   </div>
  </div>

  <div className="dispatch-cost">
   <div className="preview-row"><span>Customer Final Rate</span><b>{money(order.customer_rate)}</b></div>
   <div className="preview-row"><span>Actual Vehicle Cost</span><b>{money(vehicleCost)}</b></div>
   <div className="preview-row"><span>Actual Labour Cost</span><b>{money(labourCost)}</b></div>
   <div className="preview-row"><span>Gross Margin</span><b className={gross>=0?'margin-positive':'margin-negative'}>{money(gross)}</b></div>
  </div>

  {error&&<div className="form-error">{error}</div>}
  {order.status==='New'&&<button className="primary stage-main-action" disabled={!ready||busy} onClick={onAssign}>{busy?'Saving…':'Save Assignment'}</button>}
  {order.status==='Assigned'&&<><button className="outline full" disabled={!ready||busy} onClick={onAssign}>Update Assignment</button><button className="primary stage-main-action" disabled={!ready||busy} onClick={()=>onStage('Dispatched')}>Confirm Dispatch</button></>}
  {order.status==='Dispatched'&&<button className="primary stage-main-action" disabled={busy} onClick={()=>onStage('In Transit')}>▶ Start Trip</button>}
  {order.status==='In Transit'&&<button className="primary stage-main-action" disabled={busy} onClick={()=>onStage('Delivered')}>✓ Mark Delivered</button>}
 </>
}
