import React from 'react'
import {useRealtimeTable} from '../hooks/useRealtimeTable'
import NoticeRenderer from './NoticeRenderer'
export default function AppNotices(){const {rows}=useRealtimeTable('notices',{filters:[['archived','eq',false],['active','eq',true]],order:'priority'});const list=rows.filter(n=>Array.isArray(n.targets)&&n.targets.includes('Admin Dashboard'));return <NoticeRenderer notices={list} limit={4}/>}
