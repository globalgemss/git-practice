import { useCallback,useEffect,useState } from 'react'
import { supabase } from '../lib/supabase'
export function useRealtimeTable(table,{select='*',order='created_at',ascending=false,filters=[],enabled=true}={}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(null)
 const load=useCallback(async()=>{if(!enabled)return;setLoading(true);let q=supabase.from(table).select(select);for(const f of filters){if(f[1]==='eq')q=q.eq(f[0],f[2]);if(f[1]==='neq')q=q.neq(f[0],f[2]);if(f[1]==='is')q=q.is(f[0],f[2])}if(order)q=q.order(order,{ascending});const {data,error}=await q;if(error)setError(error);else{setRows(data||[]);setError(null)}setLoading(false)},[table,select,order,ascending,enabled,JSON.stringify(filters)])
 useEffect(()=>{load();if(!enabled)return;const ch=supabase.channel(`rt:${table}:${Math.random()}`).on('postgres_changes',{event:'*',schema:'public',table},()=>load()).subscribe();return()=>supabase.removeChannel(ch)},[load,table,enabled])
 return {rows,setRows,loading,error,reload:load}
}