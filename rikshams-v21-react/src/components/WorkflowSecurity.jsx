import React,{useState} from 'react'
import {setOrderOverridePin} from '../services/api'

export default function WorkflowSecurity(){
 const [code,setCode]=useState(''),[confirmCode,setConfirmCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const save=async()=>{
  const clean=String(code||'').trim()
  if(!/^\d{4,8}$/.test(clean))return setMessage('Override code must be 4 to 8 digits.')
  if(clean!==String(confirmCode||'').trim())return setMessage('Confirmation does not match.')
  setBusy(true);setMessage('')
  try{
   await setOrderOverridePin(clean)
   setCode('');setConfirmCode('')
   setMessage('Workflow override code updated securely.')
  }catch(e){
   setMessage(e.message||'Override code could not be updated.')
  }finally{setBusy(false)}
 }
 return <section className="panel">
  <div className="panel-head"><h3>Workflow Override Security</h3></div>
  <p className="muted">Only authorized management users can use this code to skip or reverse the normal order stage sequence. It is verified on the server and never stored in browser state.</p>
  <div className="form-grid cols-2">
   <label className="field"><span>New Override Code</span><input type="password" inputMode="numeric" maxLength="8" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} autoComplete="new-password"/></label>
   <label className="field"><span>Confirm Code</span><input type="password" inputMode="numeric" maxLength="8" value={confirmCode} onChange={e=>setConfirmCode(e.target.value.replace(/\D/g,'').slice(0,8))} autoComplete="new-password"/></label>
  </div>
  <button className="primary mt" disabled={busy} onClick={save}>{busy?'Updating…':'Set / Change Override Code'}</button>
  {message&&<div className="settings-message">{message}</div>}
 </section>
}
