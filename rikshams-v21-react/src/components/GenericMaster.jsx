import React,{useEffect,useMemo,useState} from 'react'
import {CheckCircle2,Clock3,ListFilter,Plus,Users} from 'lucide-react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {archiveRow,insertRow,updateRow} from '../services/api'
import {money,num} from '../utils/format'
import SearchFilterBar from './SearchFilterBar'
import DataTable from './DataTable'
import StatusBadge from './StatusBadge'
import Modal from './Modal'
import {Field,FormSection} from './FormKit'
import {AreaCell,archiveAction,CountBadge,editAction,IdentityCell,MoneyCell,PhoneCell,RowActions,SummaryCard,SummaryGrid} from './TableKit'

const prefixes={customers:'CUS',drivers:'DRV',labourers:'LAB',vehicle_owners:'OWN',partners:'PAR',referral_partners:'REF'}
function idFor(table){return `${prefixes[table]||'REC'}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`}
function inferGroup(f){const k=String(f.key||'').toLowerCase();if(/note|status|rating|discipline|reliability|honesty/.test(k))return 'Status & Notes';if(/rate|payment|commission|amount|balance|earned|paid/.test(k))return 'Financial Details';if(/name|mobile|phone|address|area|business|license|citizenship|email/.test(k))return 'Identity & Contact';if(/vehicle|owner|partner|skill|type|capacity/.test(k))return 'Operational Details';return 'Additional Information'}

export default function GenericMaster({table,title='Records',subtitle='',order='created_at',fields=[],columns=[],defaultValues={},onProfile,rowActions,onAdd}){
 const {rows,reload,loading,error:loadError}=useRealtimeTable(table,{filters:[['archived','eq',false]],order,ascending:true})
 const [search,setSearch]=useState(''),[status,setStatus]=useState('All'),[sort,setSort]=useState(order),[view,setView]=useState('table'),[edit,setEdit]=useState(null)
 const statusOptions=useMemo(()=>['All',...Array.from(new Set(rows.map(r=>r.status).filter(Boolean)))],[rows])
 const filtered=useMemo(()=>{const q=search.toLowerCase();const out=rows.filter(r=>(status==='All'||r.status===status)&&(!q||Object.values(r).some(v=>typeof v!=='object'&&String(v??'').toLowerCase().includes(q))));return [...out].sort((a,b)=>{if(sort==='newest')return String(b.created_at||'').localeCompare(String(a.created_at||''));if(sort==='oldest')return String(a.created_at||'').localeCompare(String(b.created_at||''));return String(a[sort]??'').localeCompare(String(b[sort]??''),undefined,{numeric:true,sensitivity:'base'})})},[rows,search,status,sort])
 const healthy=rows.filter(r=>['Active','Available'].includes(r.status)).length
 const operational=rows.filter(r=>['Reserved','Busy','On Job'].includes(r.status)).length
 const inactive=rows.filter(r=>['Inactive','Leave','Off Duty','Offline'].includes(r.status)).length
 const extraActions=r=>typeof rowActions==='function'?rowActions(r,{edit:()=>setEdit(r),reload}):rowActions
 const renderColumn=(c,r)=>{
   if(c.render)return c.render(r)
   if(c.status)return <StatusBadge status={r[c.key]}/>
   if(c.money)return <MoneyCell value={r[c.key]} tone={num(r[c.key])>0&&/payable|outstanding|balance/i.test(c.key)?'warning':'neutral'}/>
   if(/^(mobile|phone|alternate_phone)$/.test(c.key))return <PhoneCell value={r[c.key]}/>
   if(c.key==='area')return <AreaCell value={r[c.key]}/>
   if(/jobs|orders|trips|leads|converted/.test(c.key))return <CountBadge value={r[c.key]}/>
   if(c.key==='rating'&&r[c.key]!=null)return <span className="pro-rating">★ {Number(r[c.key]).toFixed(1)}</span>
   return r[c.key]??'—'
 }
 const firstKey=columns[0]?.key
 const cols=[
   {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
   ...columns.map((c,i)=>i===0?{...c,render:r=><IdentityCell title={r[c.key]||r.name||r.number||r.id} subtitle={r.mobile||r.type||r.skill||r.id} meta={r.area||null}/>}:{...c,render:r=>renderColumn(c,r)}),
   {key:'action',label:'Action',className:'pro-action-col',align:'right',render:r=><div className="pro-action-combo">{extraActions(r)}<RowActions onView={onProfile?()=>onProfile(r):null} viewLabel={onProfile?'View':'Actions'} actions={[editAction(()=>setEdit(r)),archiveAction(async()=>{if(confirm(`Archive ${r.name||r.id}?`)){await archiveRow(table,r.id);reload({silent:true})}})]}/></div>}
 ]
 const add=()=>onAdd?onAdd():setEdit({...defaultValues})
 return <div className="master-workspace pro-master-workspace">
  <div className="subpage-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="primary" onClick={add}><Plus size={17}/> Add {title.replace(/s$/,'')}</button></div>
  <SummaryGrid className="compact"><SummaryCard icon={<Users size={17}/>} label={`Total ${title}`} value={rows.length} note="Current master records"/><SummaryCard icon={<CheckCircle2 size={17}/>} label="Active / Available" value={healthy} note="Ready or active" tone="success"/><SummaryCard icon={<Clock3 size={17}/>} label="Busy / Reserved" value={operational} note={inactive?`${inactive} unavailable / inactive`:'Currently allocated'} tone={operational?'warning':''}/><SummaryCard icon={<ListFilter size={17}/>} label="Visible Results" value={filtered.length} note={search||status!=='All'?'Filtered result':'All current records'}/></SummaryGrid>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder={`Search ${title.toLowerCase()}…`} onReset={()=>{setSearch('');setStatus('All');setSort(order)}} className="pro-module-toolbar">
   <select value={status} onChange={e=>setStatus(e.target.value)}>{statusOptions.map(x=><option key={x}>{x}</option>)}</select>
   <select value={sort} onChange={e=>setSort(e.target.value)}><option value={order}>Sort: Default</option><option value="newest">Newest</option><option value="oldest">Oldest</option>{fields.slice(0,4).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select>
  </SearchFilterBar>
  {loadError&&<div className="form-error">{loadError.message}</div>}
  {loading&&!rows.length?<section className="panel pro-loading-panel">Loading…</section>:view==='table'?<section className="panel pro-table-panel"><DataTable rows={filtered} columns={cols} onRow={onProfile}/></section>:<div className="pro-card-grid">{filtered.map(r=><article className="pro-record-card" key={r.id} onClick={()=>onProfile?.(r)}><header><IdentityCell title={r[firstKey]||r.name||r.number||r.id} subtitle={r.mobile||r.type||r.skill||r.id}/>{r.status&&<StatusBadge status={r.status}/>}</header><div className="pro-record-kvs">{columns.slice(1,6).map(c=><div key={c.key}><small>{c.label}</small><b>{c.money?money(r[c.key]):c.status?<StatusBadge status={r[c.key]}/>:r[c.key]??'—'}</b></div>)}</div><footer onClick={e=>e.stopPropagation()}>{extraActions(r)}<RowActions onView={onProfile?()=>onProfile(r):null} actions={[editAction(()=>setEdit(r)),archiveAction(async()=>{if(confirm(`Archive ${r.name||r.id}?`)){await archiveRow(table,r.id);reload({silent:true})}})]}/></footer></article>)}</div>}
  {edit&&<MasterModal table={table} item={edit} fields={fields} defaultValues={defaultValues} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);reload({silent:true})}}/>}
 </div>
}

