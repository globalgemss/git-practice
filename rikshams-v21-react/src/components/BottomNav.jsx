import React from 'react'
import {NavLink} from 'react-router-dom'
import {Home,Target,CirclePlus,ClipboardList,Send} from 'lucide-react'
import {mobileNav,canUse} from '../config/modules'
import {useAuth} from '../contexts/AuthContext'
const map={dashboard:Home,leads:Target,new:CirclePlus,orders:ClipboardList,dispatch:Send}
export default function BottomNav(){const {profile}=useAuth(),role=profile?.role||'Staff';return <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{mobileNav.filter(n=>canUse(n[4],role)).map(([k,_i,l,to])=>{const I=map[k]||Home;return <NavLink key={k} to={to} end={to==='/' } className={({isActive})=>isActive?'active':''}><I size={19}/><small>{l}</small></NavLink>})}</nav>}
