import React,{useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Building2,CheckCircle2,Clock3,FileText,Gauge,ListFilter,MapPin,Phone,Plus,Truck,UserRound,Wrench} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {archiveRow,insertRow,updateRow} from '../services/api'
import SearchFilterBar from '../components/SearchFilterBar'
import SearchPicker from '../components/SearchPicker'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import {Field,FormNote,FormSection} from '../components/FormKit'
import {AreaCell,archiveAction,CountBadge,editAction,IdentityCell,PhoneCell,RowActions,SummaryCard,SummaryGrid} from '../components/TableKit'

export default function VehicleMaster(){
 const nav=useNavigate()
 const {rows,reload}=useRealtimeTable('vehicles',{filters:[['archived','eq',false]],order:'number'})
 const {rows:types,reload:reloadTypes}=useRealtimeTable('vehicle_types',{filters:[['archived','eq',false]],order:'sort_order'})
 const {rows:partners,reload:reloadPartners}=useRealtimeTable('partners',{filters:[['archived','eq',false]],order:'name'})
 const {rows:owners,reload:reloadOwners}=useRealtimeTable('vehicle_owners',{filters:[['archived','eq',false]],order:'name'})
 const {rows:drivers,reload:reloadDrivers}=useRealtimeTable('drivers',{filters:[['archived','eq',false]],order:'name'})
 const [search,setSearch]=useState(''),[status,setStatus]=useState('All'),[type,setType]=useState('All'),[sort,setSort]=useState('number'),[view,setView]=useState('table'),[edit,setEdit]=useState(null)
 const lookup=(list,id)=>list.find(x=>String(x.id)===String(id))
 const shown=useMemo(()=>{const q=search.toLowerCase();const a=rows.filter(v=>(status==='All'||v.status===status)&&(type==='All'||v.vehicle_type_id===type)&&(!q||[v.number,v.type,v.area,lookup(partners,v.partner_id)?.name,lookup(owners,v.owner_id)?.name,lookup(drivers,v.default_driver_id)?.name].join(' ').toLowerCase().includes(q)));a.sort((a,b)=>sort==='newest'?String(b.created_at||'').localeCompare(String(a.created_at||'')):sort==='area'?String(a.area||'').localeCompare(String(b.area||'')):String(a.number||'').localeCompare(String(b.number||'')));return a},[rows,search,status,type,sort,partners,owners,drivers])
 const cols=[
  {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
  {key:'number',label:'Vehicle',render:r=><IdentityCell title={r.number} subtitle={r.type||lookup(types,r.vehicle_type_id)?.name||'Vehicle'} meta={r.id}/>} ,
  {key:'driver',label:'Regular Driver',render:r=>{const d=lookup(drivers,r.default_driver_id);return d?<IdentityCell title={d.name} subtitle={d.mobile||'No mobile'} icon={<UserRound size={15}/>}/>:<span className="pro-warning-text">Not assigned</span>}},
  {key:'owner',label:'Owner / Partner',render:r=><span className="pro-stack-cell"><b>{lookup(owners,r.owner_id)?.name||lookup(partners,r.partner_id)?.name||r.owner||'Company'}</b><small>{r.ownership_type||'Company'}</small></span>},
  {key:'area',label:'Area',render:r=><AreaCell value={r.area}/>},
  {key:'capacity',label:'Capacity',render:r=><span className="pro-soft-chip">{r.capacity||'—'}</span>},
  {key:'trips',label:'Trips',align:'center',render:r=><CountBadge value={r.trips||0}/>},
  {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
  {key:'action',label:'Action',className:'pro-action-col',align:'right',render:r=><RowActions onView={()=>nav(`/profiles/vehicle/${r.id}`)} actions={[editAction(()=>setEdit(r)),archiveAction(async()=>{if(confirm('Archive this vehicle?')){await archiveRow('vehicles',r.id);reload({silent:true})}})]}/>}]
 const available=rows.filter(v=>v.status==='Available').length,reservedBusy=rows.filter(v=>['Reserved','Busy'].includes(v.status)).length,maintenance=rows.filter(v=>v.status==='Maintenance').length
 return <>
  <div className="subpage-head"><div><h2>Vehicles</h2><p>Vehicle master, ownership, regular driver and operational availability</p></div><button className="primary" onClick={()=>setEdit({})}><Plus size={17}/> Add Vehicle</button></div>
  <SummaryGrid className="compact"><SummaryCard icon={<Truck size={17}/>} label="Total Vehicles" value={rows.length} note="Current fleet master"/><SummaryCard icon={<CheckCircle2 size={17}/>} label="Available" value={available} note="Ready for assignment" tone="success"/><SummaryCard icon={<Clock3 size={17}/>} label="Reserved / Busy" value={reservedBusy} note="Allocated to active work" tone={reservedBusy?'warning':''}/><SummaryCard icon={<Wrench size={17}/>} label="Maintenance" value={maintenance} note={`${shown.length} visible results`} tone={maintenance?'danger':''}/></SummaryGrid>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search vehicle, driver, partner, area…" onReset={()=>{setSearch('');setStatus('All');setType('All');setSort('number')}} className="pro-module-toolbar"><select value={type} onChange={e=>setType(e.target.value)}><option value="All">All Vehicle Types</option>{types.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}>{['All','Available','Reserved','Busy','Maintenance','Inactive'].map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="number">Vehicle Number</option><option value="area">Area</option><option value="newest">Newest</option></select></SearchFilterBar>
  {view==='table'?<section className="panel pro-table-panel"><DataTable rows={shown} onRow={r=>nav(`/profiles/vehicle/${r.id}`)} columns={cols}/></section>:<div className="pro-card-grid">{shown.map(v=><article className="pro-record-card" key={v.id} onClick={()=>nav(`/profiles/vehicle/${v.id}`)}><header><IdentityCell title={v.number} subtitle={v.type||lookup(types,v.vehicle_type_id)?.name||'Vehicle'} meta={v.id}/><StatusBadge status={v.status}/></header><div className="pro-record-kvs"><div><small>Regular Driver</small><b>{lookup(drivers,v.default_driver_id)?.name||'Not assigned'}</b></div><div><small>Partner / Owner</small><b>{lookup(owners,v.owner_id)?.name||lookup(partners,v.partner_id)?.name||'Company'}</b></div><div><small>Area</small><b>{v.area||'—'}</b></div><div><small>Capacity</small><b>{v.capacity||'—'}</b></div></div><footer onClick={e=>e.stopPropagation()}><RowActions onView={()=>nav(`/profiles/vehicle/${v.id}`)} actions={[editAction(()=>setEdit(v)),archiveAction(async()=>{if(confirm('Archive this vehicle?')){await archiveRow('vehicles',v.id);reload({silent:true})}})]}/></footer></article>)}</div>}
  {edit&&<VehicleModal item={edit} types={types} partners={partners} owners={owners} drivers={drivers} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);reload();reloadTypes();reloadPartners();reloadOwners();reloadDrivers()}}/>}
 </>
}

