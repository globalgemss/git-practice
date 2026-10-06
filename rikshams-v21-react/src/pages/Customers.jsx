import React,{useEffect,useMemo,useState} from 'react'
import {createPortal} from 'react-dom'
import {Archive,Building2,Eye,MapPin,MoreVertical,Pencil,Phone,Plus,UserCheck,UserRoundPlus,Users,WalletCards} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import {Field,FormSection} from '../components/FormKit'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {archiveRow,insertRow,updateRow} from '../services/api'
import {initials,money,num} from '../utils/format'

const customerId=()=>`CUS-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`
const customerType=r=>String(r?.business||'').trim()?'Corporate':'Individual'

export default function Customers(){
  const nav=useNavigate()
  const {rows,reload,loading,error}=useRealtimeTable('customers',{filters:[['archived','eq',false]],order:'name',ascending:true})
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState('All')
  const [balance,setBalance]=useState('All')
  const [sort,setSort]=useState('name')
  const [view,setView]=useState(()=>{
    if(typeof window==='undefined')return 'table'
    const saved=window.localStorage.getItem('rikshams-customers-view')
    return saved||(window.matchMedia?.('(max-width: 720px)').matches?'card':'table')
  })
  const [edit,setEdit]=useState(null)
  const [menu,setMenu]=useState(null)

  const setViewMode=v=>{setView(v);if(typeof window!=='undefined')window.localStorage.setItem('rikshams-customers-view',v)}
  useEffect(()=>{
    if(!menu)return
    const close=()=>setMenu(null)
    document.addEventListener('click',close)
    window.addEventListener('resize',close)
    window.addEventListener('scroll',close,true)
    return()=>{document.removeEventListener('click',close);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true)}
  },[menu])

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase()
    const list=rows.filter(r=>{
      const matchesSearch=!q||[r.id,r.name,r.mobile,r.business,r.area,r.status,customerType(r)].join(' ').toLowerCase().includes(q)
      const matchesStatus=status==='All'||r.status===status
      const due=num(r.outstanding)>0
      const matchesBalance=balance==='All'||(balance==='Due'?due:!due)
      return matchesSearch&&matchesStatus&&matchesBalance
    })
    return [...list].sort((a,b)=>{
      if(sort==='newest')return String(b.created_at||'').localeCompare(String(a.created_at||''))
      if(sort==='orders')return num(b.orders)-num(a.orders)
      if(sort==='outstanding')return num(b.outstanding)-num(a.outstanding)
      if(sort==='total')return num(b.total)-num(a.total)
      return String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'})
    })
  },[rows,search,status,balance,sort])

  const summary=useMemo(()=>({
    total:rows.length,
    active:rows.filter(r=>String(r.status||'').toLowerCase()==='active').length,
    outstanding:rows.reduce((s,r)=>s+num(r.outstanding),0),
    withDue:rows.filter(r=>num(r.outstanding)>0).length
  }),[rows])

  const openMenu=(e,row)=>{
    e.stopPropagation()
    const rect=e.currentTarget.getBoundingClientRect()
    setMenu({row,top:rect.bottom+7,left:Math.max(12,Math.min(window.innerWidth-184,rect.right-172))})
  }
  const doArchive=async row=>{
    setMenu(null)
    if(!confirm(`Archive ${row.name||row.id}?`))return
    await archiveRow('customers',row.id)
    reload({silent:true})
  }

  return <>
    <PageTitle title="Customers" subtitle="Customer master, order history and balances" actions={<button className="primary customer-add-btn" onClick={()=>setEdit({status:'Active'})}><Plus size={17}/> Add Customer</button>}/>

    <section className="customer-summary-grid" aria-label="Customer summary">
      <CustomerSummary icon={<Users size={18}/>} label="Total Customers" value={summary.total} note={`${filtered.length} in current view`}/>
      <CustomerSummary icon={<UserCheck size={18}/>} label="Active" value={summary.active} note="Ready for new orders" tone="success"/>
      <CustomerSummary icon={<WalletCards size={18}/>} label="Outstanding" value={money(summary.outstanding)} note="Across all customers" tone="warning"/>
      <CustomerSummary icon={<Building2 size={18}/>} label="Customers With Due" value={summary.withDue} note="Need payment follow-up" tone="danger"/>
    </section>

    <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setViewMode} placeholder="Search customer, mobile, business, area…" onReset={()=>{setSearch('');setStatus('All');setBalance('All');setSort('name')}} className="customers-toolbar">
      <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Customer status"><option value="All">All Status</option><option>Active</option><option>Inactive</option></select>
      <select value={balance} onChange={e=>setBalance(e.target.value)} aria-label="Balance filter"><option value="All">All Balances</option><option value="Due">Has Due</option><option value="Clear">No Due</option></select>
      <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort customers"><option value="name">Name A–Z</option><option value="newest">Newest</option><option value="orders">Most Orders</option><option value="outstanding">Highest Outstanding</option><option value="total">Highest Total Business</option></select>
    </SearchFilterBar>

    {error&&<div className="form-error">{error.message}</div>}
    {loading&&!rows.length?<section className="panel customers-loading">Loading customers…</section>:view==='table'?<CustomerTable rows={filtered} onProfile={r=>nav(`/profiles/customer/${r.id}`)} onEdit={setEdit} onMenu={openMenu}/>:<CustomerCards rows={filtered} onProfile={r=>nav(`/profiles/customer/${r.id}`)} onEdit={setEdit} onMenu={openMenu}/>} 

    {menu&&createPortal(<div className="customer-action-popover" style={{top:menu.top,left:menu.left}} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>{setMenu(null);nav(`/profiles/customer/${menu.row.id}`)}}><Eye size={16}/><span>View Profile</span></button>
      <button onClick={()=>{setEdit(menu.row);setMenu(null)}}><Pencil size={16}/><span>Edit Customer</span></button>
      <button className="danger" onClick={()=>doArchive(menu.row)}><Archive size={16}/><span>Archive</span></button>
    </div>,document.body)}

    {edit&&<CustomerModal item={edit} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);reload({silent:true})}}/>}
  </>
}

