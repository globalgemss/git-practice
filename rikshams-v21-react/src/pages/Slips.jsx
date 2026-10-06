import React,{useEffect,useMemo,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import QRCode from 'qrcode'
import {Building2,FileCheck2,Printer,ReceiptText,Truck,WalletCards} from 'lucide-react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import {formatDateTime,money} from '../utils/format'
import {supabase} from '../lib/supabase'
import PageTitle from '../components/PageTitle'
import SearchFilterBar from '../components/SearchFilterBar'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import {DateStack,IdentityCell,MoneyCell,RowActions} from '../components/TableKit'

const typeMeta={
 ORDER:{label:'Order Slip',short:'ORDER',icon:FileCheck2,accent:'order',purpose:'Booking / Order Confirmation'},
 DISPATCH:{label:'Dispatch Slip',short:'DISPATCH',icon:Truck,accent:'dispatch',purpose:'Vehicle, Driver & Labour Assignment'},
 RECEIPT:{label:'Money Receipt',short:'RECEIPT',icon:ReceiptText,accent:'receipt',purpose:'Customer Payment Acknowledgement'},
 PAYMENT_VOUCHER:{label:'Payment Voucher',short:'PAYMENT',icon:WalletCards,accent:'voucher',purpose:'Outgoing Payment Evidence'}
}
const defaults={name:'RikshaMS',subtitle:'Transport & Labour Management',legal_name:'',address:'',phone:'',email:'',pan_vat:'',document_footer:'Thank you for choosing our transport service.'}
const scalar=v=>v===null||v===undefined||v===''?'—':String(v)
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]))

