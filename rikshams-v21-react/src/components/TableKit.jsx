import React,{useEffect,useMemo,useState} from 'react'
import {createPortal} from 'react-dom'
import {Archive,Eye,MapPin,MoreVertical,Pencil,Phone} from 'lucide-react'
import {money,num} from '../utils/format'

export function initials(value=''){
  const bits=String(value||'').trim().split(/\s+/).filter(Boolean)
  if(!bits.length)return '—'
  return (bits.length===1?bits[0].slice(0,2):`${bits[0][0]}${bits[bits.length-1][0]}`).toUpperCase()
}

export function SummaryGrid({children,className=''}){return <div className={`pro-summary-grid ${className}`.trim()}>{children}</div>}
export function SummaryCard({icon,label,value,note,tone=''}){return <article className={`pro-summary-card ${tone}`.trim()}><span className="pro-summary-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong>{note&&<em>{note}</em>}</div></article>}

export function IdentityCell({title,subtitle,meta,icon,badge}){
  return <div className="pro-identity-cell"><span className="pro-identity-avatar">{icon||initials(title)}</span><span className="pro-identity-copy"><b>{title||'—'}</b>{subtitle&&<small>{subtitle}</small>}{meta&&<em>{meta}</em>}</span>{badge&&<span className="pro-identity-side">{badge}</span>}</div>
}
export function PhoneCell({value}){return value?<a href={`tel:${value}`} className="pro-inline-cell" onClick={e=>e.stopPropagation()}><Phone size={14}/><span>{value}</span></a>:<span className="pro-muted">—</span>}
export function AreaCell({value}){return <span className="pro-inline-cell"><MapPin size={14}/><span>{value||'—'}</span></span>}
export function CountBadge({value,label}){return <span className="pro-count-badge">{num(value)}{label&&<small>{label}</small>}</span>}
export function MoneyCell({value,tone='neutral',label}){return <span className={`pro-money-cell ${tone}`}><b>{money(value)}</b>{label&&<small>{label}</small>}</span>}
export function DateStack({date,time}){return <span className="pro-date-stack"><b>{date||'—'}</b>{time&&<small>{time}</small>}</span>}
export function RouteCell({from,to,meta}){return <span className="pro-route-cell"><b>{from||'—'} <i>→</i> {to||'—'}</b>{meta&&<small>{meta}</small>}</span>}

export function RowActions({onView,viewLabel='View',actions=[]}){
  const [menu,setMenu]=useState(null)
  useEffect(()=>{
    if(!menu)return
    const close=()=>setMenu(null)
    window.addEventListener('click',close)
    window.addEventListener('scroll',close,true)
    window.addEventListener('resize',close)
    return()=>{window.removeEventListener('click',close);window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close)}
  },[menu])
  const clean=useMemo(()=>actions.filter(Boolean),[actions])
  const openMenu=e=>{
    e.stopPropagation()
    const r=e.currentTarget.getBoundingClientRect(),width=190,height=Math.max(54,clean.length*42+12)
    const preferredTop=r.bottom+6
    const top=Math.max(8,Math.min(preferredTop,window.innerHeight-height-8))
    setMenu({top,left:Math.max(10,Math.min(window.innerWidth-width-10,r.right-width)),width})
  }
  return <div className="pro-row-actions" onClick={e=>e.stopPropagation()}>
    {onView&&<button type="button" className="pro-view-btn" onClick={onView}><Eye size={15}/><span>{viewLabel}</span></button>}
    {!!clean.length&&<button type="button" className="pro-more-btn" aria-label="More actions" title="More actions" onClick={openMenu}><MoreVertical size={17}/></button>}
    {menu&&createPortal(<div className="pro-action-popover" style={{top:menu.top,left:menu.left,width:menu.width}} onClick={e=>e.stopPropagation()}>
      {clean.map((a,i)=><button type="button" key={`${a.label}-${i}`} className={a.danger?'danger':''} onClick={()=>{setMenu(null);a.onClick?.()}}>{a.icon||null}<span>{a.label}</span></button>)}
    </div>,document.body)}
  </div>
}

export const editAction=(onClick,label='Edit')=>({label,icon:<Pencil size={16}/>,onClick})
export const archiveAction=(onClick,label='Archive')=>({label,icon:<Archive size={16}/>,onClick,danger:true})
