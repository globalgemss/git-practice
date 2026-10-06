import React,{useState} from 'react'
import {Check,ChevronDown,ChevronUp,Info} from 'lucide-react'

export function FormSection({title,description,icon,children,className='',compact=false,collapsible=false,defaultOpen=true,action=null}){
  const [open,setOpen]=useState(defaultOpen)
  return <section className={`form-section-pro ${compact?'compact':''} ${className}`}>
    <div className="form-section-pro-head">
      {icon&&<div className="form-section-pro-icon">{icon}</div>}
      <div className="form-section-title-copy"><h4>{title}</h4>{description&&<p>{description}</p>}</div>
      <div className="form-section-actions">{action}{collapsible&&<button type="button" className="section-collapse" onClick={()=>setOpen(v=>!v)}>{open?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>}</div>
    </div>
    {(!collapsible||open)&&<div className="form-section-pro-body">{children}</div>}
  </section>
}

export function Field({label,required,hint,error,full=false,children,className='',action=null}){
  return <label className={`field modern-field ${full?'span-2':''} ${error?'has-error':''} ${className}`}>
    <span className="field-label-row"><span className="field-label">{label}{required&&<em>*</em>}</span>{action&&<span className="field-label-action" onClick={e=>e.preventDefault()}>{action}</span>}</span>
    {children}
    {error?<small className="field-error">{error}</small>:hint?<small className="field-hint">{hint}</small>:null}
  </label>
}

export function SwitchField({label,description,checked,onChange}){
  return <button type="button" className={`switch-field ${checked?'on':''}`} onClick={()=>onChange(!checked)}>
    <span className="switch-field-copy"><b>{label}</b>{description&&<small>{description}</small>}</span>
    <span className="switch-control"><i/><span>{checked?'On':'Off'}</span></span>
  </button>
}

export function ChoiceCards({value,onChange,options=[]}){
  return <div className="choice-card-grid">{options.map(o=><button type="button" key={o.value} className={`choice-card ${value===o.value?'selected':''}`} onClick={()=>onChange(o.value)}>{o.icon&&<span className="choice-icon">{o.icon}</span>}<span><b>{o.label}</b>{o.description&&<small>{o.description}</small>}</span>{value===o.value&&<Check size={17}/>}</button>)}</div>
}

export function FormNote({children,tone='info'}){
  return <div className={`form-note ${tone}`}><Info size={16}/><span>{children}</span></div>
}