function VehicleModal({item,types,partners,owners,drivers,onClose,onSaved}){
 const [f,setF]=useState({number:'',vehicle_type_id:'',type:'',capacity:'',area:'',ownership_type:'Company',partner_id:'',owner_id:'',default_driver_id:'',mobile:'',status:'Available',service_due_date:'',service_notes:'',notes:'',...item})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[quick,setQuick]=useState(null),[localTypes,setLocalTypes]=useState(types),[localPartners,setLocalPartners]=useState(partners),[localOwners,setLocalOwners]=useState(owners),[localDrivers,setLocalDrivers]=useState(drivers)
 const typeOptions=localTypes.filter(x=>x.active!==false).map(x=>({value:x.id,label:`${x.icon||'🚚'} ${x.name}`,sub:[x.code,x.capacity].filter(Boolean).join(' · '),row:x}))
 const partnerOptions=localPartners.filter(x=>x.status!=='Inactive').map(x=>({value:x.id,label:x.name,sub:[x.mobile,x.area].filter(Boolean).join(' · ')}))
 const ownerOptions=localOwners.filter(x=>x.status!=='Inactive').map(x=>({value:x.id,label:x.name,sub:[x.mobile,x.address].filter(Boolean).join(' · ')}))
 const driverOptions=localDrivers.filter(x=>x.status!=='Inactive').map(x=>({value:x.id,label:x.name,sub:[x.mobile,x.status,x.license_no].filter(Boolean).join(' · ')}))
 const manualStatuses=['Available','Maintenance','Inactive']
 const statusOptions=manualStatuses.includes(f.status)?manualStatuses:[f.status,...manualStatuses]
 const save=async()=>{
   if(!f.number.trim()||!f.vehicle_type_id)return setError('Vehicle Number and Vehicle Type are required.')
   if(!f.default_driver_id)return setError('Assign a regular/default driver. Dispatch uses the driver linked here.')
   setBusy(true);setError('')
   try{
     // Preserve legacy/demo data that may already share a driver, but prevent creating a new duplicate regular-driver relationship.
     if(!item.id||item.default_driver_id!==f.default_driver_id){
       let conflictQuery=supabase.from('vehicles').select('id,number').eq('default_driver_id',f.default_driver_id).eq('archived',false)
       if(item.id)conflictQuery=conflictQuery.neq('id',item.id)
       const {data:conflict,error:conflictError}=await conflictQuery.limit(1)
       if(conflictError)throw conflictError
       if(conflict?.length)throw new Error(`This driver is already the regular driver of ${conflict[0].number}. Change that vehicle first.`)
     }

     const t=localTypes.find(x=>x.id===f.vehicle_type_id),d=localDrivers.find(x=>x.id===f.default_driver_id),owner=localOwners.find(x=>x.id===f.owner_id),partner=localPartners.find(x=>x.id===f.partner_id)
     const row={
       number:f.number.trim().toUpperCase(),vehicle_type_id:f.vehicle_type_id,type:t?.name||f.type,capacity:f.capacity||t?.capacity||null,area:f.area||null,
       ownership_type:f.ownership_type,
       partner_id:f.ownership_type==='Partner'?(f.partner_id||null):null,
       owner_id:f.ownership_type==='Owner'?(f.owner_id||null):null,
       owner:f.ownership_type==='Partner'?(partner?.name||null):f.ownership_type==='Owner'?(owner?.name||null):'Company',
       default_driver_id:f.default_driver_id,driver:d?.name||null,mobile:f.mobile||null,status:f.status||'Available',
       service_due_date:f.service_due_date||null,service_notes:f.service_notes||null,notes:f.notes||null
     }
     const saved=item.id?await updateRow('vehicles',item.id,row):await insertRow('vehicles',row)
     if(item.default_driver_id&&item.default_driver_id!==f.default_driver_id){
       const old=localDrivers.find(x=>x.id===item.default_driver_id)
       if(old?.vehicle_id===saved.id)await updateRow('drivers',old.id,{vehicle_id:null})
     }
     if(!item.id||item.default_driver_id!==f.default_driver_id)await updateRow('drivers',f.default_driver_id,{vehicle_id:saved.id})
     onSaved()
   }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <>
  <Modal open title={item.id?`Edit Vehicle · ${item.number}`:'Add Vehicle'} subtitle="Register the vehicle, define ownership and link its regular driver. Dispatch will use this driver automatically." eyebrow="Fleet & Crew" onClose={onClose} size="lg" className="vehicle-editor-modal" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy?'Saving Vehicle…':'Save Vehicle'}</button></>}>
   <div className="v25-form-stack vehicle-form-pro">
    <FormSection title="Vehicle Identity" description="Core details used in orders, dispatch and profiles." icon={<Truck size={18}/>}><div className="form-grid cols-2"><Field label="Vehicle Number" required hint="Example: BA 2 KHA 1234"><input value={f.number} onChange={e=>setF(x=>({...x,number:e.target.value.toUpperCase()}))} placeholder="Vehicle registration number"/></Field><Field label="Vehicle Type" required action={<button type="button" className="field-add-link" onClick={()=>setQuick('type')}><Plus size={14}/> Add Type</button>}><SearchPicker title="Vehicle Type" value={f.vehicle_type_id} onChange={(v,o)=>setF(x=>({...x,vehicle_type_id:v,type:o?.row?.name||'',capacity:x.capacity||o?.row?.capacity||''}))} options={typeOptions} placeholder="Select vehicle type…" searchKeys={['label','sub']} onAdd={()=>setQuick('type')} addLabel="Add Vehicle Type"/></Field><Field label="Capacity"><div className="input-with-icon"><Gauge size={16}/><input value={f.capacity||''} onChange={e=>setF(x=>({...x,capacity:e.target.value}))} placeholder="Capacity"/></div></Field><Field label="Operating Area"><div className="input-with-icon"><MapPin size={16}/><input value={f.area||''} onChange={e=>setF(x=>({...x,area:e.target.value}))} placeholder="Area / route base"/></div></Field></div></FormSection>

    <FormSection title="Ownership & Regular Driver" description="The regular driver is maintained here, not during normal dispatch." icon={<UserRound size={18}/>}><div className="form-grid cols-2"><Field label="Ownership Type"><select value={f.ownership_type||'Company'} onChange={e=>setF(x=>({...x,ownership_type:e.target.value,partner_id:'',owner_id:''}))}>{['Company','Partner','Owner'].map(x=><option key={x}>{x}</option>)}</select></Field>{f.ownership_type==='Partner'?<Field label="Transport Partner" required action={<button type="button" className="field-add-link" onClick={()=>setQuick('partner')}><Plus size={14}/> Add Partner</button>}><SearchPicker title="Transport Partner" value={f.partner_id||''} onChange={v=>setF(x=>({...x,partner_id:v}))} options={partnerOptions} placeholder="Select partner…" onAdd={()=>setQuick('partner')} addLabel="Add Transport Partner"/></Field>:f.ownership_type==='Owner'?<Field label="Vehicle Owner" required action={<button type="button" className="field-add-link" onClick={()=>setQuick('owner')}><Plus size={14}/> Add Owner</button>}><SearchPicker title="Vehicle Owner" value={f.owner_id||''} onChange={v=>setF(x=>({...x,owner_id:v}))} options={ownerOptions} placeholder="Select vehicle owner…" onAdd={()=>setQuick('owner')} addLabel="Add Vehicle Owner"/></Field>:<Field label="Ownership"><div className="read-only-field"><Building2 size={16}/><span>Company Vehicle</span></div></Field>}<Field label="Regular / Default Driver" required full hint="Vehicle selection in Dispatch automatically loads this driver. A replacement driver can be used for one trip with a reason." action={<button type="button" className="field-add-link" onClick={()=>setQuick('driver')}><Plus size={14}/> Add Driver</button>}><SearchPicker title="Regular Driver" value={f.default_driver_id||''} onChange={v=>setF(x=>({...x,default_driver_id:v}))} options={driverOptions} placeholder="Select regular driver…" searchKeys={['label','sub']} onAdd={()=>setQuick('driver')} addLabel="Add Driver"/></Field></div><FormNote>One driver should be the regular driver of only one active vehicle. Temporary replacement is handled in Dispatch without changing this Fleet relationship.</FormNote></FormSection>

    <FormSection title="Operational Status & Contact" description="Availability is system-managed while a trip is reserved or active." icon={<Phone size={18}/>}><div className="form-grid cols-2"><Field label="Contact Mobile"><input value={f.mobile||''} onChange={e=>setF(x=>({...x,mobile:e.target.value}))} placeholder="Vehicle/owner contact"/></Field><Field label="Status" hint={['Reserved','Busy'].includes(f.status)?'Reserved/Busy is controlled by Dispatch. Change only after resolving the active trip.':'Use Maintenance or Inactive to remove the vehicle from Dispatch.'}><select value={f.status||'Available'} onChange={e=>setF(x=>({...x,status:e.target.value}))}>{statusOptions.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Next Service Due"><input type="date" value={f.service_due_date||''} onChange={e=>setF(x=>({...x,service_due_date:e.target.value}))}/></Field><Field label="Service Note"><input value={f.service_notes||''} onChange={e=>setF(x=>({...x,service_notes:e.target.value}))} placeholder="Service / maintenance reminder"/></Field></div></FormSection>

    <FormSection title="Notes" description="Internal notes visible in the vehicle profile." icon={<FileText size={18}/>}><Field label="Vehicle Notes" full><textarea rows="4" value={f.notes||''} onChange={e=>setF(x=>({...x,notes:e.target.value}))} placeholder="Special handling, condition or operational notes…"/></Field></FormSection>
   </div>
   {error&&<div className="form-error">{error}</div>}
  </Modal>
  {quick&&<QuickCreate kind={quick} onClose={()=>setQuick(null)} onSaved={(row)=>{if(quick==='type'){setLocalTypes(a=>[...a,row]);setF(x=>({...x,vehicle_type_id:row.id,type:row.name,capacity:x.capacity||row.capacity||''}))}if(quick==='partner'){setLocalPartners(a=>[...a,row]);setF(x=>({...x,partner_id:row.id}))}if(quick==='owner'){setLocalOwners(a=>[...a,row]);setF(x=>({...x,owner_id:row.id}))}if(quick==='driver'){setLocalDrivers(a=>[...a,row]);setF(x=>({...x,default_driver_id:row.id}))}setQuick(null)}}/>}
 </>
}

