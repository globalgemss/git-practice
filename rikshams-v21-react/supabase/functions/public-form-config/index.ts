import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"content-type":"application/json","cache-control":"public, max-age=15"}});
function envKey(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName);if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return parsed.default as string}catch{}}return Deno.env.get(legacyName)??""}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 try{
  const url=Deno.env.get("SUPABASE_URL")??"",secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  let token="";if(req.method==="GET")token=new URL(req.url).searchParams.get("token")||"";else token=String((await req.json()).token||"");token=token.trim().toUpperCase();
  const {data:form,error}=await admin.from("public_forms").select("id,token,owner_type,owner_profile_id,owner_display_name,title,active,notice,vehicle_types").eq("token",token).eq("active",true).maybeSingle();
  if(error)throw error;if(!form)throw new Error("This public form is disabled or invalid");
  const target=form.owner_type==="Agent"?"Agent Public Form":"Direct Public Form",now=new Date().toISOString();
  const {data:notices,error:nErr}=await admin.from("notices").select("*").eq("active",true).eq("archived",false).or(`start_at.is.null,start_at.lte.${now}`).or(`end_at.is.null,end_at.gte.${now}`);
  if(nErr)throw nErr;
  const filtered=(notices||[]).filter((n:any)=>{
    const targets=Array.isArray(n.targets)?n.targets:[];if(!targets.includes(target))return false;
    if(n.owner_type==="Agent")return form.owner_type==="Agent"&&n.owner_profile_id===form.owner_profile_id;
    if(n.audience==="Selected Agents")return Array.isArray(n.profile_ids)&&n.profile_ids.includes(form.owner_profile_id);
    return true;
  }).sort((a:any,b:any)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.sort_order||0)-Number(b.sort_order||0));
  const {data:types,error:tErr}=await admin.from("vehicle_types").select("id,name,code,icon,capacity,sort_order").eq("active",true).eq("archived",false).order("sort_order");if(tErr)throw tErr;
  return json({success:true,form:{...form,notices:filtered,vehicle_types:types||[]}});
 }catch(e){return json({success:false,message:e instanceof Error?e.message:String(e)},400)}
});