function CustomerSummary({icon,label,value,note,tone=''}){
  return <article className={`customer-summary-card ${tone}`}><span className="customer-summary-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></article>
}

function CustomerTable({rows,onProfile,onEdit,onMenu}){
  if(!rows.length)return <section className="panel"><EmptyState title="No customers found" text="Try changing the search or filters, or add a new customer."/></section>
  return <section className="panel customer-table-panel">
    <div className="customer-table-wrap"><table className="customer-table">
      <thead><tr><th className="sn-col">SN</th><th>Customer</th><th>Mobile</th><th>Business</th><th>Area</th><th className="num-col">Orders</th><th className="money-col">Total</th><th className="money-col">Outstanding</th><th>Status</th><th className="action-col">Action</th></tr></thead>
      <tbody>{rows.map((r,i)=><tr key={r.id} onClick={()=>onProfile(r)}>
        <td className="sn-col"><span className="customer-sn">{i+1}</span></td>
        <td><CustomerIdentity row={r}/></td>
        <td><a className="customer-phone" href={r.mobile?`tel:${r.mobile}`:undefined} onClick={e=>e.stopPropagation()}><Phone size={14}/><span>{r.mobile||'—'}</span></a></td>
        <td><div className="customer-business-cell"><b>{r.business||'—'}</b><small>{customerType(r)}</small></div></td>
        <td><span className="customer-area"><MapPin size={14}/>{r.area||'—'}</span></td>
        <td className="num-col"><span className="customer-order-count">{num(r.orders)}</span></td>
        <td className="money-col"><b className="customer-money">{money(r.total)}</b></td>
        <td className="money-col"><BalanceValue value={r.outstanding}/></td>
        <td><StatusBadge status={r.status||'Active'}/></td>
        <td className="action-col" onClick={e=>e.stopPropagation()}><div className="customer-row-actions"><button className="customer-view-btn" onClick={()=>onProfile(r)}><Eye size={15}/><span>View</span></button><button className="customer-more-btn" title="More actions" onClick={e=>onMenu(e,r)}><MoreVertical size={17}/></button></div></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

function CustomerCards({rows,onProfile,onEdit,onMenu}){
  if(!rows.length)return <section className="panel"><EmptyState title="No customers found" text="Try changing the search or filters, or add a new customer."/></section>
  return <div className="customer-card-grid">{rows.map(r=><article className="customer-master-card" key={r.id} onClick={()=>onProfile(r)}>
    <header><CustomerIdentity row={r}/><StatusBadge status={r.status||'Active'}/></header>
    <div className="customer-card-contact"><span><Phone size={14}/>{r.mobile||'—'}</span><span><MapPin size={14}/>{r.area||'—'}</span></div>
    {r.business&&<div className="customer-card-business"><Building2 size={15}/><span><small>Business</small><b>{r.business}</b></span></div>}
    <div className="customer-card-metrics"><div><small>Orders</small><b>{num(r.orders)}</b></div><div><small>Total</small><b>{money(r.total)}</b></div><div><small>Outstanding</small><BalanceValue value={r.outstanding}/></div></div>
    <footer onClick={e=>e.stopPropagation()}><button className="outline small" onClick={()=>onProfile(r)}><Eye size={15}/> View Profile</button><button className="ghost small customer-edit-card" onClick={()=>onEdit(r)}><Pencil size={15}/> Edit</button><button className="customer-more-btn" title="More actions" onClick={e=>onMenu(e,r)}><MoreVertical size={17}/></button></footer>
  </article>)}</div>
}

function CustomerIdentity({row}){
  return <div className="customer-identity"><span className="customer-initials">{initials(row.name)}</span><span><b>{row.name||'Unnamed Customer'}</b><small>{row.id||customerType(row)} · {customerType(row)}</small></span></div>
}

function BalanceValue({value}){
  const due=num(value)
  return due>0?<span className="customer-due"><b>{money(due)}</b><small>Due</small></span>:<span className="customer-clear"><b>{money(0)}</b><small>Clear</small></span>
}

function CustomerModal({item,onClose,onSaved}){
  const isEdit=!!item.id
  const [f,setF]=useState({name:'',mobile:'',business:'',area:'',status:'Active',...item})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const save=async()=>{
    if(!String(f.name||'').trim())return setError('Customer name is required.')
    setBusy(true);setError('')
    try{
      const row={name:String(f.name||'').trim(),mobile:String(f.mobile||'').trim()||null,business:String(f.business||'').trim()||null,area:String(f.area||'').trim()||null,status:f.status||'Active'}
      if(isEdit)await updateRow('customers',item.id,row)
      else await insertRow('customers',{id:customerId(),...row,orders:0,total:0,received:0,outstanding:0,archived:false})
      onSaved()
    }catch(e){setError(e.message||'Could not save customer.')}
    finally{setBusy(false)}
  }
  return <Modal open title={isEdit?`Edit Customer · ${item.name}`:'Add Customer'} subtitle="Keep the customer record compact, searchable and ready for orders and accounting." icon={isEdit?<Pencil size={18}/>:<UserRoundPlus size={18}/>} onClose={onClose} size="md" density="compact" className="customer-editor-modal" footer={<><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':isEdit?'Save Changes':'Save Customer'}</button></>}>
    <div className="v25-form-stack customer-form-stack">
      <FormSection title="Customer Identity" description="Core contact information used in orders, receipts and profiles." compact icon={<Users size={17}/>}> 
        <div className="form-grid cols-2">
          <Field label="Customer Name" required><input autoFocus value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))} placeholder="Full name / contact person"/></Field>
          <Field label="Mobile"><input type="tel" inputMode="tel" value={f.mobile||''} onChange={e=>setF(x=>({...x,mobile:e.target.value}))} placeholder="98XXXXXXXX"/></Field>
        </div>
      </FormSection>
      <FormSection title="Business & Location" description="Optional details that make searching and reporting easier." compact icon={<Building2 size={17}/>}> 
        <div className="form-grid cols-2">
          <Field label="Business / Organization"><input value={f.business||''} onChange={e=>setF(x=>({...x,business:e.target.value}))} placeholder="Leave blank for individual customer"/></Field>
          <Field label="Area"><input value={f.area||''} onChange={e=>setF(x=>({...x,area:e.target.value}))} placeholder="Area / locality"/></Field>
          <Field label="Status"><select value={f.status||'Active'} onChange={e=>setF(x=>({...x,status:e.target.value}))}><option>Active</option><option>Inactive</option></select></Field>
        </div>
      </FormSection>
    </div>
    {error&&<div className="form-error">{error}</div>}
  </Modal>
}