function QuickCreate({kind,onClose,onSaved}){
 const config={type:{table:'vehicle_types',title:'Vehicle Type',defaults:{name:'',code:'',icon:'🚚',capacity:'',active:true,sort_order:0}},partner:{table:'partners',title:'Partner',defaults:{name:'',mobile:'',area:'',type:'Transport Partner',status:'Active'}},owner:{table:'vehicle_owners',title:'Vehicle Owner',defaults:{name:'',mobile:'',address:'',status:'Active'}},driver:{table:'drivers',title:'Driver',defaults:{name:'',mobile:'',address:'',license_no:'',status:'Available'}}}[kind]
 const [f,setF]=useState(config.defaults),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const save=async()=>{if(!f.name)return setError('Name is required.');setBusy(true);try{const row=await insertRow(config.table,f);if(kind==='type')await insertRow('rates',{vehicle_type_id:row.id,vehicle_type:row.name,code:row.code,icon:row.icon,capacity:row.capacity,active:true,sort_order:row.sort_order,customer_rate:0,partner_rate:0,driver_rate:0,labour_customer:0,labour_pay:0,waiting_per_hour:0});onSaved(row)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <Modal open title={`Quick Add · ${config.title}`} subtitle="Create this master record without leaving the vehicle form." eyebrow="Quick Add" onClose={onClose} footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>Save & Select</button></>}><FormSection title={config.title} description="Enter the required master information." compact><div className="form-grid cols-2">{Object.entries(config.defaults).filter(([k])=>!['active','sort_order'].includes(k)).map(([k])=><Field label={k.replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())} key={k}><input value={f[k]??''} onChange={e=>setF(x=>({...x,[k]:e.target.value}))}/></Field>)}</div></FormSection>{error&&<div className="form-error">{error}</div>}</Modal>
}
