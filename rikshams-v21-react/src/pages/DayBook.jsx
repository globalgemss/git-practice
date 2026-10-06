import React,{useMemo,useState} from 'react'
import {ArrowDownToLine,ArrowUpFromLine,Banknote,BookCheck,Scale,WalletCards} from 'lucide-react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {insertRow,updateRow} from '../services/api'
import {useAuth} from '../contexts/AuthContext'
import {formatDateTime,money,num,todayKathmandu} from '../utils/format'
import {activeTransactions,txnDate} from '../utils/accounting'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import {DateStack,IdentityCell,MoneyCell} from '../components/TableKit'

function isoDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function rangeBounds(range,date,from,to){if(range==='All')return {start:null,end:null};if(range==='Custom')return {start:from||null,end:to||null};const d=new Date(`${date}T00:00:00`),start=new Date(d),end=new Date(d);if(range==='Weekly')start.setDate(d.getDate()-6);if(range==='Monthly')start.setDate(1);return {start:isoDate(start),end:isoDate(end)}}

export default function DayBook(){
 const {profile}=useAuth()
 const {rows:txns}=useRealtimeTable('transactions',{filters:[['archived','eq',false]]})
 const {rows:closings,reload}=useRealtimeTable('daybook_closings',{order:'date'})
 const [range,setRange]=useState('Daily'),[date,setDate]=useState(todayKathmandu()),[from,setFrom]=useState(todayKathmandu()),[to,setTo]=useState(todayKathmandu()),[search,setSearch]=useState(''),[flow,setFlow]=useState('All'),[method,setMethod]=useState('All'),[sort,setSort]=useState('newest'),[view,setView]=useState('table'),[closeOpen,setCloseOpen]=useState(false)
 const allEffective=activeTransactions(txns),bounds=rangeBounds(range,date,from,to)
 const opening=useMemo(()=>bounds.start?allEffective.filter(t=>txnDate(t)<bounds.start).reduce((s,t)=>s+(t.direction==='IN'?num(t.amount):-num(t.amount)),0):0,[allEffective,bounds.start])
 const filtered=useMemo(()=>{const q=search.toLowerCase();const list=txns.filter(t=>{const d=txnDate(t),inside=(!bounds.start||d>=bounds.start)&&(!bounds.end||d<=bounds.end);return inside&&(flow==='All'||t.direction===flow)&&(method==='All'||t.method===method)&&(!q||[t.id,t.party_name,t.party_type,t.order_id,t.note,t.type,t.reference].join(' ').toLowerCase().includes(q))});return [...list].sort((a,b)=>sort==='oldest'?String(a.created_at||'').localeCompare(String(b.created_at||'')):sort==='amount-high'?num(b.amount)-num(a.amount):sort==='amount-low'?num(a.amount)-num(b.amount):String(b.created_at||'').localeCompare(String(a.created_at||'')))},[txns,bounds.start,bounds.end,flow,method,search,sort])
 const effective=activeTransactions(filtered),receive=effective.filter(t=>t.direction==='IN').reduce((s,t)=>s+num(t.amount),0),pay=effective.filter(t=>t.direction==='OUT').reduce((s,t)=>s+num(t.amount),0),net=receive-pay,expected=opening+net,todayClose=range==='Daily'?closings.find(c=>c.date===date):null
 const columns=[
  {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
  {key:'date',label:'Date / Time',render:r=><DateStack date={txnDate(r)} time={new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}/>},
  {key:'id',label:'Transaction',render:r=><span className="pro-stack-cell"><b className="link">{r.id}</b><small>{r.order_id||'No order'}</small></span>},
  {key:'party_name',label:'Party',render:r=><IdentityCell title={r.party_name||'General'} subtitle={r.party_type||'—'}/>},
  {key:'type',label:'Type',render:r=><span className="pro-soft-chip">{r.type||'Transaction'}</span>},
  {key:'direction',label:'Flow',render:r=><span className={`flow-pill ${r.direction==='IN'?'receive':'pay'}`}>{r.direction==='IN'?'Receive':'Pay'}</span>},
  {key:'method',label:'Method',render:r=><span className="pro-stack-cell"><b>{r.method||'—'}</b><small>{r.reference||'No reference'}</small></span>},
  {key:'amount',label:'Amount',align:'right',render:r=><MoneyCell value={r.amount} tone={r.direction==='IN'?'success':'danger'}/>},
  {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
  {key:'note',label:'Note',render:r=><span className="pro-note-cell">{r.note||'—'}</span>}
 ]
 return <>
  <PageTitle title="Day Book" subtitle="Opening balance, daily movement and verified closing" actions={<button className="primary" disabled={range!=='Daily'} onClick={()=>setCloseOpen(true)}><BookCheck size={16}/> Close Day</button>}/>
  <div className="daybook-hero-grid"><div><span><WalletCards size={16}/> Opening</span><b>{money(opening)}</b><small>Balance before selected period</small></div><div className="receive"><span><ArrowDownToLine size={16}/> Receive</span><b>{money(receive)}</b><small>Effective money in</small></div><div className="pay"><span><ArrowUpFromLine size={16}/> Pay</span><b>{money(pay)}</b><small>Effective money out</small></div><div><span><Scale size={16}/> Net Movement</span><b>{money(net)}</b><small>Receive less pay</small></div><div><span><Banknote size={16}/> Expected Closing</span><b>{money(expected)}</b><small>Opening + net movement</small></div><div><span><BookCheck size={16}/> Verified Closing</span><b>{todayClose?money(todayClose.total):'—'}</b><small>{todayClose?.verified_at?formatDateTime(todayClose.verified_at):range==='Daily'?'Not closed':'Daily only'}</small></div></div>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search transaction, party, order…" onReset={()=>{setSearch('');setFlow('All');setMethod('All');setSort('newest');setRange('Daily');setDate(todayKathmandu())}} className="daybook-toolbar pro-module-toolbar"><select value={range} onChange={e=>setRange(e.target.value)}>{['Daily','Weekly','Monthly','Custom','All'].map(x=><option key={x}>{x}</option>)}</select>{range==='Custom'?<><input className="date-input" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input className="date-input" type="date" value={to} onChange={e=>setTo(e.target.value)}/></>:range!=='All'?<input className="date-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/>:null}<select value={flow} onChange={e=>setFlow(e.target.value)}><option value="All">All Flow</option><option value="IN">Receive</option><option value="OUT">Pay</option></select><select value={method} onChange={e=>setMethod(e.target.value)}>{['All','Cash','Bank','eSewa','Khalti','Credit','Other'].map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="amount-high">Amount High</option><option value="amount-low">Amount Low</option></select></SearchFilterBar>
  {view==='table'?<section className="panel pro-table-panel"><DataTable rows={filtered} columns={columns}/></section>:<div className="pro-card-grid">{filtered.map(t=><article className="pro-record-card daybook-card" key={t.id}><header><IdentityCell title={t.party_name||'General'} subtitle={t.party_type||'Other'} meta={t.id}/><StatusBadge status={t.status}/></header><div className="pro-record-kvs"><div><small>Order</small><b>{t.order_id||'No order'}</b></div><div><small>Flow</small><span className={`flow-pill ${t.direction==='IN'?'receive':'pay'}`}>{t.direction==='IN'?'Receive':'Pay'}</span></div><div><small>Amount</small><MoneyCell value={t.amount} tone={t.direction==='IN'?'success':'danger'}/></div><div><small>Method</small><b>{t.method||'—'}</b></div></div><footer><span className="pro-muted">{formatDateTime(t.created_at)}</span></footer></article>)}</div>}
  {closeOpen&&<CloseDay date={date} existing={todayClose} expected={expected} profile={profile} onClose={()=>setCloseOpen(false)} onSaved={()=>{setCloseOpen(false);reload({silent:true})}}/>}
 </>
}

function CloseDay({date,existing,expected,profile,onClose,onSaved}){
 const [f,setF]=useState({cash:existing?.cash||0,bank:existing?.bank||0,esewa:existing?.esewa||0,khalti:existing?.khalti||0,other:existing?.other||0,note:existing?.note||''}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const total=['cash','bank','esewa','khalti','other'].reduce((s,k)=>s+num(f[k]),0),difference=total-expected
 const save=async()=>{setBusy(true);setError('');try{const row={date,...f,total,verified_by:profile?.id||null,verified_at:new Date().toISOString()};existing?.id?await updateRow('daybook_closings',existing.id,row):await insertRow('daybook_closings',row);onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <Modal open title={`Close Day · ${date}`} subtitle="Enter the actual end-of-day balance by payment channel and verify the difference." onClose={onClose} size="lg" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy?'Saving…':'Verify & Close'}</button></>}><div className="closing-preview modern-closing-preview"><div><small>Expected Closing</small><b>{money(expected)}</b></div><div><small>Actual Total</small><b>{money(total)}</b></div><div className="closing-difference"><small>Difference</small><b className={Math.abs(difference)<0.005?'success-text':'danger-text'}>{money(difference)}</b></div></div><div className="modal-section"><div className="form-grid cols-2">{['cash','bank','esewa','khalti','other'].map(k=><label className="field" key={k}><span>{k[0].toUpperCase()+k.slice(1)}</span><input type="number" step="0.01" value={f[k]} onChange={e=>setF(x=>({...x,[k]:e.target.value}))}/></label>)}<label className="field span-2"><span>Closing Note</span><textarea value={f.note} onChange={e=>setF(x=>({...x,note:e.target.value}))}/></label></div></div>{error&&<div className="form-error">{error}</div>}</Modal>
}
