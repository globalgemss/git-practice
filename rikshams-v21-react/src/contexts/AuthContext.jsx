import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react'
import { supabase } from '../lib/supabase'

const C=createContext(null)

export function AuthProvider({children}){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [authReady,setAuthReady]=useState(false)
  const [profileLoading,setProfileLoading]=useState(false)
  const [authError,setAuthError]=useState('')

  const loadProfileByUserId=useCallback(async userId=>{
    if(!userId){setProfile(null);return null}
    const {data,error}=await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id',userId)
      .maybeSingle()
    if(error) throw error
    setProfile(data||null)
    return data||null
  },[])

  useEffect(()=>{
    let mounted=true
    supabase.auth.getSession().then(({data,error})=>{
      if(!mounted)return
      if(error)setAuthError(error.message)
      setSession(data?.session||null)
      setAuthReady(true)
    }).catch(e=>{
      if(!mounted)return
      setAuthError(e?.message||'Could not read login session.')
      setAuthReady(true)
    })

    const {data:sub}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      if(!mounted)return
      setSession(nextSession||null)
      setAuthReady(true)
    })

    return()=>{
      mounted=false
      sub?.subscription?.unsubscribe?.()
    }
  },[])

  useEffect(()=>{
    let cancelled=false
    if(!authReady)return
    if(!session?.user?.id){
      setProfile(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    setAuthError('')
    loadProfileByUserId(session.user.id)
      .catch(e=>{if(!cancelled){setProfile(null);setAuthError(e?.message||'Could not load user profile.')}})
      .finally(()=>{if(!cancelled)setProfileLoading(false)})
    return()=>{cancelled=true}
  },[authReady,session?.user?.id,loadProfileByUserId])

  const login=useCallback(async(email,password)=>{
    setAuthError('')
    const cleanEmail=String(email||'').trim().toLowerCase()
    const {data,error}=await supabase.auth.signInWithPassword({email:cleanEmail,password})
    if(error)throw error
    if(!data?.session?.user)throw new Error('Sign in succeeded but no session was returned.')

    setSession(data.session)
    const p=await loadProfileByUserId(data.session.user.id)
    if(!p){
      await supabase.auth.signOut()
      throw new Error('Login account exists, but no RikshaMS profile is linked to this user. Check profiles.auth_user_id in Supabase.')
    }
    if(p.active===false){
      await supabase.auth.signOut()
      throw new Error('This RikshaMS user account is inactive.')
    }
    return {session:data.session,profile:p}
  },[loadProfileByUserId])

  const logout=useCallback(async()=>{
    const {error}=await supabase.auth.signOut()
    if(error)throw error
    setSession(null)
    setProfile(null)
  },[])

  const agentLogin=useCallback(async(token,pin)=>{
    const {data,error}=await supabase.functions.invoke('agent-login',{body:{token,pin}})
    if(error)throw error
    if(!data?.success)throw new Error(data?.message||'Login failed')
    const {error:setError}=await supabase.auth.setSession({
      access_token:data.session.access_token,
      refresh_token:data.session.refresh_token
    })
    if(setError)throw setError
    return data
  },[])

  const refreshProfile=useCallback(async()=>{
    if(!session?.user?.id)return null
    return loadProfileByUserId(session.user.id)
  },[session?.user?.id,loadProfileByUserId])

  const loading=!authReady||profileLoading
  const value=useMemo(()=>({session,profile,loading,authError,login,logout,agentLogin,refreshProfile}),[session,profile,loading,authError,login,logout,agentLogin,refreshProfile])
  return <C.Provider value={value}>{children}</C.Provider>
}

export const useAuth=()=>useContext(C)
