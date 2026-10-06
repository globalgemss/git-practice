import React from 'react'
export default function StatCard({icon,label,value,small,tone=''}){return <div className="stat-card modern-stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong>{small&&<small>{small}</small>}</div></div>}
