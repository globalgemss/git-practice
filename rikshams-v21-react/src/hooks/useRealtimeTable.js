import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {supabase} from '../lib/supabase'

function compareValues(a,b){
 if(a===b)return 0
 if(a==null)return 1
 if(b==null)return -1
 if(typeof a==='number'&&typeof b==='number')return a-b
 return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'})
}

function rowMatches(row,filters){
 return filters.every(([column,op,value])=>{
  const actual=row?.[column]
  if(op==='eq')return actual===value
  if(op==='neq')return actual!==value
  if(op==='is')return value===null?actual==null:actual===value
  if(op==='in')return Array.isArray(value)&&value.includes(actual)
  return true
 })
}

export function useRealtimeTable(table,{
 select='*',
 order='created_at',
 ascending=false,
 filters=[],
 enabled=true,
 primaryKey='id',
 limit=null
}={}){
 const [rows,setRows]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState(null)
 const mounted=useRef(true)
 const filterKey=useMemo(()=>JSON.stringify(filters),[filters])

 const sortRows=useCallback(list=>{
  if(!order)return list
  const next=[...list].sort((a,b)=>compareValues(a?.[order],b?.[order]))
  if(!ascending)next.reverse()
  return next
 },[order,ascending])

 const load=useCallback(async({silent=false}={})=>{
  if(!enabled)return
  if(!silent)setLoading(true)
  let q=supabase.from(table).select(select)
  for(const f of filters){
   if(f[1]==='eq')q=q.eq(f[0],f[2])
   else if(f[1]==='neq')q=q.neq(f[0],f[2])
   else if(f[1]==='is')q=q.is(f[0],f[2])
   else if(f[1]==='in')q=q.in(f[0],f[2])
  }
  if(order)q=q.order(order,{ascending})
  if(Number.isFinite(limit)&&limit>0)q=q.limit(limit)
  const {data,error:queryError}=await q
  if(!mounted.current)return
  if(queryError)setError(queryError)
  else{
   setRows(data||[])
   setError(null)
  }
  if(!silent)setLoading(false)
 },[table,select,order,ascending,enabled,filterKey,limit])

 useEffect(()=>{
  mounted.current=true
  load()
  if(!enabled)return()=>{mounted.current=false}

  const channel=supabase
   .channel(`rt:${table}:${filterKey}:${Math.random().toString(36).slice(2)}`)
   .on('postgres_changes',{event:'*',schema:'public',table},payload=>{
    const event=payload.eventType
    const nextRow=payload.new||{}
    const oldRow=payload.old||{}
    const key=nextRow?.[primaryKey]??oldRow?.[primaryKey]

    if(key==null){
     load({silent:true})
     return
    }

    setRows(current=>{
     let next=current

     if(event==='DELETE'){
      next=current.filter(row=>row?.[primaryKey]!==key)
     }else{
      const matches=rowMatches(nextRow,filters)
      const index=current.findIndex(row=>row?.[primaryKey]===key)
      if(matches){
       next=index>=0
        ?current.map((row,i)=>i===index?{...row,...nextRow}:row)
        :[...current,nextRow]
      }else if(index>=0){
       next=current.filter((_,i)=>i!==index)
      }
     }

     next=sortRows(next)
     if(Number.isFinite(limit)&&limit>0&&next.length>limit)next=next.slice(0,limit)
     return next
    })
   })
   .subscribe(status=>{
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
     setError(new Error(`Realtime connection problem for ${table}`))
    }
   })

  return()=>{
   mounted.current=false
   supabase.removeChannel(channel)
  }
 },[load,table,enabled,primaryKey,filterKey,sortRows,limit])

 return {rows,setRows,loading,error,reload:load}
}
