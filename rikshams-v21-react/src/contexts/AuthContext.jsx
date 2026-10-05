import React,{createContext,useContext,useEffect,useMemo,useState} from 'react'
import { supabase } from '../lib/supabase'
const C=createContext(null)
export function AuthProvider({children}){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true)
 const loadProfile=async s=>{if(!s?.user){setProfile(null);return null}const {data,error}=await supabase.from('profiles').select('*').eq('auth_user_id',s.user.id).maybeSingle();if(error)console.error(error);setProfile(data||null);return data}
 useEffect(()=>{let mounted=true;supabase.auth.getSession().then(async({data})=>{if(!mounted)return;setSession(data.session);await loadProfile(data.session);if(mounted)setLoading(false)});const {data:sub}=supabase.auth.onAuthStateChange(async(_e,s)=>{setSession(s);await loadProfile(s);setLoading(false)});return()=>{mounted=false;sub.subscription.unsubscribe()}},[])
 const value=useMemo(()=>({session,profile,loading,async login(email,password){const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data},async logout(){await supabase.auth.signOut()},async agentLogin(token,pin){const {data,error}=await supabase.functions.invoke('agent-login',{body:{token,pin}});if(error)throw error;if(!data?.success)throw new Error(data?.message||'Login failed');await supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});return data},refreshProfile:()=>loadProfile(session)}),[session,profile,loading])
 return <C.Provider value={value}>{children}</C.Provider>
}
export const useAuth=()=>useContext(C)