import React,{useEffect,useMemo,useState} from 'react'
import {Banknote,CheckCircle2,ReceiptText,WalletCards} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import {createTransaction,ensureSlip,insertRow} from '../services/api'
import {money,num} from '../utils/format'
import {activeTransactions,orderFinancial} from '../utils/accounting'
import Modal from './Modal'
import {Field,FormNote,FormSection} from './FormKit'

const METHODS=['Cash','Bank','eSewa','Khalti','Credit','Other']

function vehiclePaid(rows=[]){
  return activeTransactions(rows).filter(t=>t.direction==='OUT'&&['Partner','Vehicle Owner','Driver'].includes(t.party_type)).reduce((s,t)=>s+num(t.amount),0)
}
function customerReceived(rows=[]){
  return activeTransactions(rows).filter(t=>t.direction==='IN'&&(t.party_type==='Customer'||!t.party_type)).reduce((s,t)=>s+num(t.amount),0)
}
function labourPaid(rows=[],id=''){
  return activeTransactions(rows).filter(t=>t.direction==='OUT'&&t.party_type==='Labour'&&(!id||t.party_id===id)).reduce((s,t)=>s+num(t.amount),0)
}

export default function OrderFinanceActionModal({
  order,
  mode='receive-customer',
  vehicleParty=null,
  labourOptions=[],
  onClose,
  onSaved,
  onOpenSlip
}){
  const {profile}=useAuth()
  const [rows,setRows]=useState([]),[labourId,setLabourId]=useState(labourOptions[0]?.id||''),[amount,setAmount]=useState(''),[method,setMethod]=useState('Cash'),[reference,setReference]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saved,setSaved]=useState(null)

  useEffect(()=>{setLabourId(labourOptions[0]?.id||'')},[mode,order?.id,labourOptions.map(x=>x.id).join('|')])
  useEffect(()=>{
    let live=true
    const load=async()=>{
      setLoading(true);setError('')
      const {data,error:e}=await supabase.from('transactions').select('*').eq('order_id',order.id).eq('archived',false).order('created_at',{ascending:false})
      if(!live)return
      if(e)setError(e.message);else setRows(data||[])
      setLoading(false)
    }
    load();return()=>{live=false}
  },[order.id])

  const selectedLabour=labourOptions.find(x=>x.id===labourId)||labourOptions[0]||null
  const summary=useMemo(()=>{
    if(mode==='receive-customer'){
      const bill=num(order.final_customer_bill||order.final_bill||order.customer_rate),paid=customerReceived(rows)
      return {title:'Receive Customer Payment',eyebrow:'Order Payment',partyType:'Customer',partyId:order.customer_id||null,partyName:order.customer||'Customer',bill,paid,balance:Math.max(0,bill-paid),transactionType:paid>0?'Customer Balance Payment':'Customer Payment',direction:'IN',slipType:'RECEIPT',actionLabel:paid>0?'Receive Balance':'Receive Payment'}
    }
    if(mode==='pay-vehicle'){
      const bill=num(order.vehicle_cost),paid=vehiclePaid(rows)
      return {title:'Pay Vehicle Partner',eyebrow:'Order Payout',partyType:vehicleParty?.type||'Partner',partyId:vehicleParty?.id||null,partyName:vehicleParty?.name||'Vehicle Partner',bill,paid,balance:Math.max(0,bill-paid),transactionType:`${vehicleParty?.type||'Partner'} Payment`,direction:'OUT',slipType:'PAYMENT_VOUCHER',actionLabel:'Pay Vehicle Partner'}
    }
    const bill=num(selectedLabour?.committed),paid=labourPaid(rows,selectedLabour?.id)
    return {title:'Pay Labour',eyebrow:'Order Payout',partyType:'Labour',partyId:selectedLabour?.id||null,partyName:selectedLabour?.name||'Labour',bill,paid,balance:Math.max(0,bill-paid),transactionType:'Labour Payment',direction:'OUT',slipType:'PAYMENT_VOUCHER',actionLabel:'Pay Labour'}
  },[mode,order,rows,vehicleParty,selectedLabour])

  useEffect(()=>{if(!saved)setAmount(summary.balance>0?String(summary.balance):'')},[summary.balance,mode,labourId,saved])

  const recalc=async()=>{
    const {data:all,error:e}=await supabase.from('transactions').select('*').eq('order_id',order.id);if(e)throw e
    const fin=orderFinancial(order,all||[]),bill=num(order.final_customer_bill||order.final_bill||order.customer_rate)
    const payment=fin.received+0.0001>=bill?'Paid':fin.received>0?'Partial':order.payment==='Credit'?'Credit':'Pending'
    const settlement=fin.payable<=0.0001?'Settled':fin.resourcePaid>0?'Partial':'Open'
    const {error:u}=await supabase.from('orders').update({payment,settlement_status:settlement,updated_at:new Date().toISOString()}).eq('id',order.id);if(u)throw u
    const {error:j}=await supabase.from('jobs').update({payment_state:settlement,updated_at:new Date().toISOString()}).eq('order_id',order.id).eq('archived',false);if(j)throw j
    return {fin,payment,settlement}
  }

  const submit=async()=>{
    const amt=num(amount)
    if(summary.balance<=0)return setError('There is no remaining balance for this action.')
    if(amt<=0)return setError('Enter an amount greater than zero.')
    if(amt-summary.balance>0.0001)return setError(`Amount cannot be more than the current balance ${money(summary.balance)}.`)
    if(mode==='pay-vehicle'&&!vehicleParty?.id)return setError('Vehicle partner / owner is not linked to this order.')
    if(mode==='pay-labour'&&!selectedLabour?.id)return setError('Select labour before making payment.')
    setBusy(true);setError('')
    try{
      const transaction=await createTransaction({
        order_id:order.id,
        party_type:summary.partyType,
        party_id:summary.partyId,
        party_name:summary.partyName,
        type:summary.transactionType,
        direction:summary.direction,
        amount:amt,
        method,
        reference:reference.trim()||null,
        note:note.trim()||null,
        created_by:profile?.id||null
      })
      const slip=await ensureSlip(summary.slipType,order,{
        transactionId:transaction.id,
        amount:amt,
        paymentMethod:method,
        partyName:summary.partyName,
        source:mode==='receive-customer'?'Order Customer Payment':'Order Resource Payment',
        snapshot:{transactionId:transaction.id,transactionType:summary.transactionType,partyType:summary.partyType,partyId:summary.partyId,partyName:summary.partyName,method,reference:reference.trim()||null,note:note.trim()||null,amount:amt,direction:summary.direction}
      })
      await insertRow('order_events',{
        order_id:order.id,
        stage:order.status,
        event_type:summary.direction==='IN'?'Payment Received':'Payment Made',
        note:`${summary.direction==='IN'?'Customer payment received':'Payment made to '+summary.partyName} · ${money(amt)} · ${method} · ${slip.slip_no}`,
        metadata:{transaction_id:transaction.id,slip_id:slip.id,amount:amt,method,party_type:summary.partyType,party_id:summary.partyId}
      })
      const finance=await recalc()
      const {data:latest}=await supabase.from('transactions').select('*').eq('order_id',order.id).eq('archived',false).order('created_at',{ascending:false})
      setRows(latest||[])
      const newBalance=mode==='receive-customer'?finance.fin.receivable:mode==='pay-vehicle'?Math.max(0,num(order.vehicle_cost)-vehiclePaid(latest||[])):Math.max(0,num(selectedLabour?.committed)-labourPaid(latest||[],selectedLabour?.id))
      setSaved({transaction,slip,amount:amt,newBalance,payment:finance.payment,settlement:finance.settlement})
      await onSaved?.({transaction,slip,newBalance,payment:finance.payment,settlement:finance.settlement})
    }catch(e){setError(e.message||'Transaction could not be saved.')}finally{setBusy(false)}
  }

  const icon=mode==='receive-customer'?<ReceiptText size={19}/>:<WalletCards size={19}/>
  const fullySettled=summary.balance<=0
  if(saved){
    return <Modal open title={summary.direction==='IN'?'Payment Received Successfully':'Payment Saved Successfully'} subtitle={`${order.id} · ${summary.partyName}`} eyebrow={summary.eyebrow} icon={<CheckCircle2 size={19}/>} onClose={onClose} size="md" footer={<><button className="outline" onClick={onClose}>Close</button><button className="outline" onClick={()=>onOpenSlip?.(saved.slip,false)}>{saved.slip.type==='RECEIPT'?'View Receipt':'View Voucher'}</button><button className="primary" onClick={()=>onOpenSlip?.(saved.slip,true)}>Print {saved.slip.type==='RECEIPT'?'Receipt':'Voucher'}</button></>}>
      <div className="order-finance-success"><span><CheckCircle2 size={28}/></span><div><small>{saved.slip.type==='RECEIPT'?'Money Received':'Payment Posted'}</small><strong>{money(saved.amount)}</strong><p>{saved.slip.slip_no} created and the Order Timeline was updated.</p></div></div>
      <div className="order-finance-success-grid"><div><span>Order</span><b>{order.id}</b></div><div><span>Party</span><b>{summary.partyName}</b></div><div><span>Method</span><b>{method}</b></div><div><span>Remaining Balance</span><b className={saved.newBalance>0?'due':'settled'}>{money(saved.newBalance)}</b></div></div>
      {mode==='receive-customer'&&saved.newBalance<=0&&<div className="order-payment-settled"><CheckCircle2 size={18}/><div><b>Customer payment settled</b><span>No customer balance remains for this order.</span></div></div>}
    </Modal>
  }

  return <Modal open title={summary.title} subtitle={`${order.id} · ${order.customer||'Customer'} · ${order.pickup||'—'} → ${order.drop||'—'}`} eyebrow={summary.eyebrow} icon={icon} onClose={onClose} size="md" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||loading||fullySettled} onClick={submit}>{busy?'Saving…':summary.direction==='IN'?'Receive & Create Receipt':'Pay & Create Voucher'}</button></>}>
    {mode==='pay-labour'&&labourOptions.length>1&&<FormSection title="Select Labour" description="Each labour payment is recorded separately against this order." compact><Field label="Labour"><select value={labourId} onChange={e=>{setLabourId(e.target.value);setSaved(null)}}>{labourOptions.map(x=><option value={x.id} key={x.id}>{x.name} · {money(x.committed)}</option>)}</select></Field></FormSection>}
    <div className="order-finance-context">
      <div><span>Order</span><b>{order.id}</b></div><div><span>{mode==='receive-customer'?'Customer':'Pay To'}</span><b>{summary.partyName}</b></div><div><span>{mode==='receive-customer'?'Total Bill':'Committed'}</span><b>{money(summary.bill)}</b></div><div><span>{mode==='receive-customer'?'Received':'Paid'}</span><b>{money(summary.paid)}</b></div><div className="balance"><span>Balance</span><strong>{money(summary.balance)}</strong></div>
    </div>
    {fullySettled?<div className="order-payment-settled"><CheckCircle2 size={18}/><div><b>No balance remaining</b><span>This order does not need another {summary.direction==='IN'?'customer receipt':'payment'} for this party.</span></div></div>:<FormSection title={summary.direction==='IN'?'Receive Money':'Make Payment'} description="The order is already selected. No search is required." icon={<Banknote size={18}/>} compact><div className="form-grid cols-2"><Field label="Amount" required><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></Field><Field label="Method"><select value={method} onChange={e=>setMethod(e.target.value)}>{METHODS.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Reference"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Bank ref / wallet ref / optional"/></Field><Field label="Note"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional payment note"/></Field></div><FormNote>The receipt/voucher and Order Timeline entry are created automatically.</FormNote></FormSection>}
    {error&&<div className="form-error">{error}</div>}
  </Modal>
}
