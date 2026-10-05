import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"content-type":"application/json"}});
function envKey(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName);if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return parsed.default as string}catch{}}return Deno.env.get(legacyName)??""}
function authPassword(token:string,pin:string){return `RMS!${token.trim().toUpperCase()}!${pin.trim()}#`}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({success:false,message:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")??"", publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"), secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json(), token=String(body.token||"").trim().toUpperCase(), pin=String(body.pin||"").replace(/\D/g,"");
  if(!token||!/^\d{4}$/.test(pin))throw new Error("Invalid token or PIN");
  const {data:profile,error:pErr}=await admin.from("profiles").select("id,auth_user_id,profile_id,display_name,mobile,role,profile_type,login_token,active,permissions").eq("login_token",token).eq("role","Agent").maybeSingle();
  if(pErr)throw pErr;if(!profile?.active)throw new Error("Agent access is disabled");
  const {data:cred,error:cErr}=await admin.from("agent_credentials").select("pin_hash,failed_attempts,locked_until").eq("profile_id",profile.id).maybeSingle();
  if(cErr)throw cErr;if(!cred)throw new Error("Agent PIN is not configured");
  if(cred.locked_until&&new Date(cred.locked_until).getTime()>Date.now())throw new Error("Too many failed attempts. Try again later.");
  const ok=await bcrypt.compare(pin,cred.pin_hash);
  if(!ok){const attempts=Number(cred.failed_attempts||0)+1;const locked=attempts>=5?new Date(Date.now()+15*60*1000).toISOString():null;await admin.from("agent_credentials").update({failed_attempts:attempts,locked_until:locked,last_failed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("profile_id",profile.id);throw new Error(locked?"Too many failed attempts. Locked for 15 minutes.":"Invalid PIN");}
  await admin.from("agent_credentials").update({failed_attempts:0,locked_until:null,last_failed_at:null,updated_at:new Date().toISOString()}).eq("profile_id",profile.id);
  const userClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=token.toLowerCase()+"@rikshams.local";
  const {data:authData,error:authErr}=await userClient.auth.signInWithPassword({email,password:authPassword(token,pin)});
  if(authErr||!authData.session)throw authErr||new Error("Unable to create session");
  await admin.from("profiles").update({last_login_at:new Date().toISOString()}).eq("id",profile.id);
  return json({success:true,session:authData.session,profile});
 }catch(e){return json({success:false,message:e instanceof Error?e.message:String(e)},400)}
});