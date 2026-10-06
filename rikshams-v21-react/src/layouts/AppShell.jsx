import React,{useEffect,useState} from 'react'
import {Outlet} from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import AppNotices from '../components/AppNotices'

const tabSelector='.status-tabs button,.master-tabs button,.profile-tabs button,.modern-profile-tabs button,.history-tabs button,.agent-nav button,.v25-agent-nav button,.report-tabs button,.finance-tabs button,.access-tabs button,.public-tabs button,.scroll-tabs button'

export default function AppShell(){
 const [sidebar,setSidebar]=useState(true)
 useEffect(()=>{
  const click=e=>{const btn=e.target.closest?.(tabSelector);if(!btn)return;setTimeout(()=>btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}),20)}
  document.addEventListener('click',click)
  return()=>document.removeEventListener('click',click)
 },[])
 return <div className="app-shell"><Sidebar open={sidebar}/><main className={`main ${!sidebar?'expanded':''}`}><Topbar onMenu={()=>setSidebar(v=>!v)}/><div className="content"><AppNotices/><Outlet/></div></main><BottomNav/></div>
}
