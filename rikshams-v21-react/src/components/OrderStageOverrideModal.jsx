import React,{useMemo,useState} from 'react'
import Modal from './Modal'
import {transitionOrderWithPin} from '../services/api'

const stages=['New','Assigned','Dispatched','In Transit','Delivered','Completed','Cancelled']

export default function OrderStageOverrideModal({order,onClose,onSaved}){
 const options=useMemo(()=>stages.filter(s=>s!==order.status),[order.status])
 const [target,setTarget]=useState(options[0]||'Cancelled')
 const [reason,setReason]=useState('')
 const [code,setCode]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')

 const save=async()=>{
  if(!target)return setError('Choose a target stage.')
  if(!reason.trim())return setError('Reason is required.')
  if(!/^\d{4,8}$/.test(code))return setError('Enter the authorized override code.')
  if(busy)return
  setBusy(true);setError('')
  try{
   await transitionOrderWithPin(order.id,target,reason.trim(),code)
   onSaved?.()
   onClose()
  }catch(e){
   setError(e.message||'Stage override failed.')
  }finally{setBusy(false)}
 }

 return <Modal open title="Order Stage Override" onClose={onClose} footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Processing…':'Confirm Override'}</button></>}>
  <div className="status-override-warning">
   <b>This action skips or reverses the normal workflow.</b>
   <span>Only authorized management should use it. The reason is recorded in the Order Timeline.</span>
  </div>
  <div className="form-grid cols-2 mt">
   <label className="field"><span>Current Stage</span><input value={order.status} readOnly/></label>
   <label className="field"><span>Target Stage</span><select value={target} onChange={e=>setTarget(e.target.value)}>{options.map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="field span-2"><span>Reason *</span><textarea rows="3" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this workflow stage being changed?"/></label>
   <label className="field span-2"><span>Authorized Override Code *</span><input type="password" inputMode="numeric" maxLength="8" autoComplete="off" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))}/></label>
  </div>
  {error&&<div className="form-error">{error}</div>}
 </Modal>
}
