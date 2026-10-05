import React,{useEffect,useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {getDashboardSummary} from '../services/api'
import PageTitle from '../components/PageTitle'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import {money,formatDateTime} from '../utils/format'

const emptySummary={
 leads_total:0,orders_total:0,today_orders:0,need_dispatch:0,assigned:0,dispatched:0,
 in_transit:0,delivered:0,completed_today:0,available_vehicles:0,vehicles_total:0,
 available_labour:0,labour_total:0,customers_total:0,receive_total:0,pay_total:0,
 pending_receivable:0
}

export default function Dashboard(){
 const [summary,setSummary]=useState(emptySummary)
 const [orders,setOrders]=useState([])
 const [leads,setLeads]=useState([])
 const [loading,setLoading]=useState(true)
 const timer=useRef(null)

 const load=async({silent=false}={})=>{
  if(!silent)setLoading(true)
  try{
   const [s,o,l]=await Promise.all([
    getDashboardSummary(),
    supabase.from('orders').select('id,customer,pickup,drop,vehicle_type,status,customer_rate,created_at').eq('archived',false).order('created_at',{ascending:false}).limit(7),
    supabase.from('leads').select('id,name,pickup,drop,status,created_at').eq('archived',false).order('created_at',{ascending:false}).limit(6)
   ])
   if(o.error)throw o.error
   if(l.error)throw l.error
   setSummary(x=>({...x,...s}))
   setOrders(o.data||[])
   setLeads(l.data||[])
  }catch(e){
   console.error('Dashboard load failed',e)
  }finally{
   setLoading(false)
  }
 }

 const schedule=()=>{
  clearTimeout(timer.current)
  timer.current=setTimeout(()=>load({silent:true}),180)
 }

 useEffect(()=>{
  load()
  const channels=['leads','orders','vehicles','labourers','transactions'].map(t=>
   supabase.channel('dash:'+t+':'+Math.random().toString(36).slice(2))
    .on('postgres_changes',{event:'*',schema:'public',table:t},schedule)
    .subscribe()
  )
  return()=>{
   clearTimeout(timer.current)
   channels.forEach(c=>supabase.removeChannel(c))
  }
 },[])

 const net=Number(summary.receive_total||0)-Number(summary.pay_total||0)

 return <>
  <PageTitle title="Dashboard" subtitle="Transport, labour, booking, dispatch and accounts overview" actions={<span className="date-chip"><span className="live-dot">●</span> Live</span>}/>

  <div className="stats-grid seven">
   <StatCard icon="◎" label="Total Leads" value={summary.leads_total} sub="Enquiries"/>
   <StatCard icon="▤" label="Orders" value={summary.orders_total} sub={summary.today_orders+' today'} tone="violet"/>
   <StatCard icon="🚚" label="Available Vehicles" value={summary.available_vehicles} sub={summary.vehicles_total+' total'} tone="green"/>
   <StatCard icon="👷" label="Labour" value={summary.available_labour} sub={summary.labour_total+' total'} tone="amber"/>
   <StatCard icon="●" label="Customers" value={summary.customers_total} sub="Active database"/>
   <StatCard icon="रु" label="Net Movement" value={money(net)} sub={'Due '+money(summary.pending_receivable)} tone={net>=0?'green':'red'}/>
   <StatCard icon="●" label="System" value={loading?'Syncing':'Live'} sub="Supabase Realtime" tone="green"/>
  </div>

  <div className="grid-2 dashboard-row">
   <section className="panel">
    <div className="panel-head"><h3>Recent Orders</h3><span className="chip">{summary.orders_total}</span></div>
    <DataTable rows={orders} columns={[
     {key:'id',label:'Order',render:r=><b>{r.id}</b>},
     {key:'customer',label:'Customer'},
     {key:'route',label:'Route',render:r=><><b>{r.pickup} → {r.drop}</b><small>{r.vehicle_type||'Vehicle TBD'}</small></>},
     {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
     {key:'customer_rate',label:'Rate',render:r=>money(r.customer_rate)}
    ]}/>
   </section>

   <section className="panel">
    <div className="panel-head"><h3>Recent Leads</h3><span className="chip">{summary.leads_total}</span></div>
    {leads.map(l=><div className="resource-row" key={l.id}>
     <div className="res-icon">◎</div>
     <div className="res-main"><b>{l.name}</b><span>{l.pickup} → {l.drop}</span><small>{formatDateTime(l.created_at)}</small></div>
     <StatusBadge status={l.status}/>
    </div>)}
   </section>
  </div>

  <div className="grid-2">
   <section className="panel">
    <div className="panel-head"><h3>Operations</h3></div>
    <div className="availability-grid">
     <div><b>{summary.need_dispatch}</b><span>Need Dispatch</span></div>
     <div><b>{summary.assigned}</b><span>Assigned</span></div>
     <div><b>{summary.dispatched}</b><span>Dispatched</span></div>
     <div><b>{summary.in_transit}</b><span>In Transit</span></div>
    </div>
   </section>

   <section className="panel">
    <div className="panel-head"><h3>Payment Summary</h3></div>
    <div className="money-stack">
     <div><span>Total Receive</span><b className="success-text">{money(summary.receive_total)}</b></div>
     <div><span>Total Pay</span><b className="danger-text">{money(summary.pay_total)}</b></div>
     <div className="total"><span>Net Movement</span><b>{money(net)}</b></div>
    </div>
   </section>
  </div>
 </>
}
