import { createClient } from '@supabase/supabase-js'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if(!url) throw new Error('VITE_SUPABASE_URL is missing. Create .env.local in the project root and restart Vite.')
if(!key) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is missing. Create .env.local in the project root and restart Vite.')

export const supabase=createClient(url,key,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true
  }
})
