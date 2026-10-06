import React,{useEffect,useMemo,useState} from 'react'
import {useNavigate,useParams,useSearchParams} from 'react-router-dom'
import {Check,CheckCircle2,ChevronRight,ClipboardList,Clock3,Edit3,FileText,MapPin,PackageOpen,Phone,Play,Plus,ReceiptText,Save,Truck,UserRound,UsersRound,WalletCards} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {addOrderAmendment,insertRow,transitionOrder,updateOrderControlled} from '../services/api'
import {formatDate,formatTime,formatDateTime,money,num} from '../utils/format'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import SearchPicker from '../components/SearchPicker'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Timeline from '../components/Timeline'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import {Field,FormNote,FormSection} from '../components/FormKit'
import OrderFinanceActionModal from '../components/OrderFinanceActionModal'
import {DateStack,IdentityCell,MoneyCell,RouteCell,RowActions,SummaryCard,SummaryGrid} from '../components/TableKit'

const statuses=['All','New','Assigned','Dispatched','In Transit','Delivered','Completed','Cancelled']
const stages=['New','Assigned','Dispatched','In Transit','Delivered','Completed']

export default function Orders(){
 const {id}=useParams(),nav=useNavigate(),[sp]=useSearchParams(),{rows}=useRealtimeTable('orders',{filters:[['archived','eq',false]]})
 const [search,setSearch]=useState(''),[status,setStatus]=useState(()=>statuses.includes(sp.get('status'))?sp.get('status'):'All'),[sort,setSort]=useState('newest'),[view,setView]=useState('table')
 const filtered=useMemo(()=>{const q=search.toLowerCase();return rows.filter(o=>(status==='All'||o.status===status)&&(!q||[o.id,o.customer,o.phone,o.pickup,o.drop,o.goods,o.vehicle_type].join(' ').toLowerCase().includes(q))).sort((a,b)=>sort==='oldest'?String(a.created_at).localeCompare(String(b.created_at)):sort==='customer'?String(a.customer).localeCompare(String(b.customer)):String(b.created_at).localeCompare(String(a.created_at)))},[rows,search,status,sort])
 if(id)return <OrderDetail id={id}/>
 const needDispatch=rows.filter(o=>o.status==='New').length,assigned=rows.filter(o=>o.status==='Assigned').length,active=rows.filter(o=>['Dispatched','In Transit'].includes(o.status)).length,totalValue=rows.filter(o=>!['Cancelled'].includes(o.status)).reduce((sum,o)=>sum+num(o.customer_rate),0)
 const cols=[
  {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
  {key:'id',label:'Order',render:r=><span className="pro-stack-cell"><b className="link">{r.id}</b><small>{r.source||'Direct Order'}</small></span>},
  {key:'customer',label:'Customer',render:r=><IdentityCell title={r.customer} subtitle={r.phone} meta={r.customer_id||null}/>},
  {key:'route',label:'Route',render:r=><RouteCell from={r.pickup} to={r.drop} meta={r.goods||null}/>},
  {key:'vehicle',label:'Vehicle / Labour',render:r=><span className="pro-stack-cell"><b>{r.vehicle_type||'TBD'}</b><small>{r.labour_mode||'Same Crew'} · L {num(r.loading)} / U {num(r.unloading)}</small></span>},
  {key:'date',label:'Pickup',render:r=><DateStack date={formatDate(r.date)} time={formatTime(r.time)}/>},
  {key:'customer_rate',label:'Rate',align:'right',render:r=><MoneyCell value={r.customer_rate}/>},
  {key:'payment',label:'Payment',render:r=><StatusBadge status={r.payment}/>},
  {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
  {key:'action',label:'Action',className:'pro-action-col',align:'right',render:r=><RowActions onView={()=>nav(`/orders/${r.id}`)} viewLabel="Open"/>}
 ]
 return <>
  <PageTitle title="Orders" subtitle="All transport orders and operational stages" actions={<button className="primary" onClick={()=>nav('/orders/new')}>＋ New Order</button>}/>
  <SummaryGrid className="compact"><SummaryCard icon={<ClipboardList size={17}/>} label="Total Orders" value={rows.length} note={`${filtered.length} visible results`}/><SummaryCard icon={<Clock3 size={17}/>} label="Need Dispatch" value={needDispatch} note={`${assigned} already assigned`} tone={needDispatch?'warning':''}/><SummaryCard icon={<Truck size={17}/>} label="Active Trips" value={active} note="Dispatched / In Transit" tone={active?'success':''}/><SummaryCard icon={<WalletCards size={17}/>} label="Order Value" value={money(totalValue)} note="Excludes cancelled orders"/></SummaryGrid>
  <div className="status-tabs scroll-tabs" role="tablist">{statuses.map(s=><button key={s} className={status===s?'active':''} onClick={()=>setStatus(s)}>{s}<span>{s==='All'?rows.length:rows.filter(x=>x.status===s).length}</span></button>)}</div>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search order, customer, route, vehicle…" onReset={()=>{setSearch('');setStatus('All');setSort('newest')}} className="pro-module-toolbar"><select value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="customer">Customer A–Z</option></select></SearchFilterBar>
  {view==='table'?<section className="panel pro-table-panel orders-table"><DataTable rows={filtered} onRow={r=>nav(`/orders/${r.id}`)} columns={cols}/></section>:<div className="pro-card-grid">{filtered.map(o=><article className="pro-record-card" key={o.id} onClick={()=>nav(`/orders/${o.id}`)}><header><IdentityCell title={o.customer} subtitle={o.phone} meta={o.id}/><StatusBadge status={o.status}/></header><div className="pro-route-box">{o.pickup} <span>→</span> {o.drop}<small>{o.goods||'No goods detail'}</small></div><div className="pro-record-kvs"><div><small>Vehicle</small><b>{o.vehicle_type||'TBD'}</b></div><div><small>Pickup</small><b>{formatDate(o.date)} · {formatTime(o.time)}</b></div><div><small>Rate</small><b>{money(o.customer_rate)}</b></div><div><small>Payment</small><StatusBadge status={o.payment}/></div></div><footer onClick={e=>e.stopPropagation()}><RowActions onView={()=>nav(`/orders/${o.id}`)} viewLabel="Open"/></footer></article>)}</div>}
 </>
}
function OrderDetail({id}){
 const nav=useNavigate()
 const [o,setO]=useState(null),[events,setEvents]=useState([]),[txns,setTxns]=useState([]),[slips,setSlips]=useState([]),[dispatch,setDispatch]=useState(null),[assignments,setAssignments]=useState([]),[vehicles,setVehicles]=useState([]),[drivers,setDrivers]=useState([]),[labourers,setLabourers]=useState([]),[partners,setPartners]=useState([]),[owners,setOwners]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState(false),[amend,setAmend]=useState(false),[noteOpen,setNoteOpen]=useState(false),[financeAction,setFinanceAction]=useState(null)
 const load=async()=>{setLoading(true);const [a,b,c,d,e,f,g,h,i,j,k]=await Promise.all([
  supabase.from('orders').select('*').eq('id',id).maybeSingle(),
  supabase.from('order_events').select('*').eq('order_id',id).order('created_at'),
  supabase.from('transactions').select('*').eq('order_id',id).order('created_at',{ascending:false}),
  supabase.from('slips').select('*').eq('order_id',id).eq('archived',false).order('created_at',{ascending:false}),
  supabase.from('dispatches').select('*').eq('order_id',id).eq('archived',false).maybeSingle(),
  supabase.from('order_labour_assignments').select('*').eq('order_id',id).order('assigned_at'),
  supabase.from('vehicles').select('id,number,type,owner_id,partner_id,default_driver_id,status').eq('archived',false),
  supabase.from('drivers').select('id,name,mobile,status').eq('archived',false),
  supabase.from('labourers').select('id,name,mobile,status').eq('archived',false),
  supabase.from('partners').select('id,name,mobile,status').eq('archived',false),
  supabase.from('vehicle_owners').select('id,name,mobile,status').eq('archived',false)
 ]);setO(a.data);setEvents(b.data||[]);setTxns(c.data||[]);setSlips(d.data||[]);setDispatch(e.data||null);setAssignments(f.data||[]);setVehicles(g.data||[]);setDrivers(h.data||[]);setLabourers(i.data||[]);setPartners(j.data||[]);setOwners(k.data||[]);setLoading(false)}
 useEffect(()=>{load();const ch=supabase.channel(`order:${id}`).on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`id=eq.${id}`},load).on('postgres_changes',{event:'*',schema:'public',table:'order_events',filter:`order_id=eq.${id}`},load).on('postgres_changes',{event:'*',schema:'public',table:'slips',filter:`order_id=eq.${id}`},load).subscribe();return()=>supabase.removeChannel(ch)},[id])
 if(loading)return <div className="panel">Loading order…</div>
 if(!o)return <EmptyState title="Order not found"/>
 const effectiveTxns=txns.filter(t=>t.status!=='Reversed'&&!t.reversal_of)
 const received=effectiveTxns.filter(t=>t.direction==='IN').reduce((sum,t)=>sum+num(t.amount),0)
 const customerBalance=Math.max(0,num(o.customer_rate)-received)
 const labourPaid=effectiveTxns.filter(t=>t.direction==='OUT'&&String(t.party_type||'').toLowerCase()==='labour').reduce((sum,t)=>sum+num(t.amount),0)
 const vehiclePaid=effectiveTxns.filter(t=>t.direction==='OUT'&&['partner','vehicle owner','driver'].includes(String(t.party_type||'').toLowerCase())).reduce((sum,t)=>sum+num(t.amount),0)
 const vehicleBalance=Math.max(0,num(o.vehicle_cost)-vehiclePaid),labourBalance=Math.max(0,num(o.labour_cost)-labourPaid)
 const margin=num(o.customer_rate)-num(o.vehicle_cost)-num(o.labour_cost)
 const vehicle=vehicles.find(v=>v.id===o.vehicle_id),driver=drivers.find(d=>d.id===o.driver_id)
 const partner=partners.find(p=>p.id===(o.partner_id||vehicle?.partner_id)),owner=owners.find(x=>x.id===vehicle?.owner_id)
 const activeAssignments=assignments.filter(a=>!a.released_at),historicalAssignments=assignments.filter(a=>a.released_at)
 const displayAssignments=activeAssignments.length?activeAssignments:historicalAssignments
 const assignedLabour=displayAssignments.map(a=>labourers.find(l=>l.id===a.labour_id)).filter(Boolean)
 const requiredLabour=o.labour_mode==='Separate Crew'?num(o.loading)+num(o.unloading):Math.max(num(o.loading),num(o.unloading))
 const vehiclePayParty=partner?{id:partner.id,name:partner.name,type:'Partner',mobile:partner.mobile}:owner?{id:owner.id,name:owner.name,type:'Vehicle Owner',mobile:owner.mobile}:driver?{id:driver.id,name:driver.name,type:'Driver',mobile:driver.mobile}:null
 const labourPaymentOptions=[...new Map(displayAssignments.map(a=>{const l=labourers.find(x=>x.id===a.labour_id);return [a.labour_id,{id:a.labour_id,name:l?.name||a.labour_id,mobile:l?.mobile||'',committed:num(a.rate_snapshot)}]})).values()]
 const editAllowed=!['Delivered','Completed','Cancelled'].includes(o.status)
 const currentIndex=stages.indexOf(o.status)
 const delivered=['Delivered','Completed'].includes(o.status)
 const action=async()=>{setBusy(true);setError('');try{if(['New','Assigned'].includes(o.status)){nav(`/dispatch?order=${o.id}`);return}if(o.status==='Dispatched')await transitionOrder(o.id,'In Transit','Trip started');else if(o.status==='In Transit')await transitionOrder(o.id,'Delivered','Order delivered');else if(o.status==='Delivered')await transitionOrder(o.id,'Completed','Order completed');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const actionLabel=o.status==='New'?'Assign Resources':o.status==='Assigned'?'Review & Confirm Dispatch':o.status==='Dispatched'?'Start Trip':o.status==='In Transit'?'Mark Delivered':o.status==='Delivered'?'Complete Job':null
 const stageNote=o.status==='New'?'Order is ready for resource assignment.':o.status==='Assigned'?'Resources are reserved. Review and confirm dispatch when ready.':o.status==='Dispatched'?'Dispatch is confirmed. Start the trip when the vehicle leaves.':o.status==='In Transit'?'Trip is active. Mark delivered after the destination handover.':o.status==='Delivered'?'Delivery is finished. Review details and close the operational job when everything is confirmed.':o.status==='Completed'?'Operational work is closed. Financial settlement can still be tracked independently.':'Order is cancelled.'
 const cancel=async()=>{const reason=window.prompt('Cancellation reason (required)');if(!reason?.trim())return;setBusy(true);setError('');try{await transitionOrder(o.id,'Cancelled',`Cancelled · ${reason.trim()}`);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const openSlip=(s,print=false)=>nav(`/slips?order=${encodeURIComponent(o.id)}&type=${encodeURIComponent(s.type)}&slip=${encodeURIComponent(s.id)}${print?'&print=1':''}`)
 const lastUpdates=[...events].slice(-4).reverse()
 return <>
  <div className="legacy-order-detail-head">
   <div><button className="back-link" onClick={()=>nav('/orders')}>← Orders</button><h1>Order Detail · {o.id}</h1><p>{formatDate(o.created_at)} · {formatTime(o.created_at)} · {o.customer}</p></div>
   <div className="legacy-order-head-actions"><button className="outline" onClick={()=>nav('/dispatch')}>← Dispatch Queue</button><div className="stage-select-shell"><small>ORDER STAGE</small><StatusBadge status={o.status}/></div>{editAllowed?<button className="outline" onClick={()=>setEdit(true)}><Edit3 size={15}/> Edit Order</button>:['Delivered','Completed'].includes(o.status)&&<button className="outline" onClick={()=>setAmend(true)}><FileText size={15}/> Add Amendment</button>}</div>
  </div>

  <div className="legacy-lifecycle-strip scroll-tabs">{stages.map((s,i)=>{const done=currentIndex>=0&&i<currentIndex,active=i===currentIndex,finalDone=o.status==='Completed'&&i===stages.length-1;return <div key={s} className={`${done||finalDone?'done':''} ${active?'active':''}`}><span>{done||finalDone?<Check size={13}/>:active?'•':'○'}</span><b>{s}</b></div>})}</div>

  <div className="legacy-order-workspace">
   <main className="legacy-order-main">
    <section className={`legacy-current-stage ${String(o.status).toLowerCase().replaceAll(' ','-')}`}><div className="stage-symbol">{delivered?<CheckCircle2 size={22}/>:o.status==='In Transit'?<Truck size={22}/>:<ClipboardList size={22}/>}</div><div><small>CURRENT WORK STAGE</small><h2>{o.status}</h2><p>{stageNote}</p><div className="stage-meta"><span>{formatDateTime(o.last_stage_at||o.updated_at||o.created_at)}</span><span>{o.pickup} → {o.drop}</span><span>{vehicle?.number||o.vehicle_type||'Vehicle pending'}</span></div></div><div className="stage-actions">{actionLabel&&<button className="primary" disabled={busy} onClick={action}>{o.status==='Dispatched'&&<Play size={15}/>} {actionLabel}</button>}{o.status==='Completed'&&customerBalance>0&&<button className="primary" onClick={()=>setFinanceAction({mode:'receive-customer'})}><ReceiptText size={15}/> Receive Balance · {money(customerBalance)}</button>}{o.status==='Completed'&&customerBalance<=0&&<span className="stage-payment-settled"><CheckCircle2 size={15}/> Customer Payment Settled</span>}{slips.some(s=>s.type==='DISPATCH')&&<button className="outline" onClick={()=>openSlip(slips.find(s=>s.type==='DISPATCH'))}>View Dispatch Slip</button>}</div></section>

    {delivered&&<section className="legacy-delivery-confirm"><div className="section-head-inline"><div><h3>Delivery Confirmation</h3><small>Resources are released; operational close can be completed separately.</small></div><StatusBadge status={o.status}/></div><div className="delivery-check-grid"><DeliveryCheck title="Destination reached" note={formatDateTime(o.delivered_at||o.last_stage_at)}/><DeliveryCheck title="Vehicle released" note={vehicle?.number||o.vehicle_type||'Vehicle'}/><DeliveryCheck title="Labour released" note={`${assignedLabour.length||displayAssignments.length} assigned worker(s)`}/></div></section>}

    {o.status==='Completed'&&<section className={`order-payment-next-banner ${customerBalance>0?'due':'settled'}`}><span className="order-payment-next-icon">{customerBalance>0?<WalletCards size={22}/>:<CheckCircle2 size={22}/>}</span><div><small>ORDER JOURNEY · NEXT STEP</small><h3>{customerBalance>0?'Job completed · customer balance is pending':'Job completed & customer payment settled'}</h3><p>{customerBalance>0?`${money(customerBalance)} remains to be received for ${o.id}. Continue here without searching in Receive & Pay.`:'Operational work and customer collection are complete. The order remains available in Receive & Pay for accounting history.'}</p></div>{customerBalance>0?<div className="order-payment-next-actions"><button className="primary" onClick={()=>setFinanceAction({mode:'receive-customer'})}>Receive Payment Now</button><button className="outline" onClick={()=>nav(`/slips?order=${encodeURIComponent(o.id)}`)}>View Documents</button></div>:<div className="order-payment-next-actions"><button className="outline" onClick={()=>nav(`/slips?order=${encodeURIComponent(o.id)}`)}>View Documents</button></div>}</section>}

    <section className="legacy-order-card"><div className="section-head-inline"><h3>Customer & Job Information</h3><StatusBadge status={o.status}/></div><div className="job-info-grid"><JobInfo label="Customer" value={o.customer} sub={`${o.phone||'—'} · ${o.source||'Direct Order'}`} icon={<UserRound size={15}/>}/><JobInfo label="Route" value={`${o.pickup} → ${o.drop}`} sub={`${num(o.distance)} KM approx.`} icon={<MapPin size={15}/>}/><JobInfo label="Goods" value={o.goods||'—'} sub={o.notes||'No special notes'} icon={<PackageOpen size={15}/>}/><JobInfo label="Service" value={o.vehicle_type||'Not decided'} sub={`Loading ${num(o.loading)} · Unloading ${num(o.unloading)}`} icon={<Truck size={15}/>}/></div></section>

    <div className="legacy-order-two-col">
     <section className="legacy-order-card assignment-card"><div className="section-head-inline"><h3>🚚 Assignment Summary</h3><span className="pro-soft-chip">{vehicle?.number||'Pending'}</span></div><div className="assignment-summary-grid"><JobInfo label="Vehicle" value={vehicle?`${vehicle.number} · ${vehicle.type||o.vehicle_type||''}`:(o.vehicle_type||'Not assigned')} sub={vehicle?.status||'—'}/><JobInfo label="Driver" value={driver?.name||o.driver_name||'Not assigned'} sub={driver?.mobile||'Regular driver from Fleet & Crew'}/><JobInfo label="Partner / Owner" value={partner?.name||owner?.name||'Company / Not linked'} sub={partner?.mobile||owner?.mobile||'—'}/><JobInfo label="Labour" value={assignedLabour.length?assignedLabour.map(x=>x.name).join(', '):`${displayAssignments.length}/${requiredLabour} assigned`} sub={`${displayAssignments.length} assignment record(s)`}/></div></section>
     <section className="legacy-order-card contact-history-card"><div className="section-head-inline"><h3>Contact / Update History</h3><button onClick={()=>setNoteOpen(true)}>+ Add Note</button></div>{lastUpdates.length?<div className="compact-history-list">{lastUpdates.map(e=><div key={e.id}><span>◉</span><div><b>{e.note||e.event_type}</b><small>{e.event_type} · {formatDateTime(e.created_at)}</small></div></div>)}</div>:<div className="muted-box">No update history yet.</div>}</section>
    </div>

    <section className="legacy-order-card legacy-slips-card"><div className="section-head-inline"><div><h3>Slips</h3><small>Fixed historical snapshots. Current live data does not overwrite them.</small></div><button onClick={()=>nav(`/slips?order=${encodeURIComponent(o.id)}`)}>Open All Slips</button></div>{slips.length?<div className="legacy-slip-list">{slips.map(s=><div key={s.id}><span className={`related-document-icon ${s.type==='DISPATCH'?'dispatch':s.type==='RECEIPT'?'receipt':s.type==='PAYMENT_VOUCHER'?'voucher':'order'}`}>{s.type==='DISPATCH'?<Truck size={16}/>:s.type==='RECEIPT'?<ReceiptText size={16}/>:s.type==='PAYMENT_VOUCHER'?<WalletCards size={16}/>:<FileText size={16}/>}</span><div><b>{s.slip_no}</b><small>{s.type==='ORDER'?'Order Slip':s.type==='DISPATCH'?'Dispatch Slip':s.type==='RECEIPT'?'Money Receipt':'Payment Voucher'} · {formatDateTime(s.created_at)}</small></div><StatusBadge status={s.status}/><button className="outline small" onClick={()=>openSlip(s)}>View</button><button className="primary small" onClick={()=>openSlip(s,true)}>Print</button></div>)}</div>:<EmptyState title="No slips yet" text="Documents generated for this order appear here."/>}</section>

    <section className="legacy-order-card financial-summary-card"><div className="section-head-inline"><div><h3>Financial Summary</h3><small>Order-linked receipts and payouts open here directly. Receive & Pay remains the global accounting register.</small></div><span className="pro-soft-chip">{o.settlement_status||'Open'}</span></div><div className="financial-three-grid"><FinancialBlock title="CUSTOMER" badge={customerBalance>0?(received>0?'Partial':'Unpaid'):'Settled'} rows={[["Bill",num(o.customer_rate)],["Received",received],["Balance",customerBalance]]} action={customerBalance>0?(received>0?`Receive Balance · ${money(customerBalance)}`:'Receive Payment'):'Payment Settled'} onAction={()=>setFinanceAction({mode:'receive-customer'})} disabled={customerBalance<=0}/><FinancialBlock title="VEHICLE PARTNER" badge={partner?.name||owner?.name||driver?.name||'—'} rows={[["Agreed / Committed",num(o.vehicle_cost)],["Paid",vehiclePaid],["Balance",vehicleBalance]]} action={vehicleBalance>0?'Pay Vehicle Partner':'No balance'} onAction={()=>setFinanceAction({mode:'pay-vehicle'})} disabled={vehicleBalance<=0||!vehiclePayParty}/><FinancialBlock title="LABOUR" badge={`${assignedLabour.length||displayAssignments.length} assigned`} rows={[["Committed",num(o.labour_cost)],["Paid",labourPaid],["Balance",labourBalance]]} action={labourBalance>0?'Pay Labour':'No balance'} onAction={()=>setFinanceAction({mode:'pay-labour'})} disabled={labourBalance<=0||!labourPaymentOptions.length}/></div><div className="expected-margin-bar"><div><b>Expected Margin</b><small>Customer Bill − Vehicle − Labour</small></div><strong className={margin>=0?'positive':'negative'}>{money(margin)}</strong></div></section>

    <section className="legacy-order-card order-timeline-card"><div className="section-head-inline"><div><h3>Order Timeline</h3><small>Every important activity is saved with date and time.</small></div><span className="chip">{events.length} events</span></div><Timeline items={events}/></section>
   </main>

   <aside className="legacy-live-assignment">
    <div className="live-assignment-head"><div><small>LIVE ASSIGNMENT PREVIEW</small><h3>Dispatch Summary</h3></div><StatusBadge status={o.status}/></div>
    <PreviewKV label="Order / Customer" value={`${o.id} · ${o.customer}`}/><PreviewKV label="Route" value={`${o.pickup} → ${o.drop}`}/><PreviewKV label="Required Vehicle" value={o.vehicle_type||'—'}/><PreviewKV label="Assigned Vehicle" value={vehicle?.number||'Not assigned'}/><PreviewKV label="Partner / Owner" value={partner?.name||owner?.name||'—'}/><PreviewKV label="Driver" value={driver?.name||o.driver_name||'Not assigned'}/><PreviewKV label="Loading / Unloading" value={`${num(o.loading)} / ${num(o.unloading)}`}/><PreviewKV label="Assigned Labour" value={`${displayAssignments.length} / ${requiredLabour} required`}/><PreviewKV label="Pickup" value={`${formatDate(o.date)} · ${formatTime(o.time)}`}/>
    <div className={`readiness-box ${o.status==='New'?'pending':''}`}><b>{o.status==='New'?'○ Waiting for Assignment':'✓ Assignment Recorded'}</b><div><span>{o.vehicle_id?'✓':'○'} Vehicle</span><span>{o.driver_id?'✓':'○'} Driver</span><span>{displayAssignments.length>=requiredLabour?'✓':'○'} Labour {displayAssignments.length}/{requiredLabour}</span></div></div>
    <div className="live-financial-box"><PreviewKV label="Customer Final Rate" value={money(o.customer_rate)}/><PreviewKV label="Vehicle Partner Cost" value={money(o.vehicle_cost)}/><PreviewKV label="Labour Cost" value={money(o.labour_cost)}/><PreviewKV label="Gross Margin" value={money(margin)}/></div>
    {error&&<div className="form-error">{error}</div>}
    {o.status==='New'&&<button className="primary full" onClick={()=>nav(`/dispatch?order=${o.id}`)}>Assign Resources</button>}
    {o.status==='Assigned'&&<button className="primary full" onClick={()=>nav(`/dispatch?order=${o.id}`)}>Open Dispatch</button>}
    {customerBalance>0&&<button className="outline full order-quick-payment" onClick={()=>setFinanceAction({mode:'receive-customer'})}><ReceiptText size={15}/> {received>0?'Receive Remaining':'Receive Payment'} · {money(customerBalance)}</button>}
    {customerBalance<=0&&<div className="order-quick-settled"><CheckCircle2 size={15}/> Customer Payment Settled</div>}
    {!['Completed','Cancelled'].includes(o.status)&&<button className="danger-link full" disabled={busy} onClick={cancel}>Cancel Order</button>}
   </aside>
  </div>
  {edit&&<EditOrderModal order={o} received={received} onClose={()=>setEdit(false)} onSaved={async()=>{setEdit(false);await load()}}/>}
  {amend&&<AmendmentModal order={o} onClose={()=>setAmend(false)} onSaved={async()=>{setAmend(false);await load()}}/>}
  {noteOpen&&<OrderNoteModal order={o} onClose={()=>setNoteOpen(false)} onSaved={async()=>{setNoteOpen(false);await load()}}/>}
  {financeAction&&<OrderFinanceActionModal order={o} mode={financeAction.mode} vehicleParty={vehiclePayParty} labourOptions={labourPaymentOptions} onClose={()=>setFinanceAction(null)} onSaved={async()=>{await load()}} onOpenSlip={(slip,print=false)=>openSlip(slip,print)}/>}
 </>
}
function DeliveryCheck({title,note}){return <div><span><Check size={14}/></span><div><b>{title}</b><small>{note||'Confirmed'}</small></div></div>}
function JobInfo({label,value,sub,icon}){return <div className="legacy-job-info"><span className="job-info-icon">{icon}</span><div><small>{label}</small><b>{value||'—'}</b>{sub&&<em>{sub}</em>}</div></div>}
function PreviewKV({label,value}){return <div className="legacy-preview-kv"><span>{label}</span><b>{value||'—'}</b></div>}
function FinancialBlock({title,badge,rows,action,onAction,disabled=false}){return <div className="financial-block"><header><b>{title}</b><span>{badge}</span></header>{rows.map(([k,v])=><div key={k}><span>{k}</span><strong>{money(v)}</strong></div>)}<button className={disabled?'outline':'primary'} disabled={disabled} onClick={onAction}>{action}</button></div>}
function OrderNoteModal({order,onClose,onSaved}){const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const save=async()=>{if(!note.trim())return setError('Note is required.');setBusy(true);setError('');try{await insertRow('order_events',{order_id:order.id,stage:order.status,event_type:'Contact / Note',note:note.trim(),metadata:{source:'Order Detail'}});onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}};return <Modal open title={`Add Order Note · ${order.id}`} subtitle="Add a contact or operational update to the permanent order timeline." eyebrow="Order Update" icon={<Plus size={18}/>} onClose={onClose} footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save Note'}</button></>}><Field label="Update / Note" required><textarea autoFocus rows="4" value={note} onChange={e=>setNote(e.target.value)} placeholder="Called customer, gate access note, delivery instruction, operational update…"/></Field>{error&&<div className="form-error">{error}</div>}</Modal>}

function RelatedDocumentCard({slip,onOpen}){
 const meta={
  ORDER:{label:'Order Slip',icon:FileText,tone:'order'},
  DISPATCH:{label:'Dispatch Slip',icon:Truck,tone:'dispatch'},
  RECEIPT:{label:'Money Receipt',icon:ReceiptText,tone:'receipt'},
  PAYMENT_VOUCHER:{label:'Payment Voucher',icon:WalletCards,tone:'voucher'}
 }[slip.type]||{label:slip.type||'Document',icon:FileText,tone:'order'}
 const Icon=meta.icon
 return <button type="button" className="related-document-card" onClick={onOpen}>
  <span className={`related-document-icon ${meta.tone}`}><Icon size={18}/></span>
  <span className="related-document-main"><b>{slip.slip_no||meta.label}</b><small>{meta.label} · {formatDateTime(slip.created_at)}</small></span>
  <span className="related-document-status"><StatusBadge status={slip.status}/></span>
  <ChevronRight className="related-document-chevron" size={17}/>
 </button>
}

function EditOrderModal({order,received,onClose,onSaved}){
 const [types,setTypes]=useState([]),[f,setF]=useState({...order}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[impact,setImpact]=useState(false),[reason,setReason]=useState('')
 useEffect(()=>{supabase.from('vehicle_types').select('*').eq('active',true).eq('archived',false).order('sort_order').then(({data})=>setTypes(data||[]))},[])
 const typeOptions=types.map(t=>({value:t.id,label:`${t.icon||'🚚'} ${t.name}`,sub:[t.capacity,t.code].filter(Boolean).join(' · '),row:t}))
 const set=(k,v)=>setF(x=>({...x,[k]:v}))
 const stage=order.status
 const postDispatch=['Dispatched','In Transit'].includes(stage)
 const assigned=stage==='Assigned'
 const operationalChanged=['vehicle_type_id','vehicle_type','loading','unloading','labour_mode'].some(k=>String(f[k]??'')!==String(order[k]??''))
 const rateChanged=num(f.customer_rate)!==num(order.customer_rate)
 const changed={customer:f.customer,phone:f.phone,pickup:f.pickup,drop:f.drop,goods:f.goods||null,vehicle_type_id:f.vehicle_type_id||null,vehicle_type:f.vehicle_type||null,distance:f.distance===''?null:num(f.distance),loading:num(f.loading),unloading:num(f.unloading),labour_mode:f.labour_mode||'Same Crew',date:f.date||null,time:f.time||null,customer_rate:num(f.customer_rate),payment:f.payment||'Pending',additional_cost:num(f.additional_cost),notes:f.notes||null}
 const save=async(resetAssignment=false)=>{
  if(!f.customer||!f.phone||!f.pickup||!f.drop||!f.vehicle_type)return setError('Customer, phone, pickup, drop and vehicle type are required.')
  if(postDispatch&&!reason.trim())return setError('Reason is required for changes after dispatch confirmation.')
  if(rateChanged&&received>0&&!reason.trim())return setError('Payments already exist. Enter a reason for changing the customer rate.')
  if(assigned&&operationalChanged&&!impact){setImpact(true);return}
  setBusy(true);setError('')
  try{await updateOrderControlled(order.id,changed,{reason:reason.trim()||null,resetAssignment});onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <Modal open title={`Edit Order · ${order.id}`} subtitle={stage==='New'?'Full editing is available before assignment.':stage==='Assigned'?'Changes are allowed with assignment compatibility checks.':'Dispatch is confirmed; only controlled operational amendments are allowed.'} eyebrow="Controlled Order Editing" icon={<Edit3 size={19}/>} onClose={onClose} size="xl" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={()=>save(false)}><Save size={16}/>{busy?'Saving…':'Save Changes'}</button></>}>
  <div className="compact-edit-banner"><StatusBadge status={stage}/><span>{postDispatch?'Original Dispatch Slip stays unchanged. This edit is recorded as a post-dispatch amendment.':assigned?'Resource-impacting changes are revalidated before saving.':'Changes are recorded in the Order timeline.'}</span></div>
  <div className="v25-form-stack compact-modal-stack">
   <FormSection title="Customer & Route" description="Safe contact and route details." icon={<MapPin size={18}/>} compact><div className="form-grid cols-2"><Field label="Customer" required><input value={f.customer||''} disabled={postDispatch} onChange={e=>set('customer',e.target.value)}/></Field><Field label="Phone" required><input inputMode="tel" value={f.phone||''} onChange={e=>set('phone',e.target.value)}/></Field><Field label="Pickup" required><input value={f.pickup||''} disabled={stage==='In Transit'} onChange={e=>set('pickup',e.target.value)}/></Field><Field label="Drop" required><input value={f.drop||''} onChange={e=>set('drop',e.target.value)}/></Field><Field label="Goods / Load" full><div className="input-with-icon"><PackageOpen size={16}/><input value={f.goods||''} onChange={e=>set('goods',e.target.value)}/></div></Field></div></FormSection>
   <FormSection title="Vehicle, Labour & Schedule" description={postDispatch?'Vehicle type and labour requirement are locked after dispatch confirmation.':'Changing these fields may affect the current assignment.'} icon={<Truck size={18}/>} compact><div className="form-grid cols-2"><Field label="Required Vehicle Type" required full><SearchPicker title="Vehicle Type" value={f.vehicle_type_id||''} disabled={postDispatch} options={typeOptions} placeholder="Select vehicle type…" onChange={(v,o)=>setF(x=>({...x,vehicle_type_id:v,vehicle_type:o?.row?.name||''}))}/></Field><Field label="Distance (KM)"><input type="number" min="0" value={f.distance??''} onChange={e=>set('distance',e.target.value)}/></Field><Field label="Labour Mode"><select disabled={postDispatch} value={f.labour_mode||'Same Crew'} onChange={e=>set('labour_mode',e.target.value)}><option>Same Crew</option><option>Separate Crew</option></select></Field><Field label="Loading Labour"><input disabled={postDispatch} type="number" min="0" value={f.loading??0} onChange={e=>set('loading',e.target.value)}/></Field><Field label="Unloading Labour"><input disabled={postDispatch} type="number" min="0" value={f.unloading??0} onChange={e=>set('unloading',e.target.value)}/></Field><Field label="Pickup Date"><input type="date" value={f.date||''} disabled={stage==='In Transit'} onChange={e=>set('date',e.target.value)}/></Field><Field label="Pickup Time"><input type="time" value={f.time||''} disabled={stage==='In Transit'} onChange={e=>set('time',e.target.value)}/></Field></div></FormSection>
   <FormSection title="Commercial & Notes" description="Existing receipts are never rewritten when the order rate changes." icon={<FileText size={18}/>} compact><div className="form-grid cols-2"><Field label="Customer Rate" required hint={received>0?`Already received: ${money(received)}. Rate changes require a reason.`:''}><input type="number" min="0" value={f.customer_rate??0} onChange={e=>set('customer_rate',e.target.value)}/></Field><Field label="Payment Terms / Status" hint={received>0?"Transaction-driven after money is received.":"Use Receive Payment to record actual money and create a receipt."}><select disabled={received>0} value={f.payment||'Pending'} onChange={e=>set('payment',e.target.value)}>{received>0?<option>{f.payment||'Partial'}</option>:<><option>Pending</option><option>Credit</option></>}</select></Field><Field label="Additional Cost"><input type="number" min="0" value={f.additional_cost??0} onChange={e=>set('additional_cost',e.target.value)}/></Field><Field label="Reason for Change" required={postDispatch||rateChanged}><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this order being changed?"/></Field><Field label="Notes / Instructions" full><textarea rows="3" value={f.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></div></FormSection>
  </div>
  {impact&&<div className="order-impact-review"><div><b>Assignment impact detected</b><span>Vehicle or labour requirement changed while this order is Assigned. Keep the current assignment only if it is still compatible, or reset it and return the order to New for fresh assignment.</span></div><div className="impact-actions"><button className="outline" disabled={busy} onClick={()=>save(false)}>Keep if Compatible</button><button className="primary" disabled={busy} onClick={()=>save(true)}>Reset Assignment & Save</button></div></div>}
  {error&&<div className="form-error">{error}</div>}
 </Modal>
}

function AmendmentModal({order,onClose,onSaved}){
 const [reason,setReason]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const save=async()=>{if(!reason.trim())return setError('Reason is required.');setBusy(true);setError('');try{await addOrderAmendment(order.id,reason.trim(),note.trim());onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <Modal open title={`Order Amendment · ${order.id}`} subtitle="Delivered/completed order data stays locked. Record a correction or clarification without rewriting the original order or slips." eyebrow="Locked Order" icon={<FileText size={19}/>} onClose={onClose} size="md" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save Amendment'}</button></>}><FormSection title="Amendment Record" description="This is added to the permanent order timeline and audit history." compact><div className="form-grid"><Field label="Reason" required><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Example: Customer corrected delivery note"/></Field><Field label="Details"><textarea rows="4" value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe the correction or clarification. Original order values remain unchanged."/></Field></div><FormNote>Amendments do not modify issued Order/Dispatch slips or completed accounting transactions.</FormNote></FormSection>{error&&<div className="form-error">{error}</div>}</Modal>
}

function Info({label,value}){return <div className="info-row"><span>{label}</span><b>{value}</b></div>}