export default function Slips(){
 const {rows}=useRealtimeTable('slips',{filters:[['archived','eq',false]]})
 const [sp,setSp]=useSearchParams()
 const [search,setSearch]=useState(sp.get('order')||''),[type,setType]=useState(sp.get('type')||'All'),[sort,setSort]=useState('newest'),[view,setView]=useState('table'),[selected,setSelected]=useState(null)
 const filtered=useMemo(()=>{const q=search.toLowerCase();const list=rows.filter(s=>(type==='All'||s.type===type)&&(!q||[s.slip_no,s.order_id,s.customer_name,s.customer_phone,s.transaction_id,s.snapshot?.payeeName].join(' ').toLowerCase().includes(q)));return [...list].sort((a,b)=>sort==='oldest'?String(a.created_at||'').localeCompare(String(b.created_at||'')):sort==='number'?String(a.slip_no||'').localeCompare(String(b.slip_no||''),undefined,{numeric:true}):sort==='customer'?String(a.customer_name||a.snapshot?.payeeName||'').localeCompare(String(b.customer_name||b.snapshot?.payeeName||'')):String(b.created_at||'').localeCompare(String(a.created_at||'')))},[rows,search,type,sort])
 useEffect(()=>{
  if(!rows.length)return
  const slipId=sp.get('slip'),preview=sp.get('preview')==='1',order=sp.get('order'),t=sp.get('type')
  if(!slipId&&!preview)return
  const hit=slipId?rows.find(x=>String(x.id)===String(slipId)):rows.find(x=>x.order_id===order&&(!t||x.type===t))
  if(hit&&selected?.id!==hit.id)setSelected(hit)
 },[rows,sp,selected?.id])
 const displayName=s=>s.customer_name||s.snapshot?.payeeName||s.snapshot?.partyName||'—'
 const openDocument=s=>{setSelected(s);const next=new URLSearchParams(sp);next.set('slip',s.id);next.delete('preview');setSp(next,{replace:true})}
 const closeDocument=()=>{setSelected(null);const next=new URLSearchParams(sp);next.delete('slip');next.delete('preview');next.delete('print');setSp(next,{replace:true})}
 return <>
  <PageTitle title="Slips & Vouchers" subtitle="Professional Order Slip, Dispatch Slip, Money Receipt and Payment Voucher records"/>
  <div className="document-type-strip scroll-tabs">{Object.entries(typeMeta).map(([k,m])=>{const Icon=m.icon;return <button key={k} className={type===k?'active':''} onClick={()=>setType(type===k?'All':k)}><Icon size={17}/><span><b>{m.label}</b><small>{rows.filter(x=>x.type===k).length} documents</small></span></button>})}</div>
  <SearchFilterBar search={search} onSearch={setSearch} view={view} onView={setView} placeholder="Search slip, order, customer, payee…" onReset={()=>{setSearch('');setType('All');setSort('newest')}} className="pro-module-toolbar"><select value={type} onChange={e=>setType(e.target.value)}><option value="All">All Documents</option>{Object.entries(typeMeta).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="number">Document Number</option><option value="customer">Party A–Z</option></select></SearchFilterBar>
  {view==='table'?<section className="panel pro-table-panel"><DataTable rows={filtered} columns={[
   {key:'sn',label:'SN',className:'pro-sn-col',align:'center',render:(_r,i)=><span className="pro-sn">{i+1}</span>},
   {key:'slip_no',label:'Document',render:r=>{const Icon=typeMeta[r.type]?.icon||FileCheck2;return <IdentityCell title={r.slip_no} subtitle={typeMeta[r.type]?.label||r.type} meta={r.order_id||r.transaction_id||'General'} icon={<Icon size={16}/>}/>}},
   {key:'customer_name',label:'Party',render:r=><IdentityCell title={displayName(r)} subtitle={r.customer_phone||r.snapshot?.payeeType||'—'}/>},
   {key:'amount',label:'Amount',align:'right',render:r=>Number(r.amount||0)>0?<MoneyCell value={r.amount}/>:<span className="pro-muted">—</span>},
   {key:'status',label:'Status',render:r=><StatusBadge status={r.status}/>},
   {key:'created_at',label:'Created',render:r=><DateStack date={new Date(r.created_at).toLocaleDateString()} time={new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}/>},
   {key:'prints',label:'Prints',align:'center',render:r=><span className="pro-soft-chip">{Number(r.print_count||0)}</span>},
   {key:'action',label:'Action',className:'pro-action-col',align:'right',render:r=><RowActions onView={()=>openDocument(r)} viewLabel="View"/>}
  ]}/></section>:<div className="pro-card-grid">{filtered.map(s=>{const Icon=typeMeta[s.type]?.icon||FileCheck2;return <article className="pro-record-card slip-card" key={s.id} onClick={()=>openDocument(s)}><header><IdentityCell title={s.slip_no} subtitle={typeMeta[s.type]?.label||s.type} meta={s.order_id||s.transaction_id||'General'} icon={<Icon size={16}/>}/><StatusBadge status={s.status}/></header><div className="pro-record-kvs"><div><small>Party</small><b>{displayName(s)}</b></div><div><small>Amount</small><b>{Number(s.amount||0)>0?money(s.amount):'—'}</b></div><div><small>Created</small><b>{formatDateTime(s.created_at)}</b></div><div><small>Prints</small><b>{Number(s.print_count||0)}</b></div></div><footer onClick={e=>e.stopPropagation()}><RowActions onView={()=>openDocument(s)} viewLabel="View Document"/></footer></article>})}</div>}
  {selected&&<SlipModal slip={selected} autoPrint={sp.get('print')==='1'} onClose={closeDocument}/>} 
 </>
}

function SlipModal({slip,onClose,autoPrint=false}){
 const autoPrinted=useRef(false)
 const [qr,setQr]=useState(''),[variant,setVariant]=useState('Internal'),[paper,setPaper]=useState('A5'),[company,setCompany]=useState(defaults)
 const s=slip.snapshot||{},meta=typeMeta[slip.type]||{label:slip.type,accent:'order',purpose:'Official Document',icon:FileCheck2}
 const MetaIcon=meta.icon||FileCheck2
 useEffect(()=>{QRCode.toDataURL(`RikshaMS|${slip.type}|${slip.slip_no}|${slip.order_id||''}|${slip.transaction_id||''}`,{width:220,margin:1,errorCorrectionLevel:'M'}).then(setQr).catch(()=>setQr(''));supabase.from('app_settings').select('value').eq('key','general').maybeSingle().then(({data})=>data?.value&&setCompany(x=>({...x,...data.value})))},[slip])
 const reprint=Number(slip.print_count||0)>0
 const route=s.pickup||s.drop?`${s.pickup||'—'} → ${s.drop||'—'}`:''
 const sections=buildSections(slip,variant)
 const titleParty=slip.type==='PAYMENT_VOUCHER'?(s.payeeName||slip.customer_name):slip.customer_name
 const print=async()=>{
  try{await supabase.from('slips').update({print_count:Number(slip.print_count||0)+1,last_printed_at:new Date().toISOString()}).eq('id',slip.id)}catch{}
  const w=window.open('','_blank','width=1000,height=1050');if(!w)return
  w.document.write(renderPrintHtml({slip,company,meta,sections,variant,paper,qr,route,reprint}))
  w.document.close()
 }
 useEffect(()=>{if(!autoPrint||autoPrinted.current||!qr)return;autoPrinted.current=true;const t=setTimeout(()=>print(),180);return()=>clearTimeout(t)},[autoPrint,slip.id,qr])
 return <Modal open title={`${meta.label} · ${slip.slip_no}`} subtitle="Immutable professional document preview. Print and reprint activity is tracked." eyebrow="Official Documents" icon={<MetaIcon size={19}/>} onClose={onClose} size="xl" className="document-modal" footer={<><button className="outline" onClick={onClose}>Close</button><button className="primary" onClick={print}><Printer size={16}/> Print {reprint?'Reprint':'Original'}</button></>}>
  <div className="document-preview-toolbar">
   {slip.type==='DISPATCH'&&<div className="slip-copy-toggle"><button className={variant==='Internal'?'active':''} onClick={()=>setVariant('Internal')}>Internal Copy</button><button className={variant==='Driver'?'active':''} onClick={()=>setVariant('Driver')}>Driver Copy</button></div>}
   <div className="slip-copy-toggle paper-toggle"><button className={paper==='A5'?'active':''} onClick={()=>setPaper('A5')}>A5</button><button className={paper==='A4'?'active':''} onClick={()=>setPaper('A4')}>A4</button></div>
  </div>
  <article className={`professional-document ${meta.accent} paper-${paper.toLowerCase()}`}>
   <div className="document-accent"/>
   {(slip.status==='Cancelled'||slip.status==='Reversed')&&<div className="document-watermark">{slip.status.toUpperCase()}</div>}
   <header className="document-header">
    <div className="document-brand"><div className="document-logo"><Building2 size={23}/></div><div><h2>{company.name||'RikshaMS'}</h2><b>{company.subtitle||'Transport & Labour Management'}</b>{company.legal_name&&<span>{company.legal_name}</span>}<small>{[company.address,company.phone,company.email].filter(Boolean).join(' · ')||'Transport operations & labour management'}</small>{company.pan_vat&&<small>PAN/VAT: {company.pan_vat}</small>}</div></div>
    <div className="document-identity"><small>{meta.purpose}</small><h3>{meta.label}</h3><strong>{slip.slip_no}</strong><span>{formatDateTime(slip.created_at)}</span><div className="document-badges"><i>{slip.status||'Current'}</i><i>{reprint?'REPRINT':'ORIGINAL'}</i>{slip.type==='DISPATCH'&&<i>{variant.toUpperCase()} COPY</i>}</div></div>
   </header>
   <div className="document-reference-row"><div><small>ORDER / REFERENCE</small><b>{slip.order_id||slip.transaction_id||'General'}</b></div><div><small>PARTY</small><b>{titleParty||'—'}</b></div>{qr&&<img src={qr} alt="Document QR"/>}</div>
   {route&&<div className="document-route"><span>Pickup</span><b>{s.pickup||'—'}</b><em>→</em><span>Drop</span><b>{s.drop||'—'}</b></div>}
   {(slip.type==='ORDER'||slip.type==='RECEIPT'||slip.type==='PAYMENT_VOUCHER')&&Number(slip.amount||s.customerRate||0)>0&&<div className="document-amount"><span>{slip.type==='PAYMENT_VOUCHER'?'THIS PAYMENT':slip.type==='RECEIPT'?'RECEIVED AMOUNT':'ORDER VALUE'}</span><strong>{money(slip.type==='ORDER'?(s.customerRate||slip.amount):slip.amount)}</strong></div>}
   <div className="document-sections">{sections.map(sec=><section className="document-section" key={sec.title}><h4>{sec.title}</h4><div className="document-grid">{sec.items.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v,kind])=><div className={`document-kv ${kind||''}`} key={k}><small>{k}</small><b>{kind==='money'?money(v):scalar(v)}</b></div>)}</div></section>)}</div>
   <div className="document-note"><FileCheck2 size={15}/><span>Issued from RikshaMS as an immutable snapshot. Corrections are recorded by cancellation/reversal and reissue; the original audit history is preserved.</span></div>
   {company.document_footer&&<p className="document-footer-note">{company.document_footer}</p>}
   <footer className="document-signatures"><div><span>{slip.type==='PAYMENT_VOUCHER'?'Received By':slip.type==='DISPATCH'?'Driver / Crew':'Customer / Receiver'}</span></div><div><span>{slip.type==='RECEIPT'?'Received By':'Prepared By'}</span></div><div><span>Authorized Signature</span></div></footer>
  </article>
 </Modal>
}

