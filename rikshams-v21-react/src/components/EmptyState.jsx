import React from 'react'
export default function EmptyState({title='No records',text='Nothing to show yet.'}){return <div className="empty-state"><div>⌕</div><b>{title}</b><span>{text}</span></div>}