import React,{useMemo,useState} from 'react'
import QRCode from 'qrcode'
import {useNavigate} from 'react-router-dom'
import {ExternalLink,KeyRound,Link2,ShieldCheck,Sparkles,UserRoundPlus,UsersRound} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {formatDateTime} from '../utils/format'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import GenericMaster from '../components/GenericMaster'
import {ChoiceCards,Field,FormNote,FormSection,SwitchField} from '../components/FormKit'
import {DateStack,IdentityCell,RowActions} from '../components/TableKit'

const agentPermissions=[
 ['leads.read_own','View own leads'],['leads.write_own','Add / manage own leads'],['public_form.manage_own','Manage own public form'],['notices.manage_own','Manage own public notices'],['profile.read_self','View own profile']
]

export default function Access(){
 const nav=useNavigate()
 const {rows,reload}=useRealtimeTable('profiles',{order:'created_at'})
 const {rows:referrals,reload:reloadReferrals}=useRealtimeTable('referral_partners',{filters:[['archived','eq',false]],order:'name',ascending:true})
 const [tab,setTab]=useState('access'),[search,setSearch]=useState(''),[role,setRole]=useState('All'),[sort,setSort]=useState('newest'),[view,setView]=useState('table')
 const [form,setForm]=useState(null),[qr,setQr]=useState(null),[reset,setReset]=useState(null)
 const filtered=useMemo(()=>{const q=search.toLowerCase();const list=rows.filter(p=>(role==='All'||p.role===role)&&(!q||[p.display_name,p.mobile,p.profile_id,p.login_token,p.role,p.profile_type].join(' ').toLowerCase().includes(q)));return [...list].sort((a,b)=>sort==='oldest'?String(a.created_at||'').localeCompare(String(b.created_at||'')):sort==='name'?String(a.display_name||'').localeCompare(String(b.display_name||'')):sort==='role'?String(a.role||'').localeCompare(String(b.role||'')):String(b.created_at||'').localeCompare(String(a.created_at||'')))},[rows,search,role,sort])
 const showQr=async p=>{const base=location.origin,portal=`${base}/agent-login/${p.login_token}`,publicUrl=`${base}/public/${p.login_token}`;const {data:publicForm}=await supabase.from('public_forms').select('id,active').eq('owner_profile_id',p.id).maybeSingle();setQr({...p,portal,publicUrl,publicForm,portalQr:await QRCode.toDataURL(portal,{width:300,margin:1}),publicQr:publicForm?await QRCode.toDataURL(publicUrl,{width:300,margin:1}):''})}
 const toggle=async r=>{const {data,error}=await supabase.functions.invoke('manage-access',{body:{action:'toggle',profile_id:r.id,active:!r.active}});if(error)alert(error.message);else if(data?.success===false)alert(data.message||'Unable to update access');else reload({silent:true})}
 const actionMenu=r=>{
  const menu=[]
  if(r.role==='Agent'&&r.login_token)menu.push({label:'Links / QR',icon:<Link2 size={15}/>,onClick:()=>showQr(r)})
  if(r.login_token)menu.push({label:'Reset PIN',icon:<KeyRound size={15}/>,onClick:()=>setReset(r)})
  menu.push({label:r.active?'Disable Access':'Activate Access',onClick:()=>toggle(r),danger:r.active})
  return <RowActions onView={r.role==='Agent'?()=>nav(`/profiles/agent/${r.id}`):null} viewLabel={r.role==='Agent'?'Profile':'View'} actions={menu}/>
 }
 const cols=[
  {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
  {key:'display_name',label:'User',render:r=><IdentityCell title={r.display_name} subtitle={r.mobile||'No mobile'} meta={r.profile_type||r.role}/>},
  {key:'role',label:'Role',render:r=><StatusBadge status={r.role}/>},
  {key:'profile_id',label:'Profile ID',render:r=><span className="pro-stack-cell"><b>{r.profile_id||'—'}</b><small>{r.linked_entity_id?`Linked: ${r.linked_entity_id}`:'No linked record'}</small></span>},
  {key:'login_token',label:'Login Token',render:r=><code className="pro-code-chip">{r.login_token||'—'}</code>},
  {key:'active',label:'Access',render:r=><StatusBadge status={r.active?'Active':'Inactive'}/>},
  {key:'last_login_at',label:'Last Login',render:r=>r.last_login_at?<DateStack date={new Date(r.last_login_at).toLocaleDateString()} time={new Date(r.last_login_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}/>:<span className="pro-muted">Never</span>},
  {key:'action',label:'Action',className:'pro-action-col',align:'right',render:actionMenu}
 ]
 const onAccessSaved=async data=>{setForm(null);await Promise.all([reload({silent:true}),reloadReferrals({silent:true})]);if(data?.profile?.role==='Agent')showQr(data.profile)}
 return <>
  <PageTitle title="Portal Access & Referral Users" subtitle="Create secure portal users, link referral partners, issue login links/QR and manage public-form access" actions={tab==='access'?<button className="primary" onClick={()=>setForm({})}><UserRoundPlus size={17}/> Create Portal Access</button>:null}/>
  <div className="master-tabs"><button className={tab==='access'?'active':''} onClick={()=>setTab('access')}>Portal Access</button><button className={tab==='referrals'?'active':''} onClick={()=>setTab('referrals')}>Referral Partners</button></div>
  {tab==='access'?<>
   <div className="access-feature-strip"><div><ShieldCheck size={19}/><span><b>Secure PIN login</b><small>Private portal link + 4-digit PIN</small></span></div><div><UsersRound size={19}/><span><b>Linked stakeholder</b><small>Referral partner ↔ portal profile</small></span></div><div><Sparkles size={19}/><span><b>Auto public form</b><small>Shareable link + QR for lead collection</small></span></div></div>
   <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search user, token, mobile…" className="pro-module-toolbar" onReset={()=>{setSearch('');setRole('All');setSort('newest')}}><select value={role} onChange={e=>setRole(e.target.value)}>{['All','Admin','Manager','Staff','Agent'].map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name A–Z</option><option value="role">Role</option></select></SearchFilterBar>
   {view==='table'?<section className="panel pro-table-panel"><DataTable rows={filtered} columns={cols}/></section>:<div className="pro-card-grid">{filtered.map(r=><article className="pro-record-card" key={r.id} onClick={()=>r.role==='Agent'&&nav(`/profiles/agent/${r.id}`)}><header><IdentityCell title={r.display_name} subtitle={r.mobile||'No mobile'} meta={r.profile_type||r.role}/><StatusBadge status={r.active?'Active':'Inactive'}/></header><div className="pro-record-kvs"><div><small>Profile ID</small><b>{r.profile_id||'—'}</b></div><div><small>Token</small><code className="pro-code-chip">{r.login_token||'—'}</code></div><div><small>Linked Record</small><b>{r.linked_entity_id||'—'}</b></div><div><small>Last Login</small><b>{formatDateTime(r.last_login_at)}</b></div></div><footer onClick={e=>e.stopPropagation()}>{actionMenu(r)}</footer></article>)}</div>}
  </>:<GenericMaster table="referral_partners" title="Referral Partners" subtitle="Referral source, commission, conversion and optional self-service portal access" order="name" onAdd={null} fields={[{key:'name',label:'Name',required:true,group:'Identity & Contact'},{key:'mobile',label:'Mobile',group:'Identity & Contact'},{key:'area',label:'Area',group:'Identity & Contact'},{key:'referral_code',label:'Referral Code',group:'Referral Setup'},{key:'commission_type',label:'Commission Type',type:'select',options:['Fixed','Percent','None'],group:'Referral Setup'},{key:'commission_value',label:'Commission Value',type:'number',group:'Referral Setup'},{key:'status',label:'Status',type:'select',options:['Active','Inactive'],group:'Status & Notes'},{key:'notes',label:'Notes',type:'textarea',full:true,group:'Status & Notes'}]} columns={[{key:'name',label:'Partner'},{key:'mobile',label:'Mobile'},{key:'area',label:'Area'},{key:'referral_code',label:'Code'},{key:'total_leads',label:'Leads'},{key:'converted',label:'Converted'},{key:'earned',label:'Earned',money:true},{key:'paid',label:'Paid',money:true},{key:'access_profile_id',label:'Portal',render:r=><StatusBadge status={r.access_profile_id?'Active':'Not Created'}/>},{key:'status',label:'Status',status:true}]} defaultValues={{status:'Active',commission_type:'None',commission_value:0,total_leads:0,converted:0,earned:0,paid:0}} rowActions={r=>r.access_profile_id?<button className="outline small" onClick={()=>nav(`/profiles/agent/${r.access_profile_id}`)}>Portal Profile</button>:<button className="primary small" onClick={()=>setForm({partner:r})}>Give Portal Access</button>}/>} 
  {form&&<AccessModal referrals={referrals} initialPartner={form.partner||null} onClose={()=>setForm(null)} onSaved={onAccessSaved}/>} 
  {qr&&<QrModal data={qr} onClose={()=>setQr(null)}/>} 
  {reset&&<ResetPinModal item={reset} onClose={()=>setReset(null)} onSaved={()=>{setReset(null);reload({silent:true})}}/>}
 </>
}

function AccessModal({referrals,initialPartner,onClose,onSaved}){
 const [kind,setKind]=useState(initialPartner?'referral':'referral')
 const [f,setF]=useState({display_name:initialPartner?.name||'',mobile:initialPartner?.mobile||'',role:'Agent',profile_type:'Referral Agent',login_token:initialPartner?.referral_code||'',pin:'',referral_partner_id:initialPartner?.id||'',create_public_form:true,permissions:agentPermissions.map(x=>x[0])})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const available=referrals.filter(r=>!r.access_profile_id||r.id===f.referral_partner_id)
 const choosePartner=id=>{const p=referrals.find(x=>x.id===id);setF(x=>({...x,referral_partner_id:id,display_name:p?.name||x.display_name,mobile:p?.mobile||x.mobile,login_token:p?.referral_code||x.login_token,profile_type:'Referral Agent',role:'Agent',create_public_form:true}))}
 const togglePermission=k=>setF(x=>({...x,permissions:x.permissions.includes(k)?x.permissions.filter(v=>v!==k):[...x.permissions,k]}))
 const changeKind=v=>{setKind(v);if(v==='referral')setF(x=>({...x,role:'Agent',profile_type:'Referral Agent',create_public_form:true,permissions:agentPermissions.map(a=>a[0])}));else setF(x=>({...x,referral_partner_id:'',role:'Staff',profile_type:'Staff',create_public_form:false,permissions:[]}))}
 const save=async()=>{if(!f.display_name||!/^\d{4}$/.test(f.pin))return setError('Display name and exactly 4-digit PIN are required.');if(kind==='referral'&&!f.referral_partner_id)return setError('Select the referral partner to link with this portal access.');setBusy(true);setError('');try{const payload={...f,login_token:f.login_token.trim()||undefined};const {data,error}=await supabase.functions.invoke('manage-access',{body:payload});if(error)throw error;if(!data?.success)throw new Error(data?.message||'Unable to create access');onSaved(data)}catch(e){setError(e.message||'Unable to create access')}finally{setBusy(false)}}
 return <Modal open title="Create Portal Access" subtitle="Link a stakeholder to a secure personal workspace, login QR and public lead form." onClose={onClose} size="xl" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Creating…':'Create Access & Links'}</button></>}>
  <div className="v25-form-stack">
   <FormSection title="Access type" description="Choose who will use this portal."><ChoiceCards value={kind} onChange={changeKind} options={[{value:'referral',label:'Referral Agent',description:'Own leads, public form, notices and profile',icon:'◎'},{value:'internal',label:'Internal User',description:'Staff / Manager / Admin access',icon:'▦'}]}/></FormSection>
   {kind==='referral'&&<FormSection title="Link referral partner" description="The master record and portal profile stay connected."><div className="form-grid cols-2"><Field label="Referral Partner" required full><select value={f.referral_partner_id} onChange={e=>choosePartner(e.target.value)}><option value="">Select referral partner</option>{available.map(p=><option key={p.id} value={p.id}>{p.name} {p.mobile?`· ${p.mobile}`:''}</option>)}</select></Field></div><FormNote>After access is created, the partner receives a private login link/QR and a separate public enquiry link/QR.</FormNote></FormSection>}
   <FormSection title="Identity & login" description="These details appear on the user's private portal."><div className="form-grid cols-2"><Field label="Display Name" required><input autoFocus value={f.display_name} onChange={e=>setF(x=>({...x,display_name:e.target.value}))}/></Field><Field label="Mobile"><input inputMode="tel" value={f.mobile} onChange={e=>setF(x=>({...x,mobile:e.target.value}))}/></Field>{kind==='internal'&&<Field label="Role"><select value={f.role} onChange={e=>setF(x=>({...x,role:e.target.value,profile_type:e.target.value}))}>{['Staff','Manager','Admin'].map(x=><option key={x}>{x}</option>)}</select></Field>}<Field label="Login Token" hint="Leave blank to auto-generate"><input value={f.login_token} placeholder="AUTO" onChange={e=>setF(x=>({...x,login_token:e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')}))}/></Field><Field label="4-digit PIN" required><input inputMode="numeric" maxLength="4" value={f.pin} placeholder="••••" onChange={e=>setF(x=>({...x,pin:e.target.value.replace(/\D/g,'').slice(0,4)}))}/></Field></div></FormSection>
   {kind==='referral'&&<FormSection title="Portal capabilities" description="Control the self-service features available to this referral user."><div className="switch-grid">{agentPermissions.map(([k,l])=><SwitchField key={k} label={l} checked={f.permissions.includes(k)} onChange={()=>togglePermission(k)}/>)}</div><SwitchField label="Create public lead form automatically" description="Creates a shareable form link and QR owned by this user." checked={f.create_public_form} onChange={v=>setF(x=>({...x,create_public_form:v}))}/></FormSection>}
  </div>
  {error&&<div className="form-error">{error}</div>}
 </Modal>
}

function QrModal({data,onClose}){
 const copy=t=>navigator.clipboard?.writeText(t),download=(src,name)=>{const a=document.createElement('a');a.href=src;a.download=name;document.body.appendChild(a);a.click();a.remove()}
 return <Modal open title={`${data.display_name} · Portal Links`} subtitle="Private portal and public enquiry are separate links. Share the correct one for each use." onClose={onClose} size="xl" footer={<button className="outline" onClick={onClose}>Close</button>}>
  <div className="qr-grid v25-qr-grid"><div className="qr-card"><span className="qr-card-kicker">PRIVATE</span><h3>Portal Login</h3><p>User opens this link, sees their name, enters the 4-digit PIN and manages their workspace.</p><img src={data.portalQr}/><code>{data.portal}</code><div className="table-actions"><button className="outline small" onClick={()=>copy(data.portal)}>Copy Link</button><button className="outline small" onClick={()=>window.open(data.portal,'_blank')}>Open</button><button className="outline small" onClick={()=>download(data.portalQr,`${data.login_token}-portal-login-qr.png`)}>Download QR</button></div></div>{data.publicForm?<div className="qr-card"><span className="qr-card-kicker public">PUBLIC</span><h3>Public Lead Form</h3><p>Anyone can submit an enquiry. New leads are automatically attributed to this referral user.</p><img src={data.publicQr}/><code>{data.publicUrl}</code><div className="table-actions"><button className="outline small" onClick={()=>copy(data.publicUrl)}>Copy Link</button><button className="outline small" onClick={()=>window.open(data.publicUrl,'_blank')}>Open</button><button className="outline small" onClick={()=>download(data.publicQr,`${data.login_token}-public-form-qr.png`)}>Download QR</button></div></div>:<div className="qr-card"><span className="qr-card-kicker public">PUBLIC</span><h3>Public Lead Form</h3><p>No public form has been created for this portal user yet. The user can create it from the Public Form tab.</p><div className="empty-feature-icon"><ExternalLink size={22}/></div></div>}</div>
 </Modal>
}

function ResetPinModal({item,onClose,onSaved}){
 const [pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const save=async()=>{if(!/^\d{4}$/.test(pin))return setError('PIN must be exactly 4 digits.');if(pin!==confirmPin)return setError('PIN confirmation does not match.');setBusy(true);setError('');try{const {data,error}=await supabase.functions.invoke('manage-access',{body:{profile_uuid:item.id,display_name:item.display_name,mobile:item.mobile||'',role:item.role,profile_type:item.profile_type||item.role,profile_id:item.profile_id,login_token:item.login_token,pin,permissions:item.permissions||[],active:item.active!==false,referral_partner_id:item.linked_entity_type==='referral_partner'?item.linked_entity_id:'',create_public_form:item.role==='Agent'}});if(error)throw error;if(!data?.success)throw new Error(data?.message||'Unable to reset PIN');onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <Modal open title={`Reset PIN · ${item.display_name}`} subtitle="The new PIN becomes active immediately and failed-attempt lockout is reset." onClose={onClose} footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy?'Updating…':'Reset PIN'}</button></>}><FormSection title="New login PIN" description="Use exactly four digits."><div className="form-grid cols-2"><Field label="New 4-digit PIN" required><input inputMode="numeric" maxLength="4" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))}/></Field><Field label="Confirm PIN" required><input inputMode="numeric" maxLength="4" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}/></Field></div></FormSection>{error&&<div className="form-error">{error}</div>}</Modal>
}
