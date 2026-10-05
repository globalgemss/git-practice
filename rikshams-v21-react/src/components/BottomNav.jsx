import React from 'react'
import {NavLink} from 'react-router-dom'
import {mobileNav,canUse} from '../config/modules'
import {useAuth} from '../contexts/AuthContext'
export default function BottomNav(){const {profile}=useAuth(),role=profile?.role||'Staff';return <nav className="mobile-bottom-nav">{mobileNav.filter(n=>canUse(n[4],role)).map(([key,icon,label,to])=><NavLink key={key} to={to} end={to==='/' } className={({isActive})=>isActive?'active':''}><span>{icon}</span><small>{label}</small></NavLink>)}</nav>}