function buildSections(slip,variant){
 const s=slip.snapshot||{}
 if(slip.type==='ORDER')return [
  {title:'Customer & Booking',items:[['Order ID',s.orderId||slip.order_id],['Customer',s.customerName||slip.customer_name],['Phone',s.customerPhone||slip.customer_phone],['Order Status',s.orderStatus||'New']]},
  {title:'Trip Requirement',items:[['Goods / Load',s.goods],['Required Vehicle',s.vehicleType],['Loading Labour',s.loading],['Unloading Labour',s.unloading],['Labour Mode',s.labourMode||'Same Crew'],['Pickup Schedule',s.pickupDateTime||s.schedule]]},
  {title:'Commercial & Instructions',items:[['Customer Final Rate',s.customerRate||slip.amount,'money'],['Payment Terms',s.paymentTerms||s.payment||'Pending'],['Special Instructions',s.notes]]}
 ]
 if(slip.type==='DISPATCH'){
  const base=[
   {title:'Order & Trip',items:[['Order ID',s.orderId||slip.order_id],['Customer',s.customerName||slip.customer_name],['Phone',s.customerPhone||slip.customer_phone],['Goods / Load',s.goods],['Dispatch Time',s.dispatchDateTime]]},
   {title:'Vehicle & Driver',items:[['Vehicle Number',s.vehicleNumber],['Vehicle Type',s.vehicleType],['Actual Trip Driver',s.driverName],['Driver Mobile',s.driverMobile],['Driver Assignment',s.driverOverride?'Replacement Driver':'Regular Driver'],['Replacement Reason',s.driverOverrideReason],['Vehicle Owner',s.ownerName],['Transport Partner',s.partnerName]]},
   {title:'Labour / Crew',items:[['Labour Mode',s.labourMode||'Same Crew'],['Loading Requirement',s.loading],['Unloading Requirement',s.unloading],['Assigned Labour',Array.isArray(s.labourNames)?s.labourNames.join(', '):s.labourNames]]}
  ]
  if(variant==='Internal')base.push({title:'Internal Commercial Summary',items:[['Customer Rate',s.customerRate,'money'],['Vehicle Cost',s.vehicleCost,'money'],['Labour Cost',s.labourCost,'money'],['Gross Margin',s.grossMargin,'money']]})
  return base
 }
 if(slip.type==='RECEIPT')return [
  {title:'Receipt Reference',items:[['Transaction ID',s.transactionId||slip.transaction_id],['Order ID',s.orderId||slip.order_id],['Received From',s.partyName||s.customerName||slip.customer_name],['Receipt Type',s.receiptType],['Payment Method',s.paymentMethod||slip.payment_method],['Reference',s.reference]]},
  {title:'Payment Summary',items:[['Total Order Amount',s.totalBill,'money'],['Previously Received',s.previousReceived,'money'],['This Receipt Amount',s.thisPayment||slip.amount,'money'],['Remaining Due',s.balanceAfter,'money'],['Note / Particulars',s.note]]}
 ]
 if(slip.type==='PAYMENT_VOUCHER')return [
  {title:'Payment Reference',items:[['Transaction ID',s.transactionId||slip.transaction_id],['Order ID',s.orderId||slip.order_id],['Payee Type',s.payeeType],['Paid To',s.payeeName],['Payment For',s.paymentFor],['Payment Method',s.paymentMethod||slip.payment_method],['Reference',s.reference]]},
  {title:'Payable Summary',items:[['Gross Payable / Basis',s.grossPayable,'money'],['Previously Paid',s.previousPaid,'money'],['This Payment',s.thisPayment||slip.amount,'money'],['Remaining Payable',s.remainingOrderPayable,'money'],['Note / Particulars',s.note]]}
 ]
 return [{title:'Document Details',items:Object.entries(s).filter(([,v])=>typeof v!=='object').map(([k,v])=>[k,v])}]
}

