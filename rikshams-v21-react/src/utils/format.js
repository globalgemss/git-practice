export const TZ='Asia/Kathmandu'
export const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0}
export const money=v=>`रु ${num(v).toLocaleString('en-IN',{maximumFractionDigits:2})}`
export function formatDate(v){if(!v)return '—';try{const s=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const [y,m,d]=s.split('-').map(Number);return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:TZ}).format(new Date(Date.UTC(y,m-1,d)))}const dt=new Date(v);return Number.isNaN(dt.getTime())?'—':new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:TZ}).format(dt)}catch{return '—'}}
export function formatTime(v){if(!v)return '—';try{let dt;if(/^\d{2}:\d{2}/.test(String(v))){const [h,m]=String(v).split(':').map(Number);dt=new Date(Date.UTC(2020,0,1,h,m));return dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'UTC'})}dt=new Date(v);return Number.isNaN(dt.getTime())?'—':dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:TZ})}catch{return '—'}}
export function formatDateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,timeZone:TZ}).format(d)}
export const todayKathmandu=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:TZ}).format(new Date())
export const classNames=(...x)=>x.filter(Boolean).join(' ')
export const initials=s=>String(s||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()
export function slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
export function downloadText(name,text,type='text/plain'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
