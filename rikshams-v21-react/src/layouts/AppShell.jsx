import React,{useEffect,useState} from 'react'
import {Outlet,useLocation} from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import AppNotices from '../components/AppNotices'

export default function AppShell(){
  const location=useLocation()
  const [sidebar,setSidebar]=useState(()=>typeof window==='undefined'?true:window.innerWidth>=840)

  useEffect(()=>{
    if(typeof window!=='undefined' && window.innerWidth<840) setSidebar(false)
  },[location.pathname])

  const closeMobileSidebar=()=>{
    if(typeof window!=='undefined' && window.innerWidth<840) setSidebar(false)
  }

  return <div className="app-shell">
    <Sidebar open={sidebar} onNavigate={closeMobileSidebar}/>
    {sidebar&&<button className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setSidebar(false)}/>}
    <main className={`main ${!sidebar?'expanded':''}`}>
      <Topbar onMenu={()=>setSidebar(v=>!v)}/>
      <div className="content"><AppNotices/><Outlet/></div>
    </main>
    <BottomNav/>
  </div>
}
