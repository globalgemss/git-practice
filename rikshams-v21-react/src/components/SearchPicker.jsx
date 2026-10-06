import React,{useEffect,useMemo,useRef,useState} from 'react'
import {Check,ChevronDown,Plus,Search,X} from 'lucide-react'
import {createPortal} from 'react-dom'

/**
 * Responsive entity picker.
 * Desktop: anchored searchable popover.
 * Mobile: searchable bottom sheet so options remain easy to tap.
 * Backward compatible with the previous SearchPicker API.
 */
export default function SearchPicker({
  value='',onChange,options=[],placeholder='Select…',searchKeys=['label','sub'],disabled=false,
  title='Select option',onAdd=null,addLabel='Add new',allowClear=false,emptyText='No matching options'
}){
  const [open,setOpen]=useState(false),[q,setQ]=useState(''),[mobile,setMobile]=useState(false),[rect,setRect]=useState(null)
  const triggerRef=useRef(null),searchRef=useRef(null)
  const selected=options.find(o=>String(o.value)===String(value))
  const filtered=useMemo(()=>{
    const s=q.toLowerCase().trim()
    if(!s)return options
    return options.filter(o=>searchKeys.some(k=>String(o[k]||'').toLowerCase().includes(s)))
  },[options,q,searchKeys])

  useEffect(()=>{
    const update=()=>setMobile(window.matchMedia('(max-width: 700px)').matches)
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update)
  },[])
  useEffect(()=>{
    if(!open)return
    const old=document.body.style.overflow
    if(mobile)document.body.style.overflow='hidden'
    const updateRect=()=>triggerRef.current&&setRect(triggerRef.current.getBoundingClientRect())
    updateRect();window.addEventListener('resize',updateRect);window.addEventListener('scroll',updateRect,true)
    const key=e=>{if(e.key==='Escape')setOpen(false)}
    document.addEventListener('keydown',key)
    const t=setTimeout(()=>searchRef.current?.focus(),70)
    return()=>{clearTimeout(t);document.body.style.overflow=old;window.removeEventListener('resize',updateRect);window.removeEventListener('scroll',updateRect,true);document.removeEventListener('keydown',key)}
  },[open,mobile])

  const pick=o=>{onChange?.(o.value,o);setOpen(false);setQ('')}
  const clear=()=>{onChange?.('',null);setOpen(false);setQ('')}
  const openPicker=()=>{if(!disabled)setOpen(true)}
  const panelStyle=!mobile&&rect?{
    position:'fixed',left:Math.max(12,Math.min(rect.left,window.innerWidth-Math.max(rect.width,360)-12)),
    top:Math.min(rect.bottom+7,window.innerHeight-390),width:Math.max(rect.width,360),maxWidth:'calc(100vw - 24px)'
  }:undefined

  const panel=<>
    <div className={`entity-picker-overlay ${mobile?'mobile':''}`} onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <section className={`entity-picker-panel ${mobile?'entity-picker-sheet':'entity-picker-popover'}`} style={panelStyle} role="dialog" aria-modal={mobile?'true':'false'} aria-label={title}>
        <div className="entity-picker-head">
          <div><small>RikshaMS selector</small><b>{title}</b></div>
          <button type="button" className="entity-picker-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={18}/></button>
        </div>
        <div className="entity-picker-search"><Search size={17}/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`}/>{q&&<button type="button" onClick={()=>setQ('')}><X size={15}/></button>}</div>
        <div className="entity-picker-list" role="listbox">
          {allowClear&&<button type="button" className="entity-picker-option clear-option" onClick={clear}><span><b>None / clear selection</b><small>Remove the current selection</small></span></button>}
          {filtered.map(o=><button type="button" role="option" aria-selected={String(o.value)===String(value)} key={o.value} className={`entity-picker-option ${String(o.value)===String(value)?'selected':''}`} onClick={()=>pick(o)}>
            {o.icon&&<span className="entity-picker-icon">{o.icon}</span>}
            <span className="entity-picker-copy"><b>{o.label}</b>{o.sub&&<small>{o.sub}</small>}</span>
            {String(o.value)===String(value)&&<Check size={18}/>} 
          </button>)}
          {!filtered.length&&<div className="entity-picker-empty"><Search size={22}/><b>{emptyText}</b><small>Try another keyword or add a new record.</small></div>}
        </div>
        {onAdd&&<button type="button" className="entity-picker-add" onClick={()=>{setOpen(false);setQ('');onAdd()}}><Plus size={17}/>{addLabel}</button>}
      </section>
    </div>
  </>

  return <div className={`search-picker modern-picker entity-picker ${disabled?'disabled':''}`}>
    <button ref={triggerRef} type="button" className={`picker-trigger entity-picker-trigger ${selected?'has-value':''}`} disabled={disabled} onClick={openPicker} aria-haspopup="dialog" aria-expanded={open}>
      <span className="entity-picker-trigger-copy"><b className={selected?'':'muted'}>{selected?.label||placeholder}</b>{selected?.sub&&<small>{selected.sub}</small>}</span>
      <ChevronDown size={17}/>
    </button>
    {open&&typeof document!=='undefined'&&createPortal(panel,document.body)}
  </div>
}
