import React from 'react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import NoticeRenderer from './NoticeRenderer'
export default function AppNotices(){const {rows}=useRealtimeTable('notices',{filters:[['active','eq',true],['archived','eq',false]],enabled:true});const admin=rows.filter(n=>Array.isArray(n.targets)&&n.targets.includes('Admin Dashboard'));return <NoticeRenderer notices={admin} limit={2}/>}