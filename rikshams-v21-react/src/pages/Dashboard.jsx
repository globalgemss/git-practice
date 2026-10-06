import React,{useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {ArrowRight,CheckCircle2,Clock3,Columns3,HardHat,LayoutGrid,Radio,Route as RouteIcon,Table2,Truck,UsersRound} from 'lucide-react'
import {supabase} from '../lib/supabase'
import PageTitle from '../components/PageTitle'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import SearchFilterBar from '../components/SearchFilterBar'
import {money,formatDateTime,formatDate,formatTime,num} from '../utils/format'
import {activeTransactions,portfolioFinancial} from '../utils/accounting'
import {IdentityCell,MoneyCell,RouteCell} from '../components/TableKit'

const operationsStages=[
 {status:'New',label:'Need Dispatch',hint:'Waiting for assignment',tone:'amber'},
 {status:'Assigned',label:'Assigned',hint:'Ready to dispatch',tone:'violet'},
 {status:'Dispatched',label:'Dispatched',hint:'Waiting to start trip',tone:'blue'},
 {status:'In Transit',label:'In Transit',hint:'Trip running',tone:'cyan'},
 {status:'Delivered',label:'Delivered',hint:'Waiting completion',tone:'green'}
]
const allStageCards=[...operationsStages,{status:'Completed',label:'Completed',hint:'Operationally closed',tone:'green'}]

function leadSourceKind(lead){
 const s=String(lead.source||'').toLowerCase()
 if(s.includes('public'))return 'Public Agent Form'
 if(s.includes('agent')||lead.referral_partner_id||lead.referral_partner_name)return 'Agent Entry'
 return 'Direct'
}

export default function Dashboard(){
 const nav=useNavigate()
 const [data,setData]=useState({leads:[],orders:[],vehicles:[],labour:[],transactions:[]}),[loading,setLoading]=useState(true)
 const [opsSearch,setOpsSearch]=useState(''),[opsStage,setOpsStage]=useState('All'),[opsVehicle,setOpsVehicle]=useState('All'),[opsSort,setOpsSort]=useState('pickup'),[opsView,setOpsView]=useState('table')

 const load=async()=>{
  setLoading(true)
  const tables=['leads','orders','vehicles','labourers','transactions']
  const res=await Promise.all(tables.map(t=>supabase.from(t).select('*').eq('archived',false).order('created_at',{ascending:false}).limit(t==='orders'||t==='transactions'?500:t==='leads'?150:500)))
  const d={};tables.forEach((t,i)=>d[t==='labourers'?'labour':t]=res[i].data||[])
  setData(d);setLoading(false)
 }
 useEffect(()=>{load();const channels=['leads','orders','vehicles','labourers','transactions'].map(t=>supabase.channel(`dash:${t}`).on('postgres_changes',{event:'*',schema:'public',table:t},()=>load()).subscribe());return()=>channels.forEach(c=>supabase.removeChannel(c))},[])

 const tx=activeTransactions(data.transactions)
 const receive=tx.filter(x=>x.direction==='IN').reduce((s,x)=>s+Number(x.amount||0),0)
 const pay=tx.filter(x=>x.direction==='OUT').reduce((s,x)=>s+Number(x.amount||0),0)
 const finance=portfolioFinancial(data.orders,data.transactions)
 const stageCounts=Object.fromEntries(['New','Assigned','Dispatched','In Transit','Delivered','Completed'].map(s=>[s,data.orders.filter(o=>o.status===s).length]))
 const availableVehicles=data.vehicles.filter(x=>x.status==='Available').length
 const availableLabour=data.labour.filter(x=>x.status==='Available').length
 const totalVehicles=Math.max(1,data.vehicles.length),totalLabour=Math.max(1,data.labour.length)
 const activeTrips=stageCounts['In Transit']||0
 const operationalTotal=Math.max(1,data.orders.filter(o=>o.status!=='Cancelled').length)

 const vehicleTypes=useMemo(()=>Object.values(data.vehicles.reduce((acc,v)=>{const key=v.type||'Other';if(!acc[key])acc[key]={name:key,total:0,available:0};acc[key].total++;if(v.status==='Available')acc[key].available++;return acc},{})).sort((a,b)=>b.total-a.total).slice(0,6),[data.vehicles])
 const labourTypes=useMemo(()=>Object.values(data.labour.reduce((acc,l)=>{const key=l.skill||'General';if(!acc[key])acc[key]={name:key,total:0,available:0};acc[key].total++;if(l.status==='Available')acc[key].available++;return acc},{})).sort((a,b)=>b.total-a.total).slice(0,6),[data.labour])
 const sourceCounts=useMemo(()=>data.leads.reduce((acc,l)=>{const k=leadSourceKind(l);acc[k]=(acc[k]||0)+1;return acc},{Direct:0,'Agent Entry':0,'Public Agent Form':0}),[data.leads])
 const agentCounts=useMemo(()=>Object.entries(data.leads.reduce((acc,l)=>{const n=l.referral_partner_name;if(n)acc[n]=(acc[n]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]).slice(0,4),[data.leads])
 const recentOrders=data.orders.slice(0,7)
 const serviceTypes=useMemo(()=>Array.from(new Set(data.orders.map(o=>o.vehicle_type).filter(Boolean))).sort(),[data.orders])
 const goDispatch=(status,order)=>nav(`/dispatch${status||order?'?':''}${status?`status=${encodeURIComponent(status)}`:''}${status&&order?'&':''}${order?`order=${encodeURIComponent(order)}`:''}`)

 const operations=useMemo(()=>{
  const q=opsSearch.trim().toLowerCase()
  let list=data.orders.filter(o=>operationsStages.some(s=>s.status===o.status))
  if(opsStage!=='All')list=list.filter(o=>o.status===opsStage)
  if(opsVehicle!=='All')list=list.filter(o=>String(o.vehicle_type||'')===opsVehicle)
  if(q)list=list.filter(o=>[o.id,o.customer,o.phone,o.pickup,o.drop,o.vehicle_type,o.driver_name,o.goods].join(' ').toLowerCase().includes(q))
  return [...list].sort((a,b)=>{
   if(opsSort==='newest')return String(b.created_at||'').localeCompare(String(a.created_at||''))
   if(opsSort==='oldest')return String(a.created_at||'').localeCompare(String(b.created_at||''))
   if(opsSort==='rate')return num(b.customer_rate)-num(a.customer_rate)
   if(opsSort==='stage')return operationsStages.findIndex(s=>s.status===a.status)-operationsStages.findIndex(s=>s.status===b.status)
   return String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||''))||String(b.created_at||'').localeCompare(String(a.created_at||''))
  })
 },[data.orders,opsSearch,opsStage,opsVehicle,opsSort])

 const actionLabel=status=>status==='New'?'Assign':status==='Assigned'?'Confirm':status==='Dispatched'?'Start Trip':status==='In Transit'?'Deliver':'Complete'
 const openOperation=o=>goDispatch(o.status,o.id)

 return <>
  <PageTitle title="Dashboard" subtitle="Live operations, dispatch stages, resources and accounting in one control center" actions={<div className="dashboard-head-actions"><button className="outline" onClick={()=>nav('/leads')}>◎ Enquiries</button><button className="outline" onClick={()=>nav('/dispatch')}>Open Dispatch</button><button className="primary" onClick={()=>nav('/orders/new')}>＋ New Order</button></div>}/>

  <section className="dashboard-stage-grid" aria-label="Operational stages">
   {allStageCards.map(({status,label,hint,tone})=><button key={status} className={`dashboard-stage-card ${tone}`} onClick={()=>status==='Completed'?nav('/orders?status=Completed'):goDispatch(status)}><span className="dashboard-stage-icon">{status==='New'?<Clock3 size={19}/>:status==='Completed'||status==='Delivered'?<CheckCircle2 size={19}/>:<RouteIcon size={19}/>}</span><span className="dashboard-stage-copy"><small>{label}</small><strong>{stageCounts[status]||0}</strong><em>{hint}</em></span><ArrowRight size={15} className="dashboard-card-arrow"/></button>)}
  </section>

  <section className="dashboard-finance-strip">
   <button onClick={()=>nav('/reports')}><small>Receivable</small><strong>{money(finance.receivable)}</strong><span>Customer due</span><ArrowRight size={14}/></button>
   <button onClick={()=>nav('/day-book')}><small>Net Cash</small><strong className={receive-pay>=0?'success-text':'danger-text'}>{money(receive-pay)}</strong><span>Posted cash movement</span><ArrowRight size={14}/></button>
   <button onClick={()=>nav('/receive-pay')}><small>Resource Payable</small><strong>{money(finance.payable)}</strong><span>Partner / labour due</span><ArrowRight size={14}/></button>
   <button onClick={()=>nav('/reports')}><small>Gross Margin</small><strong>{money(finance.accruedMargin)}</strong><span>Accrued expected margin</span><ArrowRight size={14}/></button>
  </section>

  <section className="panel dashboard-operations-board modern-ops-board">
   <div className="panel-head dashboard-section-head"><div><h3>Live Operations</h3><small>Search, filter and work with active orders. Switch between Table, Cards and Board as needed.</small></div><button onClick={()=>nav('/dispatch')}>Open Dispatch <ArrowRight size={15}/></button></div>
   <div className="dashboard-ops-toolbar-row">
    <SearchFilterBar search={opsSearch} onSearch={setOpsSearch} placeholder="Search order, customer, route, vehicle…" onReset={()=>{setOpsSearch('');setOpsStage('All');setOpsVehicle('All');setOpsSort('pickup')}}>
     <select value={opsStage} onChange={e=>setOpsStage(e.target.value)}><option>All</option>{operationsStages.map(s=><option key={s.status} value={s.status}>{s.label}</option>)}</select>
     <select value={opsVehicle} onChange={e=>setOpsVehicle(e.target.value)}><option>All</option>{serviceTypes.map(v=><option key={v}>{v}</option>)}</select>
     <select value={opsSort} onChange={e=>setOpsSort(e.target.value)}><option value="pickup">Pickup Soonest</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="rate">Highest Rate</option><option value="stage">Stage</option></select>
    </SearchFilterBar>
    <div className="ops-view-toggle" aria-label="Operations view"><button className={opsView==='table'?'active':''} onClick={()=>setOpsView('table')}><Table2 size={16}/> Table</button><button className={opsView==='card'?'active':''} onClick={()=>setOpsView('card')}><LayoutGrid size={16}/> Cards</button><button className={opsView==='board'?'active':''} onClick={()=>setOpsView('board')}><Columns3 size={16}/> Board</button></div>
   </div>

   {opsView==='table'&&<DataTable className="dashboard-live-table" rows={operations.slice(0,16)} onRow={openOperation} emptyTitle="No active operations" emptyText="Try another filter or create a new order." columns={[
    {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
    {key:'order',label:'Order',render:r=><span className="pro-stack-cell"><b className="link">{r.id}</b><small>{formatDateTime(r.created_at)}</small></span>},
    {key:'customer',label:'Customer',render:r=><IdentityCell title={r.customer||'Customer'} subtitle={r.phone||'—'}/>},
    {key:'route',label:'Route',render:r=><RouteCell from={r.pickup} to={r.drop} meta={r.goods||null}/>},
    {key:'vehicle',label:'Vehicle',render:r=><span className="pro-stack-cell"><b>{r.vehicle_type||'Not decided'}</b><small>{r.vehicle_id?`Assigned ${r.vehicle_id}`:'Not assigned'}</small></span>},
    {key:'pickup',label:'Pickup',render:r=><span className="pro-stack-cell"><b>{formatDate(r.date)}</b><small>{formatTime(r.time)}</small></span>},
    {key:'stage',label:'Stage',render:r=><StatusBadge status={r.status}/>},
    {key:'rate',label:'Rate',align:'right',render:r=><MoneyCell value={r.customer_rate}/>},
    {key:'action',label:'Action',align:'right',render:r=><button className="outline small dashboard-table-action" onClick={e=>{e.stopPropagation();openOperation(r)}}>{actionLabel(r.status)} <ArrowRight size={14}/></button>}
   ]}/>}

   {opsView==='card'&&<div className="dashboard-ops-card-grid">{operations.length?operations.slice(0,12).map(o=><article key={o.id} className={`dashboard-ops-card tone-${String(o.status).toLowerCase().replaceAll(' ','-')}`} onClick={()=>nav(`/orders/${o.id}`)}><div className="dashboard-ops-card-head"><div><b>{o.id}</b><span>{o.customer||'Customer'}</span></div><StatusBadge status={o.status}/></div><div className="dashboard-ops-card-route"><RouteIcon size={16}/><strong>{o.pickup||'—'} <i>→</i> {o.drop||'—'}</strong></div><div className="dashboard-ops-card-meta"><span><small>Vehicle</small><b>{o.vehicle_type||'Not decided'}</b></span><span><small>Pickup</small><b>{formatDate(o.date)} · {formatTime(o.time)}</b></span><span><small>Rate</small><b>{money(o.customer_rate)}</b></span></div><button className="primary small" onClick={e=>{e.stopPropagation();openOperation(o)}}>{actionLabel(o.status)}</button></article>):<div className="dashboard-board-empty">No active operations match these filters.</div>}</div>}

   {opsView==='board'&&<div className="dashboard-board-scroll"><div className="dashboard-board-grid compact-board">{operationsStages.map(col=>{const rows=operations.filter(o=>o.status===col.status).slice(0,5);return <section className={`dashboard-board-column ${col.tone}`} key={col.status}><button className="dashboard-board-column-head" onClick={()=>{setOpsStage(col.status);goDispatch(col.status)}}><span><b>{col.label}</b><small>{col.hint}</small></span><strong>{operations.filter(o=>o.status===col.status).length}</strong></button><div className="dashboard-board-list">{rows.length?rows.map(o=><article className="dashboard-board-order compact" key={o.id} onClick={()=>nav(`/orders/${o.id}`)}><div className="dashboard-board-order-top"><b>{o.id}</b><StatusBadge status={o.status}/></div><strong>{o.customer||'Customer'}</strong><span>{o.pickup||'—'} → {o.drop||'—'}</span><small>{o.vehicle_type||'Vehicle TBD'} · {money(o.customer_rate)}</small><button className="outline small" onClick={e=>{e.stopPropagation();openOperation(o)}}>{actionLabel(o.status)}</button></article>):<div className="dashboard-board-empty">No {col.label.toLowerCase()} orders</div>}</div></section>})}</div></div>}
  </section>

  <div className="dashboard-main-grid">
   <section className="panel pro-table-panel dashboard-orders-panel"><div className="panel-head dashboard-section-head"><div><h3>Recent Orders</h3><small>Latest operational and financial activity</small></div><button onClick={()=>nav('/orders')}>View All <ArrowRight size={15}/></button></div><DataTable className="compact-pro-table" rows={recentOrders} onRow={r=>nav(`/orders/${r.id}`)} columns={[
    {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
    {key:'id',label:'Order',render:r=><span className="pro-stack-cell"><b className="link">{r.id}</b><small>{formatDateTime(r.created_at)}</small></span>},
    {key:'customer',label:'Customer',render:r=><IdentityCell title={r.customer} subtitle={r.phone||'—'}/>},
    {key:'route',label:'Route',render:r=><RouteCell from={r.pickup} to={r.drop} meta={r.goods||r.vehicle_type||null}/>},
    {key:'service',label:'Service',render:r=><span className="pro-stack-cell"><b>{r.vehicle_type||'Vehicle TBD'}</b><small>{Math.max(Number(r.loading||0),Number(r.unloading||0))} labour task(s)</small></span>},
    {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
    {key:'amount',label:'Amount',align:'right',render:r=><span className="pro-stack-cell align-right"><MoneyCell value={r.customer_rate}/><small>Margin {money(Number(r.customer_rate||0)-Number(r.vehicle_cost||0)-Number(r.labour_cost||0))}</small></span>}
   ]}/></section>

   <section className="panel dashboard-snapshot-panel"><div className="panel-head dashboard-section-head"><div><h3>Operations Snapshot</h3><small>Live capacity and trip position</small></div><span className="date-chip"><span className="live-dot">●</span> Live</span></div>
    <SnapshotRow label="Available Vehicles" value={`${availableVehicles} / ${data.vehicles.length}`} pct={availableVehicles/totalVehicles*100} onClick={()=>nav('/fleet?tab=Vehicles')}/>
    <SnapshotRow label="Available Labour" value={`${availableLabour} / ${data.labour.length}`} pct={availableLabour/totalLabour*100} onClick={()=>nav('/fleet?tab=Labour')}/>
    <SnapshotRow label="Active Trips" value={`${activeTrips} / ${Math.max(1,stageCounts['Dispatched']+stageCounts['In Transit']+stageCounts['Delivered'])}`} pct={activeTrips/Math.max(1,stageCounts['Dispatched']+stageCounts['In Transit']+stageCounts['Delivered'])*100} onClick={()=>goDispatch('In Transit')}/>
    <SnapshotRow label="Completed Orders" value={`${stageCounts.Completed||0} / ${data.orders.length}`} pct={(stageCounts.Completed||0)/operationalTotal*100} onClick={()=>nav('/orders?status=Completed')}/>
    <div className="dashboard-resource-mini"><button onClick={()=>nav('/fleet?tab=Vehicles')}><Truck size={17}/><span><b>{availableVehicles}</b><small>Vehicles ready</small></span></button><button onClick={()=>nav('/fleet?tab=Labour')}><HardHat size={17}/><span><b>{availableLabour}</b><small>Labour ready</small></span></button></div>
   </section>
  </div>

  <section className="panel dashboard-referral-panel"><div className="panel-head dashboard-section-head"><div><h3>Lead Referral Snapshot</h3><small>Know exactly where enquiries are coming from.</small></div><button onClick={()=>nav('/leads')}>View Leads <ArrowRight size={15}/></button></div><div className="dashboard-referral-grid">{['Direct','Agent Entry','Public Agent Form'].map(k=><button key={k} onClick={()=>nav('/leads')}><small>{k}</small><strong>{sourceCounts[k]||0}</strong><span>{data.leads.length?Math.round((sourceCounts[k]||0)/data.leads.length*100):0}% of leads</span></button>)}</div>{agentCounts.length>0&&<div className="dashboard-agent-ranking">{agentCounts.map(([name,count])=><button key={name} onClick={()=>nav('/leads')}><span>{name}</span><b>{count} lead{count===1?'':'s'}</b></button>)}</div>}</section>

  <div className="grid-2 dashboard-resource-grid">
   <section className="panel"><div className="panel-head dashboard-section-head"><div><h3>Available Vehicles</h3><small>Registered fleet by vehicle type</small></div><button onClick={()=>nav('/fleet?tab=Vehicles')}>Manage <ArrowRight size={15}/></button></div><div className="dashboard-resource-list">{vehicleTypes.length?vehicleTypes.map(v=><button key={v.name} onClick={()=>nav('/fleet?tab=Vehicles')}><span className="resource-type-icon"><Truck size={18}/></span><span><b>{v.name}</b><small>{v.total} registered</small></span><strong>{v.available} Available</strong></button>):<div className="dashboard-board-empty">No vehicles registered.</div>}</div></section>
   <section className="panel"><div className="panel-head dashboard-section-head"><div><h3>Available Labour</h3><small>Trip crew availability by skill</small></div><button onClick={()=>nav('/fleet?tab=Labour')}>Manage <ArrowRight size={15}/></button></div><div className="dashboard-resource-list">{labourTypes.length?labourTypes.map(l=><button key={l.name} onClick={()=>nav('/fleet?tab=Labour')}><span className="resource-type-icon"><UsersRound size={18}/></span><span><b>{l.name}</b><small>{l.total} registered</small></span><strong>{l.available} Available</strong></button>):<div className="dashboard-board-empty">No labour registered.</div>}</div></section>
  </div>

  {loading&&<div className="muted mt"><Radio size={14}/> Refreshing live dashboard…</div>}
 </>
}

function SnapshotRow({label,value,pct,onClick}){return <button className="dashboard-snapshot-row" onClick={onClick}><div><b>{label}</b><span>{value}</span></div><div className="dashboard-progress"><i style={{width:`${Math.max(0,Math.min(100,pct||0))}%`}}/></div></button>}
