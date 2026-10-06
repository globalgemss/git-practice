import React,{useEffect,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from '../contexts/AuthContext'

export default function Login(){
  const {login,session,profile,loading,authError}=useAuth()
  const nav=useNavigate()
  const loc=useLocation()
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    if(loading||!session||!profile)return
    if(profile.active===false)return
    if(String(profile.role||'').toLowerCase()==='agent') nav('/agent',{replace:true})
    else nav(loc.state?.from||'/',{replace:true})
  },[loading,session,profile,nav,loc.state])

  const submit=async e=>{
    e.preventDefault()
    if(busy)return
    setBusy(true)
    setError('')
    try{
      const result=await login(email,password)
      const p=result?.profile
      if(String(p?.role||'').toLowerCase()==='agent') nav('/agent',{replace:true})
      else nav(loc.state?.from||'/',{replace:true})
    }catch(e){
      setError(e?.message||'Sign in failed. Please check your email, password and Supabase connection.')
    }finally{
      setBusy(false)
    }
  }

  return <div className="auth-page"><div className="auth-card">
    <div className="auth-brand"><div>🛺</div><h1>RikshaMS</h1><span>Transport Management</span></div>
    <form onSubmit={submit}>
      <label className="field"><span>Email</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
      <label className="field"><span>Password</span><input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
      {(error||authError)&&<div className="form-error">{error||authError}</div>}
      <button type="submit" className="primary full" disabled={busy||loading}>{busy?'Signing in…':'Sign In'}</button>
    </form>
    <small className="auth-note">Secure login powered by Supabase Auth</small>
  </div></div>
}
