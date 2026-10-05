import React,{useState} from 'react'
import {Outlet} from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import AppNotices from '../components/AppNotices'
export default function AppShell(){const [sidebar,setSidebar]=useState(true);return <div className="app-shell"><Sidebar open={sidebar}/><main className={`main ${!sidebar?'expanded':''}`}><Topbar onMenu={()=>setSidebar(v=>!v)}/><div className="content"><AppNotices/><Outlet/></div></main><BottomNav/></div>}