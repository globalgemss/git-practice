import React,{useMemo,useState} from 'react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {createTransaction,reverseTransaction} from '../services/api'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import {formatDateTime,money,num,todayKathmandu} from '../utils/format'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'

export default function ReceivePay(){
 const {profile}=useAuth(),{rows,reload}=useRealtimeTable('transactions',{filters:[['archived','eq',false]]}),{rows:orders}=useRealtimeTable('orders',{filters:[['archived','eq',false]]})
 const [tab,setTab]=useState('Receive'),[search,setSearch]=useState(''),[method,setMethod]=useState('All'),[modal,setModal]=useState(false),[view,setView]=useState('table'),[error,setError]=useState('')
 const direction=tab==='Receive'?'IN':'OUT',filtered=useMemo(()=>{const q=search.toLowerCase();return rows.filter(t=>t.direction===direction&&(method==='All'||t.method===method)&&(!q||[t.id,t.order_id,t.party_name,t.reference,t.note].join(' ').toLowerCase().includes(q)))},[rows,tab,search,method])
 const reverse=async t=>{
  if(t.status==='Reversed'||t.reversal_of||t.reversed_by)return
  if(!confirm(`Reverse ${t.id} · ${money(t.amount)}?\nThe original record will stay in history.`))return
  setError('')
  try{
   await reverseTransaction(t.id,`Reversal of ${t.id}`)
   reload()
  }catch(e){setError(e.message||'Transaction could not be reversed.')}
 }
 return <>
  <PageTitle title="Receive & Pay" subtitle="Customer receipts and partner/driver/labour payments" actions={<button className="primary" onClick={()=>setModal(true)}>＋ {tab}</button>}/>
  <div className="master-tabs"><button className={tab==='Receive'?'active':''} onClick={()=>setTab('Receive')}>Receive</button><button className={tab==='Pay'?'active':''} onClick={()=>setTab('Pay')}>Pay</button></div>
  <div className="finance-summary"><div><span>{tab} Total</span><b>{money(filtered.filter(x=>x.status!=='Reversed').reduce((s,t)=>s+num(t.amount),0))}</b></div><div><span>Transactions</span><b>{filtered.length}</b></div><div><span>Cash</span><b>{money(filtered.filter(t=>t.status!=='Reversed'&&t.method==='Cash').reduce((s,t)=>s+num(t.amount),0))}</b></div><div><span>Bank / Wallet</span><b>{money(filtered.filter(t=>t.status!=='Reversed'&&['Bank','eSewa','Khalti'].includes(t.method)).reduce((s,t)=>s+num(t.amount),0))}</b></div></div>
  {error&&<div className="form-error">{error}</div>}
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search transaction, party, order…"><select value={method} onChange={e=>setMethod(e.target.value)}>{['All','Cash','Bank','eSewa','Khalti','Credit','Other'].map(x=><option key={x}>{x}</option>)}</select></SearchFilterBar>
  {view==='table'?<section className="panel"><DataTable rows={filtered} columns={[{key:'sn',label:'SN',render:(_r,i)=>i+1},{key:'id',label:'Transaction',render:r=><><b>{r.id}</b>{r.reversal_of&&<small>Reverses {r.reversal_of}</small>}</>},{key:'order_id',label:'Order'},{key:'party_name',label:'Party',render:r=><><b>{r.party_name||'—'}</b><small>{r.party_type}</small></>},{key:'type',label:'Type'},{key:'amount',label:'Amount',render:r=><b className={r.direction==='IN'?'success-text':'danger-text'}>{money(r.amount)}</b>},{key:'method',label:'Method'},{key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},{key:'created_at',label:'Created',render:r=>formatDateTime(r.created_at)},{key:'action',label:'Action',render:r=>!r.reversal_of&&!r.reversed_by&&r.status!=='Reversed'?<button className="ghost small danger-text" onClick={()=>reverse(r)}>Reverse</button>:<span className="muted">—</span>}]}/></section>:<div className="card-grid">{filtered.map(t=><article className="list-card" key={t.id}><div className="list-card-head"><b>{t.id}</b><StatusBadge status={t.status}/></div><h3>{t.party_name||'General'}</h3><div className="card-line"><small>{t.method}</small><b className={t.direction==='IN'?'success-text':'danger-text'}>{money(t.amount)}</b></div><small>{formatDateTime(t.created_at)}</small>{!t.reversal_of&&!t.reversed_by&&t.status!=='Reversed'&&<button className="ghost small danger-text" onClick={()=>reverse(t)}>Reverse Transaction</button>}</article>)}</div>}
  {modal&&<TransactionModal mode={tab} orders={orders} profile={profile} onClose={()=>setModal(false)} onSaved={()=>{setModal(false);reload()}}/>}
 </>
}
function TransactionModal({mode,orders,profile,onClose,onSaved}){
 const direction=mode==='Receive'?'IN':'OUT'
 const [f,setF]=useState({order_id:'',party_type:mode==='Receive'?'Customer':'Partner',party_id:'',party_name:'',type:mode==='Receive'?'Customer Payment':'Partner Payment',amount:'',method:'Cash',reference:'',note:'',date:todayKathmandu()})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const save=async()=>{
  if(busy)return
  if(num(f.amount)<=0)return setError('Amount required.')
  setBusy(true);setError('')
  try{
   const order=orders.find(o=>o.id===f.order_id)
   await createTransaction({
    ...f,
    direction,
    action_id:crypto.randomUUID(),
    party_name:f.party_name||(f.party_type==='Customer'?order?.customer:''),
    created_by:profile?.id||null
   })
   onSaved()
  }catch(e){setError(e.message||'Transaction could not be saved.')}
  finally{setBusy(false)}
 }
 return <Modal open title={`${mode} Transaction`} onClose={onClose} size="lg" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':`Save ${mode}`}</button></>}>
  <div className="form-grid cols-2">
   <label className="field"><span>Order</span><select value={f.order_id} onChange={e=>{const o=orders.find(x=>x.id===e.target.value);setF(x=>({...x,order_id:e.target.value,party_name:x.party_type==='Customer'?(o?.customer||''):x.party_name}))}}><option value="">No order / general</option>{orders.map(o=><option key={o.id} value={o.id}>{o.id} · {o.customer}</option>)}</select></label>
   <label className="field"><span>Party Type</span><select value={f.party_type} onChange={e=>setF(x=>({...x,party_type:e.target.value}))}>{(mode==='Receive'?['Customer','Other']:['Partner','Vehicle Owner','Driver','Labour','Expense','Other']).map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="field"><span>Party Name</span><input value={f.party_name} onChange={e=>setF(x=>({...x,party_name:e.target.value}))}/></label>
   <label className="field"><span>Type</span><select value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}>{(mode==='Receive'?['Customer Payment','Advance','Final Payment','Partial Payment']:['Partner Payment','Driver Payment','Labour Payment','Expense','Refund']).map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="field"><span>Amount *</span><input type="number" min="0" value={f.amount} onChange={e=>setF(x=>({...x,amount:e.target.value}))}/></label>
   <label className="field"><span>Payment Method</span><select value={f.method} onChange={e=>setF(x=>({...x,method:e.target.value}))}>{['Cash','Bank','eSewa','Khalti','Credit','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="field"><span>Reference</span><input value={f.reference} onChange={e=>setF(x=>({...x,reference:e.target.value}))}/></label>
   <label className="field"><span>Date</span><input type="date" value={f.date} onChange={e=>setF(x=>({...x,date:e.target.value}))}/></label>
   <label className="field span-2"><span>Note</span><textarea rows="3" value={f.note} onChange={e=>setF(x=>({...x,note:e.target.value}))}/></label>
  </div>
  {error&&<div className="form-error">{error}</div>}
 </Modal>
}