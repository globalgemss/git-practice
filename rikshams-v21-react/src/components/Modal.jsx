import React,{useEffect,useId,useRef} from 'react'
import {PanelsTopLeft,X} from 'lucide-react'

export default function Modal({open=true,title,subtitle,onClose,children,footer,size='md',eyebrow='RikshaMS',icon=null,density='compact',className='',bodyClassName=''}){
  const titleId=useId(),dialogRef=useRef(null)
  useEffect(()=>{
    if(!open)return
    const old=document.body.style.overflow
    document.body.style.overflow='hidden'
    const key=e=>{if(e.key==='Escape')onClose?.()}
    document.addEventListener('keydown',key)
    const timer=setTimeout(()=>dialogRef.current?.focus(),0)
    return()=>{clearTimeout(timer);document.body.style.overflow=old;document.removeEventListener('keydown',key)}
  },[open,onClose])
  if(!open)return null
  return <div className="modal-backdrop modern-modal-backdrop v25-modal-backdrop v26-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <section ref={dialogRef} tabIndex={-1} className={`modal modern-modal v25-modal v26-modal modal-${size} modal-density-${density} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-size={size} data-density={density} onMouseDown={e=>e.stopPropagation()}>
      <header className="modal-head modern-modal-head v25-modal-head v26-modal-head">
        <div className="modal-title-copy">
          <span className="modal-title-icon">{icon||<PanelsTopLeft size={19}/>}</span>
          <div className="modal-title-text"><small className="modal-eyebrow">{eyebrow}</small><h3 id={titleId}>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>
        </div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
      </header>
      <div className={`modal-body modern-modal-body v25-modal-body v26-modal-body ${bodyClassName}`}><div className="modal-content-flow">{children}</div></div>
      {footer&&<footer className="modal-foot modern-modal-foot v25-modal-foot v26-modal-foot"><div className="modal-foot-spacer"/>{footer}</footer>}
    </section>
  </div>
}
