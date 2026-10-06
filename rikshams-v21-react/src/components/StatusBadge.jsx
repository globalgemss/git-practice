import React from 'react'
function slug(v=''){return String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
export default function StatusBadge({status='—',className=''}){
  return <span className={`badge ${slug(status)} ${className}`.trim()}>{status}</span>
}
