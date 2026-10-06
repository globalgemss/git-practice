import React,{useEffect,useState} from 'react'
import {LockKeyhole,ShieldCheck} from 'lucide-react'
import {useNavigate,useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'

export default function AgentLogin(){
 const {token}=useParams(),nav=useNavigate(),{agentLogin}=useAuth()
 const [identity,setIdentity]=useState({display_name:'Referral Portal',profile_type:'Referral Agent'}),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{supabase.functions.invoke('agent-login',{body:{action:'identify',token}}).then(({data})=>{if(data?.success&&data?.profile)setIdentity(data.profile)}).catch(()=>{})},[token])
 const submit=async e=>{e.preventDefault();if(pin.length!==4)return;setBusy(true);setError('');try{await agentLogin(token,pin);nav('/agent',{replace:true})}catch(e){setError(e.message||'Login failed')}finally{setBusy(false)}}
 const key=k=>{if(k==='⌫')setPin(x=>x.slice(0,-1));else if(k!=='✓')setPin(x=>(x+k).slice(0,4))}
 return <div className="auth-page agent-login-page v25-agent-login-page"><div className="auth-card agent-login-card v25-agent-login-card"><div className="portal-lock"><ShieldCheck size={26}/></div><div className="auth-brand"><div>🛺</div><h1>{identity.display_name}</h1><span>{identity.profile_type||'Referral Portal'} · RikshaMS</span></div><div className="portal-login-note"><LockKeyhole size={15}/><span>Private portal access. Enter your 4-digit PIN.</span></div><form onSubmit={submit}><label className="field modern-field pin-field"><span className="field-label">4-digit PIN</span><input className="pin-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength="4" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="••••"/></label><div className="pin-dots" aria-hidden="true">{[0,1,2,3].map(i=><i key={i} className={pin.length>i?'filled':''}/>)}</div><div className="pin-pad v25-pin-pad">{['1','2','3','4','5','6','7','8','9','⌫','0','✓'].map(k=><button type={k==='✓'?'submit':'button'} className={k==='✓'?'confirm':''} key={k} onClick={k==='✓'?undefined:()=>key(k)}>{k}</button>)}</div>{error&&<div className="form-error">{error}</div>}<button className="primary full portal-signin" disabled={busy||pin.length!==4}>{busy?'Signing in…':'Open My Portal'}</button></form><small className="portal-security-foot">Your portal only shows records assigned to this profile.</small></div></div>
}
