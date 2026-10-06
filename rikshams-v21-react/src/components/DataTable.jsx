import React from 'react'
import EmptyState from './EmptyState'
export default function DataTable({rows=[],columns=[],onRow,emptyTitle='No records found',emptyText='Try changing the search or filter.',className=''}){
  if(!rows.length)return <EmptyState title={emptyTitle} text={emptyText}/>
  return <div className={`table-wrap modern-table-wrap professional-table-wrap ${className}`.trim()}><table className="modern-table professional-table"><thead><tr>{columns.map(c=><th key={c.key} className={[c.className,c.align?`align-${c.align}`:''].filter(Boolean).join(' ')} style={c.width?{width:c.width}:undefined}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id||row.key||i} className={onRow?'clickable-row':''} onClick={()=>onRow?.(row)}>{columns.map(c=><td key={c.key} data-label={c.label} className={[c.className,c.align?`align-${c.align}`:''].filter(Boolean).join(' ')} onClick={e=>{if(c.key==='action'||c.stopRowClick)e.stopPropagation()}}>{c.render?c.render(row,i):(row[c.key]??'—')}</td>)}</tr>)}</tbody></table></div>
}