function renderPrintHtml({slip,company,meta,sections,variant,paper,qr,route,reprint}){
 const s=slip.snapshot||{},size=paper==='A4'?'A4':'A5',party=slip.type==='PAYMENT_VOUCHER'?(s.payeeName||slip.customer_name):slip.customer_name
 const sectionHtml=sections.map(sec=>`<section><h4>${esc(sec.title)}</h4><div class="grid">${sec.items.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v,kind])=>`<div class="kv ${kind||''}"><small>${esc(k)}</small><b>${kind==='money'?esc(money(v)):esc(scalar(v))}</b></div>`).join('')}</div></section>`).join('')
 const amount=slip.type==='ORDER'?(s.customerRate||slip.amount):slip.amount
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(slip.slip_no)}</title><style>
 @page{size:${size} portrait;margin:${paper==='A4'?'12mm':'8mm'}}*{box-sizing:border-box}body{margin:0;background:#eef2f6;font-family:Arial,"Helvetica Neue",sans-serif;color:#172033}.paper{width:${paper==='A4'?'210mm':'148mm'};min-height:${paper==='A4'?'285mm':'200mm'};margin:12px auto;background:#fff;padding:${paper==='A4'?'13mm':'9mm'};border:1px solid #d9e2ec;position:relative}.accent{position:absolute;left:0;right:0;top:0;height:4px;background:#14385e}.head{display:flex;justify-content:space-between;gap:18px;padding-bottom:10px;border-bottom:1px solid #dfe6ee}.brand{display:flex;gap:9px}.logo{width:36px;height:36px;border:1px solid #cdd9e7;border-radius:9px;display:grid;place-items:center;font-weight:900;color:#14385e}.brand h1{font-size:19px;margin:0;color:#0b1f38}.brand b,.brand span,.brand small{display:block}.brand b{font-size:9px}.brand span,.brand small{font-size:7.5px;color:#667085;margin-top:2px}.doc{text-align:right}.doc small{font-size:7.5px;color:#667085;text-transform:uppercase;letter-spacing:.08em}.doc h2{font-size:15px;margin:2px 0}.doc strong{font-size:10px}.doc>span{display:block;font-size:7.5px;color:#667085;margin-top:2px}.badges{margin-top:5px}.badges i{font-style:normal;font-size:6.5px;border:1px solid #ccd7e4;border-radius:99px;padding:2px 5px;margin-left:3px}.ref{display:grid;grid-template-columns:1fr 1fr auto;align-items:center;gap:8px;border-bottom:1px solid #edf1f5;padding:7px 0}.ref small{font-size:6.5px;color:#667085;display:block}.ref b{font-size:9px}.qr{width:54px;height:54px;border:1px solid #e0e7ef;padding:3px}.route{margin:8px 0;background:#f5f8fc;border:1px solid #e0e7ef;border-radius:7px;padding:7px;text-align:center;font-weight:800;font-size:9px}.amount{display:flex;justify-content:space-between;align-items:center;background:#f7fafc;border:1px solid #d7e1eb;border-radius:8px;padding:8px 10px;margin:8px 0}.amount span{font-size:7px;color:#667085;font-weight:700}.amount strong{font-size:16px}section{margin-top:9px}section h4{font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:#667085;margin:0 0 4px;border-bottom:1px solid #edf1f5;padding-bottom:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}.kv{border:1px solid #e5eaf1;border-radius:6px;padding:6px;min-height:32px}.kv small{font-size:6.5px;color:#667085;display:block}.kv b{font-size:8px;display:block;margin-top:2px;overflow-wrap:anywhere}.kv.money{background:#f8fafc}.kv.money b{font-size:10px}.notice{font-size:6.5px;color:#667085;background:#f8fafc;border-radius:6px;padding:6px;margin-top:9px}.footer-note{text-align:center;font-size:6.5px;color:#667085;margin:6px 0}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:18px}.signatures div{border-bottom:1px solid #98a2b3;padding-top:18px;text-align:center}.signatures span{font-size:6.5px;color:#667085}.watermark{position:absolute;inset:42% 0 auto;text-align:center;font-size:50px;font-weight:900;color:rgba(190,18,60,.08);transform:rotate(-18deg);pointer-events:none}@media print{body{background:#fff}.paper{margin:0;border:0;width:auto;min-height:auto;padding:${paper==='A4'?'10mm':'7mm'}}}
 </style></head><body><div class="paper"><div class="accent"></div>${['Cancelled','Reversed'].includes(slip.status)?`<div class="watermark">${esc(slip.status.toUpperCase())}</div>`:''}<div class="head"><div class="brand"><div class="logo">R</div><div><h1>${esc(company.name||'RikshaMS')}</h1><b>${esc(company.subtitle||'Transport & Labour Management')}</b>${company.legal_name?`<span>${esc(company.legal_name)}</span>`:''}<small>${esc([company.address,company.phone,company.email].filter(Boolean).join(' · '))}</small>${company.pan_vat?`<small>PAN/VAT: ${esc(company.pan_vat)}</small>`:''}</div></div><div class="doc"><small>${esc(meta.purpose)}</small><h2>${esc(meta.label.toUpperCase())}</h2><strong>${esc(slip.slip_no)}</strong><span>${esc(formatDateTime(slip.created_at))}</span><div class="badges"><i>${esc(slip.status||'Current')}</i><i>${reprint?'REPRINT':'ORIGINAL'}</i>${slip.type==='DISPATCH'?`<i>${esc(variant.toUpperCase())} COPY</i>`:''}</div></div></div><div class="ref"><div><small>ORDER / REFERENCE</small><b>${esc(slip.order_id||slip.transaction_id||'General')}</b></div><div><small>PARTY</small><b>${esc(party||'—')}</b></div>${qr?`<img class="qr" src="${qr}"/>`:''}</div>${route?`<div class="route">${esc(route)}</div>`:''}${(['ORDER','RECEIPT','PAYMENT_VOUCHER'].includes(slip.type)&&Number(amount||0)>0)?`<div class="amount"><span>${slip.type==='PAYMENT_VOUCHER'?'THIS PAYMENT':slip.type==='RECEIPT'?'RECEIVED AMOUNT':'ORDER VALUE'}</span><strong>${esc(money(amount))}</strong></div>`:''}${sectionHtml}<div class="notice">Issued from RikshaMS as an immutable snapshot. Corrections are recorded through cancellation/reversal and reissue; the original audit history remains available.</div>${company.document_footer?`<div class="footer-note">${esc(company.document_footer)}</div>`:''}<div class="signatures"><div><span>${slip.type==='PAYMENT_VOUCHER'?'Received By':slip.type==='DISPATCH'?'Driver / Crew':'Customer / Receiver'}</span></div><div><span>${slip.type==='RECEIPT'?'Received By':'Prepared By'}</span></div><div><span>Authorized Signature</span></div></div></div><script>window.onload=()=>window.print()<\/script></body></html>`
}
