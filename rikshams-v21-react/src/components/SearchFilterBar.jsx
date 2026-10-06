import React from 'react'
import {Search,Table2,LayoutGrid,X} from 'lucide-react'
export default function SearchFilterBar({search='',onSearch,children,view,onView,placeholder='Search…',onReset,className=''}){
  const hasSearch=String(search||'').length>0
  return <div className={`universal-toolbar modern-toolbar ${className}`.trim()}>
    <label className="searchbox modern-searchbox"><Search size={17}/><input value={search} onChange={e=>onSearch?.(e.target.value)} placeholder={placeholder}/>{hasSearch&&<button type="button" className="clear-search" onClick={()=>onSearch?.('')} aria-label="Clear search"><X size={15}/></button>}</label>
    <div className="toolbar-filters">{children}</div>
    {onReset&&<button type="button" className="ghost toolbar-reset" onClick={onReset}>Reset</button>}
    {view&&onView&&<div className="toggle-view modern-view-toggle" aria-label="View mode"><button type="button" title="Table view" className={view==='table'?'active':''} onClick={()=>onView('table')}><Table2 size={17}/><span>Table</span></button><button type="button" title="Card view" className={view==='card'?'active':''} onClick={()=>onView('card')}><LayoutGrid size={17}/><span>Cards</span></button></div>}
  </div>
}
