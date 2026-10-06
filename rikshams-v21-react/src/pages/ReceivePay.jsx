import React,{useMemo,useState} from 'react'
import {ArrowDownToLine,ArrowUpFromLine,Banknote,CalendarDays,FileText,Landmark,Scale,UserRound} from 'lucide-react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {createTransaction,ensureSlip,updateRow} from '../services/api'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import {formatDateTime,money,num,todayKathmandu} from '../utils/format'
import {activeTransactions,orderFinancial,portfolioFinancial} from '../utils/accounting'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import SearchPicker from '../components/SearchPicker'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import {Field,FormNote,FormSection} from '../components/FormKit'
import {DateStack,IdentityCell,MoneyCell,RowActions} from '../components/TableKit'

export default function ReceivePay(){
 const {profile}=useAuth()
 const {rows:transactions,reload}=useRealtimeTable('transactions',{filters:[['archived','eq',false]]})
 const {rows:orders,reload:reloadOrders}=useRealtimeTable('orders',{filters:[['archived','eq',false]]})
 const {rows:partners}=useRealtimeTable('partners',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const {rows:drivers}=useRealtimeTable('drivers',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const {rows:labourers}=useRealtimeTable('labourers',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const {rows:owners}=useRealtimeTable('vehicle_owners',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const [tab,setTab]=useState('Receive'),[search,setSearch]=useState(''),[method,setMethod]=useState('All'),[status,setStatus]=useState('All'),[sort,setSort]=useState('newest'),[modal,setModal]=useState(false),[view,setView]=useState('table'),[error,setError]=useState('')
 const direction=tab==='Receive'?'IN':'OUT'
 const effective=activeTransactions(transactions),portfolio=portfolioFinancial(orders,transactions)
 const filtered=useMemo(()=>{const q=search.toLowerCase();const list=transactions.filter(t=>t.direction===direction&&(method==='All'||t.method===method)&&(status==='All'||t.status===status)&&(!q||[t.id,t.order_id,t.party_name,t.party_type,t.reference,t.note,t.type].join(' ').toLowerCase().includes(q)));return [...list].sort((a,b)=>sort==='oldest'?String(a.created_at||'').localeCompare(String(b.created_at||'')):sort==='amount-high'?num(b.amount)-num(a.amount):sort==='amount-low'?num(a.amount)-num(b.amount):String(b.created_at||'').localeCompare(String(a.created_at||'')))},[transactions,direction,method,status,search,sort])
 const effectiveInTab=activeTransactions(filtered),tabTotal=effectiveInTab.reduce((s,t)=>s+num(t.amount),0),cash=effectiveInTab.filter(t=>t.method==='Cash').reduce((s,t)=>s+num(t.amount),0),digital=effectiveInTab.filter(t=>['Bank','eSewa','Khalti'].includes(t.method)).reduce((s,t)=>s+num(t.amount),0)

 const recalcOrderSettlement=async orderId=>{
   if(!orderId)return
   const order=orders.find(o=>o.id===orderId);if(!order)return
   const {data:all,error:e}=await supabase.from('transactions').select('*').eq('order_id',order.id);if(e)throw e
   const fin=orderFinancial(order,all||[]),bill=num(order.final_customer_bill||order.final_bill||order.customer_rate)
   const {error:u}=await supabase.from('orders').update({payment:fin.received+0.0001>=bill?'Paid':fin.received>0?'Partial':'Pending',settlement_status:fin.payable<=0.0001?'Settled':fin.resourcePaid>0?'Partial':'Open'}).eq('id',order.id);if(u)throw u
   await supabase.from('jobs').update({payment_state:fin.payable<=0.0001?'Settled':fin.resourcePaid>0?'Partial':'Open',updated_at:new Date().toISOString()}).eq('order_id',order.id).eq('archived',false)
 }
 const reverse=async t=>{if(t.status==='Reversed'||t.reversal_of||t.reversed_by)return;if(!confirm(`Reverse ${t.id} · ${money(t.amount)}?\nThe original record stays in history.`))return;setError('');try{const rev=await createTransaction({order_id:t.order_id,party_type:t.party_type,party_id:t.party_id,party_name:t.party_name,type:`Reversal · ${t.type||'Transaction'}`,direction:t.direction==='IN'?'OUT':'IN',amount:t.amount,method:t.method,reference:t.reference,note:`Reversal of ${t.id}${t.note?` · ${t.note}`:''}`,reversal_of:t.id,created_by:profile?.id||null});await updateRow('transactions',t.id,{status:'Reversed',reversed_by:rev.id});await supabase.from('slips').update({status:'Reversed'}).eq('transaction_id',t.id);await recalcOrderSettlement(t.order_id);await Promise.all([reload({silent:true}),reloadOrders({silent:true})])}catch(e){setError(e.message)}}
 const columns=[
  {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
  {key:'id',label:'Transaction',render:r=><span className="pro-stack-cell"><b className="link">{r.id}</b><small>{r.reversal_of?`Reversal of ${r.reversal_of}`:(r.order_id||'General')}</small></span>},
  {key:'party_name',label:'Party',render:r=><IdentityCell title={r.party_name||'General'} subtitle={r.party_type||'Other'} meta={r.order_id||null}/>},
  {key:'type',label:'Type',render:r=><span className="pro-soft-chip">{r.type||'Transaction'}</span>},
  {key:'amount',label:'Amount',align:'right',render:r=><MoneyCell value={r.amount} tone={r.direction==='IN'?'success':'danger'} label={r.direction==='IN'?'Receive':'Pay'}/>},
  {key:'method',label:'Method',render:r=><span className="pro-stack-cell"><b>{r.method||'—'}</b><small>{r.reference||'No reference'}</small></span>},
  {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
  {key:'created_at',label:'Created',render:r=><DateStack date={new Date(r.created_at).toLocaleDateString()} time={new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}/>},
  {key:'action',label:'Action',className:'pro-action-col',align:'right',render:r=>!r.reversal_of&&!r.reversed_by&&r.status!=='Reversed'?<RowActions actions={[{label:'Reverse Transaction',onClick:()=>reverse(r),danger:true}]} />:<span className="pro-muted">History</span>}
 ]
 return <>
  <PageTitle title="Receive & Pay" subtitle="Customer receipts, resource payments, vouchers and settlement history" actions={<button className="primary" onClick={()=>setModal(true)}>＋ {tab}</button>}/>
  <div className="finance-command-grid"><button className={`finance-command receive ${tab==='Receive'?'active':''}`} onClick={()=>setTab('Receive')}><span className="finance-command-icon"><ArrowDownToLine size={20}/></span><div><small>Customer Money In</small><b>Receive</b><strong>{money(effective.filter(t=>t.direction==='IN').reduce((s,t)=>s+num(t.amount),0))}</strong></div></button><button className={`finance-command pay ${tab==='Pay'?'active':''}`} onClick={()=>setTab('Pay')}><span className="finance-command-icon"><ArrowUpFromLine size={20}/></span><div><small>Partner / Crew Money Out</small><b>Pay</b><strong>{money(effective.filter(t=>t.direction==='OUT').reduce((s,t)=>s+num(t.amount),0))}</strong></div></button><div className="finance-health-card"><span><Banknote size={18}/> Customer Due</span><b>{money(portfolio.receivable)}</b><small>Booked bill less effective receipts</small></div><div className="finance-health-card"><span><Scale size={18}/> Resource Payable</span><b>{money(portfolio.payable)}</b><small>Committed cost less effective payments</small></div></div>
  <div className="finance-summary modern-finance-summary"><div><span>{tab} Total</span><b>{money(tabTotal)}</b></div><div><span>Effective Transactions</span><b>{effectiveInTab.length}</b></div><div><span>Cash</span><b>{money(cash)}</b></div><div><span>Bank / Wallet</span><b>{money(digital)}</b></div></div>
  {error&&<div className="form-error">{error}</div>}
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search transaction, party, order…" className="pro-module-toolbar" onReset={()=>{setSearch('');setMethod('All');setStatus('All');setSort('newest')}}><select value={method} onChange={e=>setMethod(e.target.value)}>{['All','Cash','Bank','eSewa','Khalti','Credit','Other'].map(x=><option key={x}>{x}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Posted</option><option>Reversed</option></select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="amount-high">Amount High</option><option value="amount-low">Amount Low</option></select></SearchFilterBar>
  {view==='table'?<section className="panel pro-table-panel"><DataTable rows={filtered} columns={columns}/></section>:<div className="pro-card-grid">{filtered.map(t=><article className="pro-record-card finance-record-card" key={t.id}><header><IdentityCell title={t.party_name||'General'} subtitle={t.party_type||'Other'} meta={t.id}/><StatusBadge status={t.status}/></header><div className="pro-record-kvs"><div><small>Order</small><b>{t.order_id||'General'}</b></div><div><small>Type</small><b>{t.type||'Transaction'}</b></div><div><small>Amount</small><MoneyCell value={t.amount} tone={t.direction==='IN'?'success':'danger'} label={t.direction==='IN'?'Receive':'Pay'}/></div><div><small>Method</small><b>{t.method||'—'}</b></div></div><footer>{!t.reversal_of&&!t.reversed_by&&t.status!=='Reversed'?<RowActions actions={[{label:'Reverse Transaction',onClick:()=>reverse(t),danger:true}]}/>:<span className="pro-muted">Historical record</span>}</footer></article>)}</div>}
  {modal&&<TransactionModal mode={tab} orders={orders} transactions={transactions} partners={partners} drivers={drivers} labourers={labourers} owners={owners} profile={profile} onClose={()=>setModal(false)} onSaved={async(orderId)=>{setModal(false);if(orderId)await recalcOrderSettlement(orderId);await Promise.all([reload({silent:true}),reloadOrders({silent:true})])}}/>}
 </>
}

function TransactionModal({mode,orders,transactions,partners,drivers,labourers,owners,profile,onClose,onSaved}){
 const direction=mode==='Receive'?'IN':'OUT'
 const [f,setF]=useState({order_id:'',party_type:mode==='Receive'?'Customer':'Partner',party_id:'',party_name:'',type:mode==='Receive'?'Customer Payment':'Partner Payment',amount:'',method:'Cash',reference:'',note:'',date:todayKathmandu()}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const order=orders.find(o=>o.id===f.order_id),fin=order?orderFinancial(order,transactions):null
 const resources=f.party_type==='Partner'?partners:f.party_type==='Driver'?drivers:f.party_type==='Labour'?labourers:f.party_type==='Vehicle Owner'?owners:[]
 const partyTypes=mode==='Receive'?['Customer','Other']:['Partner','Vehicle Owner','Driver','Labour','Expense','Refund','Other']
 const txTypes=mode==='Receive'?['Customer Payment','Advance','Final Payment','Partial Payment','Other Receipt']:['Partner Payment','Vehicle Owner Payment','Driver Payment','Labour Payment','Expense','Refund','Other Payment']
 const selectOrder=id=>{const o=orders.find(x=>x.id===id);if(mode==='Receive'){setF(x=>({...x,order_id:id,party_type:'Customer',party_id:o?.customer_id||'',party_name:o?.customer||''}));return}const partner=o?.partner_id?partners.find(p=>p.id===o.partner_id):null,driver=o?.driver_id?drivers.find(d=>d.id===o.driver_id):null;if(partner)setF(x=>({...x,order_id:id,party_type:'Partner',party_id:partner.id,party_name:partner.name||'',type:'Partner Payment'}));else if(driver)setF(x=>({...x,order_id:id,party_type:'Driver',party_id:driver.id,party_name:driver.name||'',type:'Driver Payment'}));else setF(x=>({...x,order_id:id}))}
 const selectParty=id=>{const p=resources.find(x=>x.id===id);setF(x=>({...x,party_id:id,party_name:p?.name||''}))}
 const partyPaidBefore=activeTransactions(transactions).filter(t=>t.direction==='OUT'&&t.order_id===f.order_id&&t.party_type===f.party_type&&(!f.party_id||t.party_id===f.party_id)).reduce((s,t)=>s+num(t.amount),0)
 const save=async()=>{
   const amount=num(f.amount)
   if(amount<=0)return setError('Amount must be greater than zero.')
   if(mode==='Receive'&&order&&fin&&amount>fin.receivable+0.0001)return setError(`Amount is higher than customer due (${money(fin.receivable)}).`)
   if(mode==='Pay'&&order&&fin&&!['Expense','Refund','Other'].includes(f.party_type)&&amount>fin.payable+0.0001)return setError(`Amount is higher than resource payable (${money(fin.payable)}).`)
   if(mode==='Pay'&&!f.party_name&&!['Expense','Refund','Other'].includes(f.party_type))return setError('Select the person/partner being paid.')
   setBusy(true);setError('')
   try{
     const txn=await createTransaction({...f,direction,created_by:profile?.id||null,party_name:f.party_name||(f.party_type==='Customer'?order?.customer:'')})
     if(mode==='Receive'){
       await ensureSlip('RECEIPT',order||null,{transactionId:txn.id,orderId:order?.id||null,amount,paymentMethod:f.method,partyName:f.party_name||order?.customer||'Customer',source:'Customer Payment',snapshot:{transactionId:txn.id,receiptType:f.type,partyName:f.party_name||order?.customer||'Customer',paymentMethod:f.method,reference:f.reference||null,totalBill:fin?.bill||amount,previousReceived:fin?.received||0,thisPayment:amount,balanceAfter:order?Math.max(0,(fin?.receivable||0)-amount):0,note:f.note||null}})
     }else{
       await ensureSlip('PAYMENT_VOUCHER',order||null,{transactionId:txn.id,orderId:order?.id||null,amount,paymentMethod:f.method,partyName:f.party_name||f.party_type,source:'Resource Payment',snapshot:{transactionId:txn.id,payeeType:f.party_type,payeeId:f.party_id||null,payeeName:f.party_name||f.party_type,paymentFor:f.type,orderId:order?.id||null,orderCustomer:order?.customer||null,paymentMethod:f.method,reference:f.reference||null,grossPayable:fin?.resourceCost||amount,previousPaid:partyPaidBefore,thisPayment:amount,remainingOrderPayable:order?Math.max(0,(fin?.payable||0)-amount):0,note:f.note||null}})
     }
     onSaved(order?.id||null)
   }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <Modal open title={mode==='Receive'?'Record Customer Receipt':'Record Payment'} subtitle={mode==='Receive'?'Post customer money received. A professional Money Receipt is created automatically.':'Post money paid to a partner, owner, driver or labour. A Payment Voucher is created automatically.'} eyebrow="Receive & Pay" onClose={onClose} size="lg" className="receive-pay-editor-modal" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Posting…':mode==='Receive'?'Post Receive & Create Receipt':'Post Pay & Create Voucher'}</button></>}>
  {order&&<div className="transaction-balance-preview"><div><small>Order Bill</small><b>{money(fin.bill)}</b></div><div><small>Received</small><b>{money(fin.received)}</b></div><div><small>Customer Due</small><b>{money(fin.receivable)}</b></div><div><small>Resource Payable</small><b>{money(fin.payable)}</b></div></div>}
  <div className="v25-form-stack mt">
   <FormSection title="Reference" description="Link the transaction to an order when applicable." icon={<FileText size={18}/>} compact><div className="form-grid cols-2"><Field label="Order"><SearchPicker title="Order" value={f.order_id} allowClear options={orders.filter(o=>o.status!=='Cancelled').map(o=>({value:o.id,label:`${o.id} · ${o.customer}`,sub:[o.phone,o.pickup&&o.drop?`${o.pickup} → ${o.drop}`:''].filter(Boolean).join(' · ')}))} placeholder="Select order / general…" onChange={v=>selectOrder(v)}/></Field><Field label="Transaction Type"><select value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}>{txTypes.map(x=><option key={x}>{x}</option>)}</select></Field></div></FormSection>
   <FormSection title={mode==='Receive'?'Received From':'Paid To'} description={mode==='Receive'?'Customer or other receipt source.':'Choose the resource/party receiving payment.'} icon={<UserRound size={18}/>}><div className="form-grid cols-2"><Field label="Party Type"><select value={f.party_type} onChange={e=>setF(x=>({...x,party_type:e.target.value,party_id:'',party_name:e.target.value==='Customer'?(order?.customer||''):''}))}>{partyTypes.map(x=><option key={x}>{x}</option>)}</select></Field>{resources.length?<Field label={`Select ${f.party_type}`} required={mode==='Pay'}><SearchPicker title={f.party_type} value={f.party_id} options={resources.map(x=>({value:x.id,label:x.name,sub:[x.mobile,x.area||x.address].filter(Boolean).join(' · ')}))} placeholder={`Select ${f.party_type.toLowerCase()}…`} onChange={v=>selectParty(v)}/></Field>:<Field label="Party Name"><input value={f.party_name} onChange={e=>setF(x=>({...x,party_name:e.target.value}))} placeholder="Name"/></Field>}</div></FormSection>
   <FormSection title="Amount & Payment" description="This posted transaction becomes the accounting source of truth." icon={<Landmark size={18}/>}><div className="form-grid cols-2"><Field label="Amount" required><input type="number" min="0" step="0.01" value={f.amount} onChange={e=>setF(x=>({...x,amount:e.target.value}))} placeholder="0.00"/></Field><Field label="Payment Method"><select value={f.method} onChange={e=>setF(x=>({...x,method:e.target.value}))}>{['Cash','Bank','eSewa','Khalti','Credit','Other'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Reference"><input value={f.reference} onChange={e=>setF(x=>({...x,reference:e.target.value}))} placeholder="Bank / wallet / reference no."/></Field><Field label="Date"><div className="input-with-icon"><CalendarDays size={16}/><input type="date" value={f.date} onChange={e=>setF(x=>({...x,date:e.target.value}))}/></div></Field><Field label="Note" full><textarea rows="3" value={f.note} onChange={e=>setF(x=>({...x,note:e.target.value}))} placeholder="Payment purpose / remarks…"/></Field></div><FormNote>{mode==='Receive'?'Saving creates a Money Receipt linked to this transaction.':'Saving creates a Payment Voucher linked to this transaction. Reversals never delete the original record.'}</FormNote></FormSection>
  </div>
  {error&&<div className="form-error">{error}</div>}
 </Modal>
}
