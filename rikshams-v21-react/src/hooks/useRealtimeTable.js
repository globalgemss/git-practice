import {useCallback,useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'

export function useRealtimeTable(table,{select='*',order='created_at',ascending=false,filters=[],enabled=true}={}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(null)
 const filterKey=JSON.stringify(filters)
 const load=useCallback(async(options={})=>{
  if(!enabled)return []
  if(!options?.silent)setLoading(true)
  try{
   let q=supabase.from(table).select(select)
   for(const f of filters){
    const [column,op,value]=f
    if(op==='eq')q=q.eq(column,value)
    else if(op==='neq')q=q.neq(column,value)
    else if(op==='is')q=q.is(column,value)
    else if(op==='in')q=q.in(column,value)
    else if(op==='gt')q=q.gt(column,value)
    else if(op==='gte')q=q.gte(column,value)
    else if(op==='lt')q=q.lt(column,value)
    else if(op==='lte')q=q.lte(column,value)
    else if(op==='like')q=q.like(column,value)
    else if(op==='ilike')q=q.ilike(column,value)
    else if(op==='contains')q=q.contains(column,value)
    else if(op==='overlaps')q=q.overlaps(column,value)
   }
   if(order)q=q.order(order,{ascending})
   const {data,error}=await q
   if(error)throw error
   setRows(data||[]);setError(null)
   return data||[]
  }catch(e){setError(e);return []}
  finally{if(!options?.silent)setLoading(false)}
 },[table,select,order,ascending,enabled,filterKey])
 useEffect(()=>{load();if(!enabled)return;const ch=supabase.channel(`rt:${table}:${Math.random()}`).on('postgres_changes',{event:'*',schema:'public',table},()=>load({silent:true})).subscribe();return()=>supabase.removeChannel(ch)},[load,table,enabled])
 return {rows,setRows,loading,error,reload:load}
}
