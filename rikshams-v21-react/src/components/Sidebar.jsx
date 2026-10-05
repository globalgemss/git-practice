import React from 'react'
import {NavLink} from 'react-router-dom'
import {adminNav,canUse} from '../config/modules'
import {useAuth} from '../contexts/AuthContext'

export default function Sidebar({open,onNavigate}){
  const {profile}=useAuth()
  const role=profile?.role||'Staff'
  return <aside className={`sidebar ${!open?'collapsed':''}`}>
    <div className="brand">
      <div className="brandmark">🛺</div>
      <div className="brandtext"><b>RikshaMS</b><span>Transport Management</span></div>
    </div>
    <nav className="sidebar-nav" aria-label="Main navigation">
      {adminNav.filter(n=>canUse(n[4],role)).map(([key,icon,label,to])=>
        <NavLink
          key={key}
          to={to}
          end={to==='/'}
          title={label}
          onClick={onNavigate}
          className={({isActive})=>isActive?'active':''}
        >
          <span>{icon}</span><em>{label}</em>
        </NavLink>
      )}
    </nav>
    <div className="side-card">
      <div className="side-art">🛺 ↔ 🚚 + 👷</div>
      <b>Vehicle + Labour</b>
      <span>Booking, dispatch, rate, payment and profit in one place.</span>
    </div>
  </aside>
}