function MasterModal({table,item,fields,defaultValues,onClose,onSaved}){
 const isEdit=!!item.id,[f,setF]=useState({...defaultValues,...item}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>setF({...defaultValues,...item}),[item])
 const label=table.replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())
 const save=async()=>{setBusy(true);setError('');try{const row={};fields.forEach(x=>{let v=f[x.key];if(x.type==='number')v=Number(v||0);row[x.key]=v===''?null:v});if(isEdit)await updateRow(table,item.id,row);else await insertRow(table,{id:idFor(table),...defaultValues,...row,archived:false});onSaved()}catch(e){setError(e.message||'Could not save record.')}finally{setBusy(false)}}
 const renderField=(x,i)=>{const value=f[x.key]??'',setValue=e=>setF(s=>({...s,[x.key]:e.target.value}));if(x.type==='textarea')return <textarea rows="3" value={value} onChange={setValue} placeholder={x.placeholder||''}/>;if(x.type==='select')return <select value={value} onChange={setValue}><option value="">Select {x.label}</option>{(x.options||[]).map(o=><option key={o}>{o}</option>)}</select>;const inferred=x.type==='number'?'number':/mobile|phone/i.test(x.key)?'tel':x.type||'text';return <input autoFocus={i===0} type={inferred} inputMode={inferred==='tel'?'tel':inferred==='number'?'decimal':undefined} value={value} onChange={setValue} placeholder={x.placeholder||''}/>}
 const groups=useMemo(()=>{const m=new Map();fields.forEach(fld=>{const g=fld.group||inferGroup(fld);if(!m.has(g))m.set(g,[]);m.get(g).push(fld)});return [...m.entries()]},[fields])
 return <Modal open title={isEdit?`Edit ${item.name||item.number||'Record'}`:`Add ${label}`} subtitle="Complete the information below. Changes sync across profiles, dispatch and accounting." onClose={onClose} size="lg" density="compact" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy?'Saving…':'Save Record'}</button></>}>
   <div className="v25-form-stack">{groups.map(([group,items],gi)=><FormSection key={group} title={group} compact description={gi===0?'Identity and core information':'Additional information for operations and reporting.'}><div className="form-grid cols-2">{items.map((x,i)=><Field key={x.key} label={x.label} required={x.required} hint={x.hint} full={x.full}>{renderField(x,i)}</Field>)}</div></FormSection>)}</div>
   {error&&<div className="form-error">{error}</div>}
  </Modal>
}
