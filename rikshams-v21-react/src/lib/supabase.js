import { createClient } from '@supabase/supabase-js'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY

if(!url||!key){
  console.error('RikshaMS: missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).')
}

export const supabase=createClient(
  url||'https://example.supabase.co',
  key||'missing',
  {
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true
    },
    realtime:{
      params:{eventsPerSecond:20}
    }
  }
)
