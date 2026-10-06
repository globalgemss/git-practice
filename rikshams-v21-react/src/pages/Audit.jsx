import React,{useMemo,useState} from 'react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {formatDateTime} from '../utils/format'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import {DateStack,IdentityCell,RowActions} from '../components/TableKit'

export default function Audit(){
 const {rows}=useRealtimeTable('audit_logs',{order:'created_at'}),[search,setSearch]=useState(''),[module,setModule]=useState('All'),[sort,setSort]=useState('newest'),[view,setView]=useState('table'),[selected,setSelected]=useState(null)
 const modules=['All',...Array.from(new Set(rows.map(r=>r.module).filter(Boolean)))]
 const filtered=useMemo(()=>{const q=search.toLowerCase();const list=rows.filter(r=>(module==='All'||r.module===module)&&(!q||[r.action,r.module,r.record_id,r.detail].join(' ').toLowerCase().includes(q)));return [...list].sort((a,b)=>sort==='oldest'?String(a.created_at||'').localeCompare(String(b.created_at||'')):sort==='module'?String(a.module||'').localeCompare(String(b.module||'')):String(b.created_at||'').localeCompare(String(a.created_at||'')))},[rows,search,module,sort])
 const cols=[
  {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
  {key:'created_at',label:'Time',render:r=><DateStack date={new Date(r.created_at).toLocaleDateString()} time={new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}/>},
  {key:'module',label:'Module',render:r=><span className="pro-soft-chip">{r.module||'System'}</span>},
  {key:'action',label:'Action',render:r=><IdentityCell title={r.action||'Change'} subtitle={r.record_id||'No record ID'} meta={r.module||'System'}/>},
  {key:'detail',label:'Detail',render:r=><span className="pro-note-cell">{r.detail||'No detail'}</span>},
  {key:'view',label:'Change',className:'pro-action-col',align:'right',render:r=><RowActions onView={()=>setSelected(r)} viewLabel="Inspect"/>}
 ]
 return <>
  <PageTitle title="Audit History" subtitle="Database-level record of important system changes"/>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search action, module, record…" onReset={()=>{setSearch('');setModule('All');setSort('newest')}} className="pro-module-toolbar"><select value={module} onChange={e=>setModule(e.target.value)}>{modules.map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="module">Module A–Z</option></select></SearchFilterBar>
  {view==='table'?<section className="panel pro-table-panel"><DataTable rows={filtered} columns={cols}/></section>:<div className="pro-card-grid">{filtered.map(r=><article className="pro-record-card" key={r.id} onClick={()=>setSelected(r)}><header><IdentityCell title={r.action||'Change'} subtitle={r.record_id||'No record ID'} meta={r.module||'System'}/><span className="pro-soft-chip">{r.module||'System'}</span></header><div className="pro-record-kvs"><div><small>Time</small><b>{formatDateTime(r.created_at)}</b></div><div><small>Detail</small><b>{r.detail||'No detail'}</b></div></div><footer onClick={e=>e.stopPropagation()}><RowActions onView={()=>setSelected(r)} viewLabel="Inspect"/></footer></article>)}</div>}
  {selected&&<Modal open title={`${selected.action} · ${selected.module}`} subtitle={`Record ${selected.record_id||'—'} · ${formatDateTime(selected.created_at)}`} onClose={()=>setSelected(null)} size="lg" footer={<button className="outline" onClick={()=>setSelected(null)}>Close</button>}><div className="audit-diff"><section><h4>Old Value</h4><pre>{JSON.stringify(selected.old_value,null,2)}</pre></section><section><h4>New Value</h4><pre>{JSON.stringify(selected.new_value,null,2)}</pre></section></div></Modal>}
 </>
}
