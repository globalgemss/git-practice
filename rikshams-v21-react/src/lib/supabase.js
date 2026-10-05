import {createClient} from '@supabase/supabase-js';

const LIVE_URL='https://hgbxdurimxcofvgujwux.supabase.co';
const LIVE_PUBLISHABLE_KEY='sb_publishable_I39UFjnARnD3X4CDfPYfHw_YvmTe6ey';

const url=import.meta.env.VITE_SUPABASE_URL || LIVE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || LIVE_PUBLISHABLE_KEY;

export const supabase=createClient(url,key,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
