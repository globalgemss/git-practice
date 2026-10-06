import React,{useEffect,useMemo,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {
  AlertTriangle,ArrowLeft,CalendarClock,CheckCircle2,ChevronRight,Clock3,
  ExternalLink,LockKeyhole,MapPin,Package,RefreshCw,Route,ShieldCheck,
  Truck,UserRound,UsersRound,WalletCards,XCircle
} from 'lucide-react'
import {assignResources,confirmDispatch,overrideOrderStage,transitionOrder} from '../services/api'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {formatDate,formatTime,money,num} from '../utils/format'
import {orderFinancial} from '../utils/accounting'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import StatusBadge from '../components/StatusBadge'
import SearchPicker from '../components/SearchPicker'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import OrderFinanceActionModal from '../components/OrderFinanceActionModal'

function useClock(active=true){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{if(!active)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[active])
  return now
}
function duration(start,now){
  if(!start)return '00:00:00'
  const ms=Math.max(0,now-new Date(start).getTime()),s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60
  return [h,m,ss].map(x=>String(x).padStart(2,'0')).join(':')
}

const activeStages=['New','Assigned','Dispatched','In Transit','Delivered']
const lifecycle=['New','Assigned','Dispatched','In Transit','Delivered','Completed']
const allStages=[...lifecycle,'Cancelled']
const nextStage={New:'Assigned',Assigned:'Dispatched',Dispatched:'In Transit','In Transit':'Delivered',Delivered:'Completed'}
const stageHint={
  New:'Waiting for assignment',Assigned:'Resources reserved',Dispatched:'Waiting to start trip',
  'In Transit':'Trip is running',Delivered:'Waiting operational completion',Completed:'Operationally closed',Cancelled:'Cancelled'
}
const isCurrentReservation=(resourceId,currentId,status)=>status==='Reserved'&&!!resourceId&&resourceId===currentId

export default function Dispatch(){
  const nav=useNavigate(),[sp,setSp]=useSearchParams()
  const statusParam=sp.get('status')
  const selectedId=sp.get('order')||''

  // Load all non-archived orders so a just-completed/cancelled selected order stays visible.
  const {rows:orders,reload:reloadOrders,error:ordersError}=useRealtimeTable('orders',{filters:[['archived','eq',false]],order:'created_at'})
  const {rows:vehicles,reload:reloadVehicles}=useRealtimeTable('vehicles',{filters:[['archived','eq',false]],order:'number',ascending:true})
  const {rows:drivers,reload:reloadDrivers}=useRealtimeTable('drivers',{filters:[['archived','eq',false]],order:'name',ascending:true})
  const {rows:labour,reload:reloadLabour}=useRealtimeTable('labourers',{filters:[['archived','eq',false]],order:'name',ascending:true})
  const {rows:rates}=useRealtimeTable('rates',{filters:[['active','eq',true]],order:'sort_order',ascending:true})
  const {rows:assignments,reload:reloadAssignments}=useRealtimeTable('order_labour_assignments',{order:'assigned_at',ascending:true})
  const {rows:orderEvents}=useRealtimeTable('order_events',{filters:[['order_id','eq',selectedId||'__none__']],order:'created_at',ascending:true})
  const {rows:transactions,reload:reloadTransactions}=useRealtimeTable('transactions',{filters:[['order_id','eq',selectedId||'__none__'],['archived','eq',false]],order:'created_at',ascending:false})

  const initialStatus=allStages.includes(statusParam)?statusParam:'All Active'
  const [search,setSearch]=useState(''),[status,setStatus]=useState(initialStatus),[sort,setSort]=useState('pickup'),[queueView,setQueueView]=useState('table')
  const [vehicleId,setVehicleId]=useState(''),[driverId,setDriverId]=useState(''),[labourIds,setLabourIds]=useState([])
  const [overrideReason,setOverrideReason]=useState('')
  const [stageRequest,setStageRequest]=useState(null),[paymentOpen,setPaymentOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')

  const selected=orders.find(o=>o.id===selectedId)||null
  const selectedVehicle=vehicles.find(v=>v.id===vehicleId)||null
  const defaultDriver=drivers.find(d=>d.id===selectedVehicle?.default_driver_id)||null
  const selectedDriver=drivers.find(d=>d.id===driverId)||null
  const selectedFinance=selected?orderFinancial(selected,transactions):null
  const customerReceived=selectedFinance?.received||0
  const customerBalance=selectedFinance?.receivable||0

  useEffect(()=>{
    if(statusParam&&allStages.includes(statusParam)&&status!==statusParam)setStatus(statusParam)
  },[statusParam])

  useEffect(()=>{
    if(!selected){setVehicleId('');setDriverId('');setLabourIds([]);setOverrideReason('');setPaymentOpen(false);return}
    const vid=selected.vehicle_id||''
    const currentLabour=assignments.filter(a=>a.order_id===selected.id&&!a.released_at).map(a=>a.labour_id)
    // Delivered/Completed releases labour, so use historical assignments for a readable detail summary.
    const historicalLabour=assignments.filter(a=>a.order_id===selected.id).map(a=>a.labour_id)
    setVehicleId(vid)
    setDriverId(selected.driver_id||'')
    setLabourIds(currentLabour.length?currentLabour:[...new Set(historicalLabour)])
    setOverrideReason(selected.driver_override_reason||'')
  },[selectedId,selected?.vehicle_id,selected?.driver_id,selected?.driver_override_reason,assignments,vehicles])

  const updateParams=changes=>{
    const next=new URLSearchParams(sp)
    Object.entries(changes).forEach(([k,v])=>{if(v===null||v===undefined||v==='')next.delete(k);else next.set(k,String(v))})
    setSp(next)
  }
  const setFilterStatus=value=>{
    setStatus(value)
    updateParams({status:value==='All Active'?null:value})
  }
  const openOrder=id=>updateParams({order:id})
  const backQueue=()=>{setError('');setStageRequest(null);updateParams({order:null})}

  const matchesVehicle=v=>selected&&(
    (selected.vehicle_type_id&&v.vehicle_type_id&&selected.vehicle_type_id===v.vehicle_type_id)||
    (!selected.vehicle_type_id&&String(v.type||'').toLowerCase()===String(selected.vehicle_type||'').toLowerCase())||
    (!v.vehicle_type_id&&String(v.type||'').toLowerCase()===String(selected.vehicle_type||'').toLowerCase())
  )
  const eligibleVehicles=selected?vehicles.filter(v=>matchesVehicle(v)&&(v.status==='Available'||v.id===selected.vehicle_id)):[]
  const eligibleDrivers=drivers.filter(d=>d.status==='Available'||d.id===selected?.driver_id||d.id===selectedVehicle?.default_driver_id)
  const eligibleLabour=labour.filter(l=>l.status==='Available'||labourIds.includes(l.id))
  const rate=selected?(rates.find(r=>r.vehicle_type_id===selected.vehicle_type_id)||rates.find(r=>r.vehicle_type===selected.vehicle_type)||{}):{}
  const vehicleCost=selected&&vehicleId?Math.round(num(rate.partner_base||rate.partner_rate)+Math.max(0,num(selected.distance)-num(rate.base_km))*num(rate.partner_per_km)):0
  const labourCost=labourIds.reduce((s,id)=>s+num(labour.find(x=>x.id===id)?.rate),0)
  const required=selected?(selected.labour_mode==='Separate Crew'?num(selected.loading)+num(selected.unloading):Math.max(num(selected.loading),num(selected.unloading))):0
  const driverAvailable=!!driverId&&!!selectedDriver&&(selectedDriver.status==='Available'||isCurrentReservation(selectedDriver.id,selected?.driver_id,selectedDriver.status)||['Dispatched','In Transit','Delivered','Completed'].includes(selected?.status))
  const isDriverOverride=!!selectedVehicle?.default_driver_id&&!!driverId&&driverId!==selectedVehicle.default_driver_id
  const overrideValid=!isDriverOverride||!!overrideReason.trim()
  const ready=!!vehicleId&&driverAvailable&&overrideValid&&(required===0||labourIds.length>=required)

  const queue=useMemo(()=>{
    const q=search.trim().toLowerCase()
    const list=orders.filter(o=>{
      const statusOk=status==='All Active'?activeStages.includes(o.status):o.status===status
      const text=[o.id,o.customer,o.phone,o.pickup,o.drop,o.goods,o.vehicle_type,o.driver_name,o.status].join(' ').toLowerCase()
      return statusOk&&(!q||text.includes(q))
    })
    return [...list].sort((a,b)=>
      sort==='oldest'?String(a.created_at||'').localeCompare(String(b.created_at||'')):
      sort==='rate'?num(b.customer_rate)-num(a.customer_rate):
      sort==='stage'?allStages.indexOf(a.status)-allStages.indexOf(b.status):
      sort==='pickup'?String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')):
      String(b.created_at||'').localeCompare(String(a.created_at||''))
    )
  },[orders,search,status,sort])

  const selectVehicle=id=>{
    const v=vehicles.find(x=>x.id===id)
    setVehicleId(id);setOverrideReason('');setDriverId(v?.default_driver_id||'')
  }
  const selectDriver=id=>{setDriverId(id);if(!selectedVehicle?.default_driver_id||id===selectedVehicle.default_driver_id)setOverrideReason('')}
  const refreshOperational=async()=>Promise.all([
    reloadOrders({silent:true}),reloadVehicles({silent:true}),reloadDrivers({silent:true}),reloadLabour({silent:true}),reloadAssignments({silent:true}),reloadTransactions({silent:true})
  ])
  const persistAssignment=async()=>{
    if(!selected)throw new Error('Select an order first.')
    if(!driverId)throw new Error('Select a trip driver before saving the assignment.')
    if(!ready)throw new Error('Complete vehicle, driver and labour assignment first.')
    return assignResources({orderId:selected.id,vehicleId,driverId,labourIds,vehicleCost,labourCost,driverOverrideReason:isDriverOverride?overrideReason:''})
  }
  const saveAssign=async()=>{
    if(!selected||!ready||busy)return
    setBusy(true);setError('')
    try{await persistAssignment();await refreshOperational()}
    catch(e){setError(e.message||'Assignment could not be saved.')}
    finally{setBusy(false)}
  }
  const normalStage=async(target,note)=>{
    if(!selected||busy)return
    setBusy(true);setError('')
    try{
      if(target==='Assigned')await persistAssignment()
      else if(target==='Dispatched')await confirmDispatch(selected.id)
      else await transitionOrder(selected.id,target,note||`Stage changed to ${target}`)
      await refreshOperational()
    }catch(e){setError(e.message||'Dispatch stage could not be changed.')}
    finally{setBusy(false)}
  }
  const requestStage=target=>{
    if(!selected||!target||target===selected.status)return
    if(target===nextStage[selected.status]){normalStage(target);return}
    if(target==='Cancelled'&&['New','Assigned'].includes(selected.status)){setStageRequest({target,requirePin:false});return}
    setStageRequest({target,requirePin:true})
  }
  const submitStageOverride=async({target,reason,pin,requirePin})=>{
    if(!selected)return
    setBusy(true);setError('')
    try{
      if(requirePin)await overrideOrderStage(selected.id,target,reason,pin)
      else await transitionOrder(selected.id,'Cancelled',reason||'Order cancelled')
      setStageRequest(null);await refreshOperational()
    }catch(e){setError(e.message||'Stage override failed.')}
    finally{setBusy(false)}
  }

  const now=useClock(orders.some(o=>o.status==='In Transit'))
  const stats=Object.fromEntries(activeStages.map(s=>[s,orders.filter(o=>o.status===s).length]))
  const sharedError=error||ordersError?.message||''

  if(selected){
    return <>
      <DispatchDetail
        order={selected} vehicles={eligibleVehicles} drivers={eligibleDrivers} labour={eligibleLabour}
        vehicleId={vehicleId} driverId={driverId} labourIds={labourIds}
        selectedVehicle={selectedVehicle} defaultDriver={defaultDriver} selectedDriver={selectedDriver}
        overrideReason={overrideReason} setOverrideReason={setOverrideReason} isDriverOverride={isDriverOverride}
        setVehicle={selectVehicle} setDriver={selectDriver} setLabourIds={setLabourIds} orderEvents={orderEvents}
        required={required} ready={ready} vehicleCost={vehicleCost} labourCost={labourCost}
        received={customerReceived} customerBalance={customerBalance}
        busy={busy} error={sharedError} onAssign={saveAssign} onStage={normalStage} onRequestStage={requestStage}
        now={now} onBack={backQueue} onOpenFleet={()=>nav('/fleet')} onOpenOrder={()=>nav(`/orders/${selected.id}`)}
        onViewSlip={()=>nav(`/slips?order=${encodeURIComponent(selected.id)}&type=DISPATCH&preview=1`)}
        onReceivePay={()=>setPaymentOpen(true)}
      />
      {stageRequest&&<StageOverrideModal order={selected} request={stageRequest} busy={busy} onClose={()=>setStageRequest(null)} onSubmit={submitStageOverride}/>}
      {paymentOpen&&<OrderFinanceActionModal order={selected} mode="receive-customer" onClose={()=>setPaymentOpen(false)} onSaved={async()=>{await Promise.all([reloadOrders({silent:true}),reloadTransactions({silent:true})])}} onOpenSlip={(slip,print=false)=>nav(`/slips?order=${encodeURIComponent(selected.id)}&type=${encodeURIComponent(slip.type)}&slip=${encodeURIComponent(slip.id)}${print?'&print=1':''}`)}/>} 
    </>
  }

  return <>
    <PageTitle title="Dispatch" subtitle="Simple queue first. Open an order only when you are ready to assign resources or move the trip." actions={<div className="dispatch-title-actions"><button className="outline" onClick={()=>nav('/jobs')}>View Jobs</button><button className="outline" onClick={()=>nav('/orders')}>View Orders</button></div>}/>

    <div className="dispatch-queue-kpis">
      <QueueKpi tone="amber" label="Need Dispatch" value={stats.New||0} sub="waiting assignment" active={status==='New'} onClick={()=>setFilterStatus('New')}/>
      <QueueKpi tone="violet" label="Assigned" value={stats.Assigned||0} sub="ready to confirm" active={status==='Assigned'} onClick={()=>setFilterStatus('Assigned')}/>
      <QueueKpi tone="blue" label="Dispatched" value={stats.Dispatched||0} sub="waiting to start" active={status==='Dispatched'} onClick={()=>setFilterStatus('Dispatched')}/>
      <QueueKpi tone="cyan" label="In Transit" value={stats['In Transit']||0} sub="trip running" active={status==='In Transit'} onClick={()=>setFilterStatus('In Transit')}/>
      <QueueKpi tone="green" label="Delivered" value={stats.Delivered||0} sub="waiting completion" active={status==='Delivered'} onClick={()=>setFilterStatus('Delivered')}/>
    </div>

    {sharedError&&<div className="form-error">{sharedError}</div>}
    <SearchFilterBar search={search} onSearch={setSearch} view={queueView} onView={setQueueView} placeholder="Search order, customer, phone, route, goods…" onReset={()=>{setSearch('');setFilterStatus('All Active');setSort('pickup')}}>
      <select value={status} onChange={e=>setFilterStatus(e.target.value)}>
        <option>All Active</option>{allStages.map(x=><option key={x}>{x}</option>)}
      </select>
      <select value={sort} onChange={e=>setSort(e.target.value)}>
        <option value="pickup">Pickup Soonest</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="rate">Highest Rate</option><option value="stage">Stage</option>
      </select>
    </SearchFilterBar>

    <section className="panel dispatch-queue-page">
      <div className="dispatch-list-head"><div><small>OPERATIONAL QUEUE</small><h3>Dispatch Queue</h3><span>{queue.length} order{queue.length===1?'':'s'} shown</span></div>{status!=='All Active'&&<button className="ghost small" onClick={()=>setFilterStatus('All Active')}>Show All Active</button>}</div>
      {queue.length?(queueView==='table'?<QueueTable rows={queue} assignments={assignments} now={now} onOpen={openOrder}/>:<QueueCards rows={queue} assignments={assignments} now={now} onOpen={openOrder}/>):<EmptyState title="No dispatch orders match" text="Change the search or stage filter to see another queue."/>}
    </section>
  </>
}

function QueueKpi({tone,label,value,sub,active,onClick}){
  return <button className={`dispatch-queue-kpi ${tone} ${active?'active':''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{sub}</small><ChevronRight size={15}/></button>
}

function labourNeed(o){return o.labour_mode==='Separate Crew'?num(o.loading)+num(o.unloading):Math.max(num(o.loading),num(o.unloading))}
function actionLabel(status){return status==='New'?'Open Assignment':status==='Assigned'?'Open & Confirm':status==='Dispatched'?'Open & Start':status==='In Transit'?'Open Live Trip':status==='Delivered'?'Open & Complete':'View'}

function QueueTable({rows,assignments,now,onOpen}){
  return <div className="table-wrap dispatch-classic-table-wrap"><table className="dispatch-classic-table"><thead><tr><th className="sn-col">S.N.</th><th>Order / Customer</th><th>Route</th><th>Vehicle</th><th>Pickup</th><th>Labour</th><th className="money-col">Rate</th><th>Stage</th><th>Action</th></tr></thead><tbody>{rows.map((o,i)=>{
    const need=labourNeed(o),assigned=assignments.filter(a=>a.order_id===o.id&&!a.released_at).length
    return <tr key={o.id} onDoubleClick={()=>onOpen(o.id)}><td className="sn-col">{i+1}</td><td><button className="dispatch-order-link" onClick={()=>onOpen(o.id)}>{o.id}</button><b>{o.customer||'Customer'}</b><small>{o.phone||'No phone'}</small></td><td><b>{o.pickup||'—'} → {o.drop||'—'}</b><small>{o.goods||'No goods detail'}</small></td><td><b>{o.vehicle_type||'Not decided'}</b><small>{o.vehicle_id?'Assigned':'Requirement'}</small></td><td><b>{formatDate(o.date)}</b><small>{formatTime(o.time)}</small></td><td><b>{need?`${assigned}/${need}`:'0 required'}</b><small>{o.labour_mode||'Same Crew'}</small></td><td className="money-cell"><b>{money(o.customer_rate)}</b></td><td><StatusBadge status={o.status}/>{o.status==='In Transit'&&<small className="trip-live-mini">Trip {duration(o.trip_started_at,now)}</small>}</td><td><button className="outline small dispatch-open-btn" onClick={()=>onOpen(o.id)}>{actionLabel(o.status)} <ChevronRight size={14}/></button></td></tr>
  })}</tbody></table></div>
}

function QueueCards({rows,assignments,now,onOpen}){
  return <div className="dispatch-classic-cards">{rows.map(o=>{const need=labourNeed(o),assigned=assignments.filter(a=>a.order_id===o.id&&!a.released_at).length;return <article key={o.id} className="dispatch-classic-card" onClick={()=>onOpen(o.id)}><div className="dispatch-classic-card-head"><div><b>{o.id}</b><strong>{o.customer||'Customer'}</strong></div><StatusBadge status={o.status}/></div><div className="dispatch-classic-route"><Route size={16}/><span>{o.pickup||'—'} <i>→</i> {o.drop||'—'}</span></div><div className="dispatch-classic-card-meta"><span><small>Vehicle</small><b>{o.vehicle_type||'Not decided'}</b></span><span><small>Pickup</small><b>{formatDate(o.date)} · {formatTime(o.time)}</b></span><span><small>Labour</small><b>{need?`${assigned}/${need}`:'0 required'}</b></span><span><small>Rate</small><b>{money(o.customer_rate)}</b></span></div>{o.status==='In Transit'&&<div className="dispatch-classic-live">LIVE · {duration(o.trip_started_at,now)}</div>}<button className="primary small">{actionLabel(o.status)} <ChevronRight size={14}/></button></article>})}</div>
}

function DispatchDetail({order,vehicles,drivers,labour,vehicleId,driverId,labourIds,selectedVehicle,defaultDriver,selectedDriver,overrideReason,setOverrideReason,isDriverOverride,setVehicle,setDriver,setLabourIds,orderEvents,required,ready,vehicleCost,labourCost,received,customerBalance,busy,error,onAssign,onStage,onRequestStage,now,onBack,onOpenFleet,onOpenOrder,onViewSlip,onReceivePay}){
  const locked=['Dispatched','In Transit','Delivered','Completed','Cancelled'].includes(order.status)
  const toggle=id=>setLabourIds(labourIds.includes(id)?labourIds.filter(x=>x!==id):[...labourIds,id])
  const gross=num(order.customer_rate)-vehicleCost-labourCost-num(order.additional_cost)
  const currentIndex=lifecycle.indexOf(order.status)
  const driverReady=!!driverId
  const labourReady=required===0||labourIds.length>=required
  const route=`${order.pickup||'—'} → ${order.drop||'—'}`
  const activity=(orderEvents||[]).slice().reverse().slice(0,8)
  const ownerLabel=selectedVehicle?.owner||selectedVehicle?.partner_name||selectedVehicle?.owner_name||'—'
  const selectedLabour=labourIds.map(id=>labour.find(x=>x.id===id)).filter(Boolean)

  return <div className="classic-dispatch-detail-page">
    <div className="classic-dispatch-title-row">
      <div className="classic-dispatch-title-copy">
        <h1>Order Detail · {order.id}</h1>
        <p>{formatDate(order.date)} · {formatTime(order.time)} · {order.customer||'Customer'}</p>
      </div>
      <div className="classic-dispatch-title-actions">
        <button className="outline classic-back-queue" onClick={onBack}><ArrowLeft size={16}/> Dispatch Queue</button>
        <div className="classic-stage-control">
          <span>ORDER STAGE</span>
          <select value={order.status} disabled={busy} onChange={e=>onRequestStage(e.target.value)}>{allStages.map(s=><option key={s}>{s}</option>)}</select>
          <small>{nextStage[order.status]?`Next: ${nextStage[order.status]} · other jumps need PIN`:'Protected stage changes need PIN'}</small>
        </div>
      </div>
    </div>

    <div className="classic-dispatch-lifecycle"><DispatchLifecycle current={order.status}/></div>

    <div className="classic-dispatch-layout">
      <main className="classic-dispatch-main">
        <section className={`classic-work-stage stage-${String(order.status).toLowerCase().replaceAll(' ','-')}`}>
          <div className="classic-stage-icon">{order.status==='In Transit'?<Truck size={24}/>:order.status==='Delivered'||order.status==='Completed'?<CheckCircle2 size={24}/>:<Clock3 size={24}/>}</div>
          <div className="classic-stage-copy"><small>CURRENT WORK STAGE</small><h2>{order.status==='New'?'New Order':order.status}</h2><p>{stageHint[order.status]||'Operational stage'}</p><div className="classic-stage-meta"><span><Clock3 size={12}/>{formatDate(order.last_stage_at||order.created_at)} · {formatTime(order.last_stage_at||order.created_at)}</span><span><MapPin size={12}/>{route}</span>{selectedVehicle&&<span><Truck size={12}/>{selectedVehicle.number}</span>}</div></div>
          <div className="classic-stage-actions"><StageMainAction order={order} ready={ready} busy={busy} onAssign={onAssign} onStage={onStage} onViewSlip={onViewSlip} onReceivePay={onReceivePay} customerBalance={customerBalance} received={received}/></div>
        </section>

        {order.status==='Completed'&&<section className={`order-payment-next-banner ${customerBalance>0?'due':'settled'}`}><span className="order-payment-next-icon">{customerBalance>0?<WalletCards size={22}/>:<CheckCircle2 size={22}/>}</span><div><small>ORDER JOURNEY · NEXT STEP</small><h3>{customerBalance>0?'Job completed · receive the customer balance':'Job completed & customer payment settled'}</h3><p>{customerBalance>0?`${money(customerBalance)} is still due. Receive it here without opening Receive & Pay or searching the order.`:'No customer balance remains. Accounting history is still available in Receive & Pay.'}</p></div>{customerBalance>0?<button className="primary" onClick={onReceivePay}>Receive Payment Now</button>:<span className="order-payment-done-pill"><CheckCircle2 size={14}/> Settled</span>}</section>}

        {order.status==='In Transit'&&<section className="panel classic-trip-progress">
          <div className="panel-head"><div><h3>Trip in Progress</h3><small>Current operational focus</small></div><span className="chip">LIVE</span></div>
          <div className="classic-trip-route"><div className="classic-trip-stop done"><i>✓</i><b>{order.pickup||'Pickup'}</b><small>Pickup</small></div><div className="classic-trip-line done"/><span className="classic-trip-vehicle">🚚</span><div className="classic-trip-line"/><div className="classic-trip-stop"><i>○</i><b>{order.drop||'Destination'}</b><small>Destination</small></div></div>
          <div className="classic-trip-timer"><div><small>LIVE TRIP TIMER</small><strong>{duration(order.trip_started_at,now)}</strong></div><span>Started {formatDate(order.trip_started_at)} · {formatTime(order.trip_started_at)}</span></div>
          <div className="classic-trip-grid"><div><small>Trip Started</small><b>{formatDate(order.trip_started_at)} · {formatTime(order.trip_started_at)}</b></div><div><small>Vehicle</small><b>{selectedVehicle?.number||order.vehicle_id||'—'}</b></div><div><small>Driver</small><b>{selectedDriver?.name||order.driver_name||'—'}</b></div><div><small>Customer</small><b>{order.customer||'—'}</b></div></div>
        </section>}

        {order.status==='Delivered'&&<section className="panel classic-delivery-confirmation"><div className="panel-head"><div><h3>Delivery Confirmation</h3><small>Resources are released; operational close is still pending.</small></div><StatusBadge status="Delivered"/></div><div className="classic-delivery-grid"><div><i>✓</i><span><b>Destination reached</b><small>{formatDate(order.delivered_at)} · {formatTime(order.delivered_at)}</small></span></div><div><i>✓</i><span><b>Vehicle released</b><small>{selectedVehicle?.number||order.vehicle_id||order.vehicle_type||'—'}</small></span></div><div><i>✓</i><span><b>Labour released</b><small>{labourIds.length} assigned worker(s)</small></span></div></div></section>}

        <section className="panel classic-job-information">
          <div className="panel-head"><h3>Customer & Job Information</h3><StatusBadge status={order.status}/></div>
          <div className="classic-detail-grid"><div><small>Customer</small><b>{order.customer||'—'}</b><span>{order.phone||'No phone'} · {order.source==='Lead'&&order.source_lead_id?`Lead ${order.source_lead_id}`:'Direct Order'}</span></div><div><small>Route</small><b>{route}</b><span>{order.distance?`${order.distance} KM approx.`:'Distance not set'}</span></div><div><small>Goods</small><b>{order.goods||'—'}</b><span>{order.notes||'No special notes'}</span></div><div><small>Service</small><b>{order.vehicle_type||'Not decided'}</b><span>Loading {num(order.loading)} · Unloading {num(order.unloading)}</span></div></div>
        </section>

        {!locked?<div className="classic-assignment-grid">
          <section className="panel classic-assign-panel">
            <div className="panel-head"><h3>Assign Vehicle</h3>{selectedVehicle&&<StatusBadge status={selectedVehicle.status}/>}</div>
            <label className="field"><span>Matching {order.vehicle_type||'Vehicle'} *</span><select value={vehicleId} onChange={e=>setVehicle(e.target.value)}><option value="">Select available vehicle</option>{vehicles.map(v=>{const d=drivers.find(x=>x.id===v.default_driver_id);return <option key={v.id} value={v.id}>{v.number} · {v.area||'—'} · {d?.name||'No regular driver'}</option>})}</select></label>
            {!selectedVehicle?<p className="muted classic-empty-assignment">No vehicle assigned yet.</p>:<div className="classic-selected-vehicle">
              <div className="classic-selected-vehicle-head"><div><b>{selectedVehicle.type||order.vehicle_type||'Vehicle'} · {selectedVehicle.number}</b><span>{selectedVehicle.area||'—'} · {selectedVehicle.capacity||'—'}{selectedVehicle.rating?` · ★${selectedVehicle.rating}`:''}</span></div><StatusBadge status={selectedVehicle.status}/></div>
              <div className="classic-vehicle-kv"><span>Owner / Partner</span><b>{ownerLabel}</b></div>
              <div className="classic-vehicle-kv"><span>Regular Driver</span><b>{defaultDriver?.name||'Not linked'}</b></div>
              {!defaultDriver&&<div className="classic-driver-info-note"><AlertTriangle size={15}/><span>No regular driver is linked to this vehicle. Select the actual trip driver below.</span></div>}
              <label className="field classic-trip-driver-field"><span>Trip Driver *</span><select value={driverId} onChange={e=>setDriver(e.target.value)}><option value="">Select driver</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name} · {d.mobile||'—'} · {d.status}</option>)}</select></label>
              {selectedDriver&&<div className={`classic-trip-driver-card ${isDriverOverride?'override':''}`}><div><small>Actual Trip Driver</small><b>{selectedDriver.name}</b><span>{selectedDriver.mobile||'No mobile'} · {selectedDriver.status}</span></div>{defaultDriver&&driverId===defaultDriver.id?<span className="classic-driver-tag">Regular</span>:<span className="classic-driver-tag alternate">Trip Driver</span>}</div>}
              {isDriverOverride&&<label className="field classic-driver-reason"><span>Driver Change Reason *</span><input value={overrideReason} onChange={e=>setOverrideReason(e.target.value)} placeholder="Example: Regular driver on leave"/></label>}
            </div>}
          </section>

          <section className="panel classic-assign-panel">
            <div className="panel-head"><h3>Assign Labour</h3><span className="chip">{labourIds.length} assigned</span></div>
            <div className="classic-labour-requirement"><span>{order.labour_mode||'Same Crew'}</span><b>{num(order.loading)} loading · {num(order.unloading)} unloading</b><small>{required?`${required} labour required`:'No labour required'}</small></div>
            {required===0?<p className="muted classic-empty-assignment">No labour requested for this order.</p>:<div className="classic-labour-list">{labour.map(l=>{const checked=labourIds.includes(l.id);return <label key={l.id} className={checked?'checked':''}><input type="checkbox" checked={checked} onChange={()=>toggle(l.id)}/><span><b>{l.name}</b><small>{l.skill||'Labour'} · {l.area||'—'} · {money(l.rate)}</small></span><StatusBadge status={checked?'Reserved':l.status}/></label>})}</div>}
          </section>
        </div>:<section className="panel classic-assignment-summary"><div className="panel-head"><h3>🚚 Assignment Summary</h3><span>{selectedVehicle?.number||order.vehicle_id||'No vehicle'}</span></div><div className="classic-summary-grid"><SummaryCell label="Vehicle" value={selectedVehicle?`${selectedVehicle.type||order.vehicle_type||''} · ${selectedVehicle.number}`:order.vehicle_id||'Not assigned'}/><SummaryCell label="Driver / Partner" value={`${selectedDriver?.name||order.driver_name||'—'} · ${ownerLabel}`}/><SummaryCell label="Labour" value={selectedLabour.length?selectedLabour.map(x=>x.name).join(', '):required?'No labour recorded':'Not required'}/><SummaryCell label="Dispatch Status" value={order.status}/></div></section>}

        {!locked&&<section className={`classic-readiness ${ready?'ready':'warn'}`}><div><b>{ready?'✓ Ready to Dispatch':'○ Assignment Incomplete'}</b><span>{ready?'Vehicle, trip driver and required labour are ready. Save the assignment to reserve resources.':'Select the vehicle, trip driver and required labour.'}</span></div><div className="classic-ready-checks"><span className={vehicleId?'ok':''}>{vehicleId?'✓':'○'} Vehicle</span><span className={driverReady?'ok':''}>{driverReady?'✓':'○'} Driver</span><span className={labourReady?'ok':''}>{labourReady?'✓':'○'} Labour {labourIds.length}/{required}</span></div></section>}

        {gross<0&&<div className="dispatch-margin-warning"><AlertTriangle size={18}/><div><b>Negative margin warning</b><span>Customer rate is below expected vehicle and labour costs by {money(Math.abs(gross))}.</span></div></div>}
        {error&&<div className="form-error">{error}</div>}

        <details className="panel classic-cost-summary"><summary><span>Financial Summary</span><small>{money(order.customer_rate)} bill · {money(customerBalance)} customer balance</small></summary><div className="classic-finance-grid"><SummaryCell label="Customer Bill" value={money(order.customer_rate)}/><SummaryCell label="Received" value={money(received)} tone={received>0?'success':''}/><SummaryCell label="Customer Balance" value={money(customerBalance)} tone={customerBalance>0?'danger':'success'}/><SummaryCell label="Expected Margin" value={money(gross)} tone={gross<0?'danger':'success'}/></div><div className="classic-finance-direct-action"><div><b>Order-linked payment</b><span>{customerBalance>0?'Receive advance, partial or final balance directly for this order.':'Customer payment is fully settled.'}</span></div>{customerBalance>0?<button className="primary small" onClick={onReceivePay}>{received>0?'Receive Balance':'Receive Payment'} · {money(customerBalance)}</button>:<span className="order-payment-done-pill"><CheckCircle2 size={13}/> Paid</span>}</div></details>

        {!!activity.length&&<section className="panel classic-dispatch-activity"><div className="panel-head"><div><h3>Order Timeline</h3><small>Every important activity is saved with date and time.</small></div><span className="chip">{orderEvents.length} events</span></div><div className="classic-activity-list">{activity.map(ev=><div key={ev.id||`${ev.created_at}-${ev.event_type}`}><i>✓</i><div><b>{ev.note||ev.event_type||'Recorded activity'}</b><span>📅 {formatDate(ev.created_at)} · Recorded activity</span></div><time>◷ {formatTime(ev.created_at)}</time></div>)}</div><button className="outline small" onClick={onOpenOrder}>Open Full Order Timeline</button></section>}
      </main>

      <aside className="panel classic-dispatch-preview">
        <div className="classic-preview-head"><div><small>LIVE ASSIGNMENT PREVIEW</small><h3>Dispatch Summary</h3></div><StatusBadge status={order.status}/></div>
        <div className="classic-preview-row"><span>Order / Customer</span><b>{order.id} · {order.customer||'—'}</b></div><div className="classic-preview-row"><span>Route</span><b>{route}</b></div><div className="classic-preview-row"><span>Required Vehicle</span><b>{order.vehicle_type||'Not decided'}</b></div><div className="classic-preview-row"><span>Assigned Vehicle</span><b>{selectedVehicle?.number||order.vehicle_id||'Not assigned'}</b></div><div className="classic-preview-row"><span>Partner / Owner</span><b>{ownerLabel}</b></div><div className="classic-preview-row"><span>Driver</span><b>{selectedDriver?.name||order.driver_name||'Not assigned'}</b></div><div className="classic-preview-row"><span>Loading / Unloading</span><b>{num(order.loading)} / {num(order.unloading)}</b></div><div className="classic-preview-row"><span>Assigned Labour</span><b>{labourIds.length} / {required} required</b></div><div className="classic-preview-row"><span>Pickup</span><b>{formatDate(order.date)} · {formatTime(order.time)}</b></div>
        <div className={`classic-preview-ready ${ready||locked?'ready':'warn'}`}><b>{locked?'✓ Assignment Confirmed':ready?'✓ Ready to Dispatch':'⚠ Dispatch Incomplete'}</b><div><span className={vehicleId?'ok':''}>{vehicleId?'✓':'○'} Vehicle</span><span className={driverReady?'ok':''}>{driverReady?'✓':'○'} Driver</span><span className={labourReady?'ok':''}>{labourReady?'✓':'○'} Labour {labourIds.length}/{required}</span></div></div>
        <div className="classic-preview-cost"><div><span>Customer Final Rate</span><b>{money(order.customer_rate)}</b></div><div><span>Vehicle Partner Cost</span><b>{money(vehicleCost)}</b></div><div><span>Labour Cost</span><b>{money(labourCost)}</b></div><div className="margin"><span>Gross Margin</span><b className={gross<0?'danger':''}>{money(gross)}</b></div></div>
        <StageMainAction order={order} ready={ready} busy={busy} onAssign={onAssign} onStage={onStage} onViewSlip={onViewSlip} onReceivePay={onReceivePay} customerBalance={customerBalance} received={received} compact={false}/>
        <button className="outline full classic-open-order" onClick={onOpenOrder}><ExternalLink size={15}/> Open Full Order</button>
      </aside>
    </div>
  </div>
}
function StageMainAction({order,ready,busy,onAssign,onStage,onViewSlip,onReceivePay,customerBalance=0,received=0,compact=true}){
  const c=compact?'compact-stage-actions':''
  if(order.status==='New')return <div className={c}><button className="primary" disabled={!ready||busy} onClick={onAssign}>{busy?'Saving…':'Save Assignment'}</button></div>
  if(order.status==='Assigned')return <div className={c}><button className="outline" disabled={!ready||busy} onClick={onAssign}><RefreshCw size={15}/> Update Assignment</button><button className="primary" disabled={!ready||busy} onClick={()=>onStage('Dispatched')}><CheckCircle2 size={16}/>{busy?'Confirming…':'Confirm Dispatch & Create Slip'}</button></div>
  if(order.status==='Dispatched')return <div className={c}><button className="outline" onClick={onViewSlip}>View Slip</button><button className="primary" disabled={busy} onClick={()=>onStage('In Transit')}>▶ Start Trip</button></div>
  if(order.status==='In Transit')return <div className={c}><button className="outline" onClick={onViewSlip}>View Slip</button><button className="primary" disabled={busy} onClick={()=>onStage('Delivered')}>✓ Mark Delivered</button></div>
  if(order.status==='Delivered')return <div className={c}><button className="outline" onClick={onViewSlip}>View Slip</button><button className="primary" disabled={busy} onClick={()=>onStage('Completed')}>✓ Complete Job</button></div>
  if(order.status==='Completed')return <div className={c}><button className="outline" onClick={onViewSlip}>View Slip</button>{customerBalance>0?<button className="primary" onClick={onReceivePay}>{received>0?'Receive Balance':'Receive Payment'} · {money(customerBalance)}</button>:<span className="order-payment-done-pill"><CheckCircle2 size={13}/> Payment Settled</span>}</div>
  return <div className={c}><button className="outline" onClick={onViewSlip}>View Documents</button></div>
}

function DispatchLifecycle({current}){
  const idx=lifecycle.indexOf(current)
  return <div className="dispatch-lifecycle" role="list" aria-label="Dispatch lifecycle">{lifecycle.map((s,i)=><React.Fragment key={s}><div className={`dispatch-lifecycle-step ${i<idx?'done':i===idx?'current':''}`} role="listitem"><span>{i<idx?'✓':i===idx?'●':'○'}</span><b>{s}</b></div>{i<lifecycle.length-1&&<i className={i<idx?'done':''}/>}</React.Fragment>)}</div>
}

function InfoCell({icon,label,value,sub}){return <div className="dispatch-info-cell"><span>{icon}</span><div><small>{label}</small><b>{value}</b><em>{sub}</em></div></div>}
function SummaryCell({label,value,tone=''}){return <div className={`dispatch-summary-cell ${tone}`}><small>{label}</small><b>{value}</b></div>}
function ReadonlyAssignment({label,value,rows=[]}){return <div className="dispatch-readonly-assignment"><small>{label}</small><h4>{value}</h4>{rows.map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}

function StageOverrideModal({order,request,busy,onClose,onSubmit}){
  const [reason,setReason]=useState(''),[pin,setPin]=useState(''),[localError,setLocalError]=useState('')
  const isCancel=request.target==='Cancelled'
  const submit=()=>{
    if(!reason.trim())return setLocalError('Reason is required.')
    if(request.requirePin&&!/^\d{4}$/.test(pin))return setLocalError('Enter the 4-digit override PIN.')
    setLocalError('');onSubmit({target:request.target,reason:reason.trim(),pin,requirePin:request.requirePin})
  }
  return <Modal open title={isCancel?'Cancel Order':'Stage Override Required'} subtitle={request.requirePin?'This change does not follow the normal sequence. Reason and override PIN are required.':'Record the cancellation reason before continuing.'} eyebrow="Dispatch Control" icon={request.requirePin?<LockKeyhole size={19}/>:<XCircle size={19}/>} onClose={onClose} size="sm" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className={isCancel?'primary danger-action':'primary'} disabled={busy} onClick={submit}>{busy?'Applying…':request.requirePin?'Verify & Change Stage':'Confirm Cancellation'}</button></>}>
    <div className="stage-override-route"><div><small>Current Stage</small><StatusBadge status={order.status}/></div><ChevronRight size={20}/><div><small>Target Stage</small><StatusBadge status={request.target}/></div></div>
    <label className="field"><span>Reason *</span><textarea rows="3" value={reason} onChange={e=>setReason(e.target.value)} placeholder={isCancel?'Example: Customer cancelled the booking':'Example: Trip was completed before the system was updated'}/></label>
    {request.requirePin&&<label className="field"><span>Override PIN *</span><input type="password" inputMode="numeric" maxLength="4" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="4-digit PIN" autoFocus/></label>}
    <div className="form-note"><ShieldCheck size={16}/><span>The PIN is verified by the backend and is never written to the order timeline. The reason, actor and stage change are audited.</span></div>
    {localError&&<div className="form-error">{localError}</div>}
  </Modal>
}
