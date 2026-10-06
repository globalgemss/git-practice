import React from 'react'

export default function PageTitle({title,subtitle,actions,kicker}){
  return <div className="page-title modern-page-title">
    <div className="page-title-copy">
      {kicker&&<small className="page-kicker">{kicker}</small>}
      <h1>{title}</h1>
      {subtitle&&<p>{subtitle}</p>}
    </div>
    {actions&&<div className="page-actions">{actions}</div>}
  </div>
}
