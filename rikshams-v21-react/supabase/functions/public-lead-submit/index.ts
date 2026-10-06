import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"content-type":"application/json"}});
function envKey(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName);if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return parsed.default as string}catch{}}return Deno.env.get(legacyName)??""}
async function sha256(s:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});if(req.method!=="POST")return json({success:false,message:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")??"",secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json(),token=String(body.token||"").trim().toUpperCase(),input=body.input||{};
  const name=String(input.name||"").trim(),phone=String(input.phone||"").replace(/\s+/g,""),pickup=String(input.pickup||"").trim(),drop=String(input.drop||"").trim();
  if(!token||!name||!phone||!pickup||!drop)throw new Error("Name, phone, pickup and drop are required");
  const {data:form,error:fErr}=await admin.from("public_forms").select("token,owner_type,owner_profile_id,owner_display_name,active,settings,success_message").eq("token",token).eq("active",true).maybeSingle();if(fErr)throw fErr;if(!form)throw new Error("This public form is disabled or invalid");
  const settings=form.settings||{};
  if(settings.require_goods&&!String(input.goods||"").trim())throw new Error("Goods / load details are required");
  if(settings.require_vehicle&&!String(input.vehicle_type_id||"").trim())throw new Error("Vehicle type is required");

  let ownerProfile:any=null;
  if(form.owner_profile_id){const r=await admin.from("profiles").select("id,login_token,linked_entity_type,linked_entity_id").eq("id",form.owner_profile_id).maybeSingle();if(r.error)throw r.error;ownerProfile=r.data;}

  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",keyHash=await sha256(`${token}|${ip}`),now=Date.now();
  const {data:rate}=await admin.from("public_form_rate_limits").select("*").eq("key_hash",keyHash).maybeSingle();
  let count=1,windowStart=new Date(now).toISOString();if(rate&&now-new Date(rate.window_started_at).getTime()<60_000){count=Number(rate.request_count||0)+1;windowStart=rate.window_started_at;if(count>12)throw new Error("Too many submissions. Please try again shortly.")}
  await admin.from("public_form_rate_limits").upsert({key_hash:keyHash,window_started_at:windowStart,request_count:count,updated_at:new Date().toISOString()},{onConflict:"key_hash"});
  const since=new Date(now-5*60_000).toISOString();
  const {data:dups}=await admin.from("leads").select("id,name,phone,pickup,drop,goods,vehicle_type,preferred_date,preferred_time,source").eq("phone",phone).ilike("pickup",pickup).ilike("drop",drop).gte("created_at",since).limit(1);if(dups?.length)return json({success:true,leadId:dups[0].id,lead:dups[0],duplicate:true,message:"A similar enquiry was already submitted recently."});
  const {data:id,error:idErr}=await admin.rpc("next_business_id",{p_kind:"lead"});if(idErr)throw idErr;
  const source=form.owner_type==="Agent"?"Agent Referral":"Direct Public Form";
  const referralPartnerId=form.owner_type==="Agent"&&ownerProfile?.linked_entity_type==="referral_partner"?ownerProfile.linked_entity_id:null;
  const lead={id,name,phone,pickup,drop,goods:String(input.goods||"").trim()||null,vehicle_type_id:input.vehicle_type_id||null,vehicle_type:input.vehicle_type||null,distance:input.distance==null||input.distance===''?null:Number(input.distance),loading:input.loading==null||input.loading===''?0:Number(input.loading),unloading:input.unloading==null||input.unloading===''?0:Number(input.unloading),preferred_date:input.preferred_date||null,preferred_time:input.preferred_time||null,source,referral_partner_id:referralPartnerId,referral_partner_name:form.owner_type==="Agent"?form.owner_display_name:null,referral_code:form.owner_type==="Agent"?token:null,status:"New Enquiry",notes:String(input.notes||"").trim()||null,created_by_profile_id:form.owner_type==="Agent"?form.owner_profile_id:null};
  const {error:lErr}=await admin.from("leads").insert(lead);if(lErr)throw lErr;
  await admin.from("lead_events").insert({lead_id:id,event_type:"Created",note:form.owner_type==="Agent"?"Enquiry submitted from referral public form":"Enquiry submitted from direct public form",actor_profile_id:form.owner_type==="Agent"?form.owner_profile_id:null,metadata:{source,referral_partner_id:referralPartnerId}});
  return json({success:true,leadId:id,message:form.success_message||"Thank you. Your enquiry has been received.",lead:{id,name,phone,pickup,drop,goods:lead.goods,vehicle_type:lead.vehicle_type,preferred_date:lead.preferred_date,preferred_time:lead.preferred_time,source}});
 }catch(e){return json({success:false,message:e instanceof Error?e.message:String(e)},400)}
});
