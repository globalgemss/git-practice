import React from 'react'
import { slug } from '../utils/format'
export default function StatusBadge({children,status}){const s=status||children||'Unknown';return <span className={`badge ${slug(s)}`}>{s}</span>}