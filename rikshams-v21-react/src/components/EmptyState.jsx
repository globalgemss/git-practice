import React from 'react'
import {Inbox} from 'lucide-react'
export default function EmptyState({title='No records',text='Nothing to show here yet.',action}){
  return <div className="empty-state modern-empty"><div className="empty-icon"><Inbox size={22}/></div><b>{title}</b>{text&&<span>{text}</span>}{action&&<div className="empty-action">{action}</div>}</div>
}
