import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...corsHeaders,"content-type":"application/json"}});
function envKey(jsonName:string, legacyName:string){const raw=Deno.env.get(jsonName);if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return parsed.default as string}catch{}}return Deno.env.get(legacyName)??""}
function authPassword(token:string,pin:string){return `RMS!${token.trim().toUpperCase()}!${pin.trim()}#`}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({success:false,message:"POST required"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")??"";
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const authHeader=req.headers.get("Authorization")??"";
    if(!url||!publishable||!secret||!authHeader) throw new Error("Unauthorized");

    const caller=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
    const token=authHeader.replace(/^Bearer\s+/i,"");
    const {data:userData,error:userError}=await caller.auth.getUser(token);
    if(userError||!userData.user) throw new Error("Unauthorized");
    const {data:me,error:meError}=await caller.from("profiles").select("id,role,active").eq("auth_user_id",userData.user.id).maybeSingle();
    if(meError) throw meError;
    if(!me?.active||!["Admin","Manager"].includes(String(me.role))) throw new Error("Admin/Manager permission required");

    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json();
    const action=String(body.action||"save");

    if(action==="toggle"){
      const profileId=String(body.profile_id||"");
      const active=Boolean(body.active);
      const {data,error}=await admin.from("profiles").update({active,updated_at:new Date().toISOString()}).eq("id",profileId).select().single();
      if(error) throw error;
      return json({success:true,profile:data});
    }

    const existingProfileUuid=String(body.profile_uuid||"").trim();
    let existingProfile:any=null;
    if(existingProfileUuid){
      const {data,error}=await admin.from("profiles").select("*").eq("id",existingProfileUuid).maybeSingle();
      if(error)throw error;
      existingProfile=data;
    }

    const referralPartnerId=String(body.referral_partner_id||existingProfile?.linked_entity_id||"").trim();
    let referralPartner:any=null;
    if(referralPartnerId){
      const {data,error}=await admin.from("referral_partners").select("*").eq("id",referralPartnerId).eq("archived",false).maybeSingle();
      if(error)throw error;
      if(!data)throw new Error("Referral partner not found");
      if(data.access_profile_id&&data.access_profile_id!==existingProfileUuid)throw new Error("This referral partner already has portal access.");
      referralPartner=data;
    }

    const displayName=String(body.display_name??referralPartner?.name??existingProfile?.display_name??"").trim();
    const role=String(body.role??existingProfile?.role??"Agent");
    const profileType=String(body.profile_type??(referralPartner?"Referral Agent":existingProfile?.profile_type??role));
    const requestedToken=String(body.login_token??existingProfile?.login_token??"").trim().toUpperCase();
    const loginToken=requestedToken||crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
    const pin=String(body.pin??"").replace(/\D/g,"");
    if(!displayName) throw new Error("Display name required");
    if(!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits");
    if(!["Admin","Manager","Staff","Agent"].includes(role)) throw new Error("Invalid role");

    const email=loginToken.toLowerCase()+"@rikshams.local";
    const password=authPassword(loginToken,pin);
    let authUserId:string|null=existingProfile?.auth_user_id||null;

    if(authUserId){
      const upd=await admin.auth.admin.updateUserById(authUserId,{email,password,email_confirm:true,app_metadata:{rikshams_role:role,login_token:loginToken},user_metadata:{display_name:displayName}});
      if(upd.error) throw upd.error;
    }else{
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{rikshams_role:role,login_token:loginToken},user_metadata:{display_name:displayName}});
      if(created.error){
        const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});
        if(listed.error) throw listed.error;
        const existing=listed.data.users.find(u=>u.email===email);
        if(!existing) throw created.error;
        authUserId=existing.id;
        const upd=await admin.auth.admin.updateUserById(existing.id,{password,app_metadata:{rikshams_role:role,login_token:loginToken},user_metadata:{display_name:displayName}});
        if(upd.error) throw upd.error;
      }else authUserId=created.data.user.id;
    }

    const permissions=role==="Admin"?["*"]:(Array.isArray(body.permissions)&&body.permissions.length?body.permissions:(role==="Agent"?["leads.read_own","leads.write_own","public_form.manage_own","notices.manage_own","profile.read_self"]:[]));
    const profilePayload={
      auth_user_id:authUserId,
      profile_type:profileType,
      profile_id:body.profile_id||existingProfile?.profile_id||loginToken,
      display_name:displayName,
      mobile:body.mobile||referralPartner?.mobile||existingProfile?.mobile||null,
      role,
      login_token:loginToken,
      active:body.active!==false,
      permissions,
      linked_entity_type:referralPartner?"referral_partner":(existingProfile?.linked_entity_type||null),
      linked_entity_id:referralPartner?.id||(existingProfile?.linked_entity_id||null),
      updated_at:new Date().toISOString()
    };

    let profile:any;
    if(existingProfileUuid){
      const res=await admin.from("profiles").update(profilePayload).eq("id",existingProfileUuid).select().single();
      if(res.error)throw res.error;profile=res.data;
    }else{
      const res=await admin.from("profiles").upsert(profilePayload,{onConflict:"auth_user_id"}).select().single();
      if(res.error)throw res.error;profile=res.data;
    }

    const pinHash=await bcrypt.hash(pin,10);
    const {error:credError}=await admin.from("agent_credentials").upsert({profile_id:profile.id,pin_hash:pinHash,failed_attempts:0,locked_until:null,last_failed_at:null,updated_at:new Date().toISOString()},{onConflict:"profile_id"});
    if(credError) throw credError;

    if(referralPartner){
      const {error:linkError}=await admin.from("referral_partners").update({access_profile_id:profile.id,referral_code:loginToken,updated_at:new Date().toISOString()}).eq("id",referralPartner.id);
      if(linkError)throw linkError;
    }

    let publicForm:any=null;
    if(role==="Agent"&&body.create_public_form!==false){
      const {data:existingForm,error:formLookupError}=await admin.from("public_forms").select("*").eq("owner_profile_id",profile.id).maybeSingle();
      if(formLookupError)throw formLookupError;
      const formPayload={
        token:loginToken,
        owner_type:"Agent",
        owner_profile_id:profile.id,
        owner_display_name:displayName,
        title:existingForm?.title||`Transport Enquiry · ${displayName}`,
        subtitle:existingForm?.subtitle||"Send your transport requirement directly.",
        intro_text:existingForm?.intro_text||"Fill the form below and we will follow up with you.",
        submit_label:existingForm?.submit_label||"Submit Enquiry",
        success_message:existingForm?.success_message||"Thank you. Your enquiry has been received.",
        settings:existingForm?.settings||{show_goods:true,show_vehicle:true,show_schedule:true,show_notes:false,require_goods:false,require_vehicle:false},
        active:existingForm?.active!==false,
        published_at:existingForm?.published_at||new Date().toISOString(),
        updated_at:new Date().toISOString()
      };
      if(existingForm){
        const res=await admin.from("public_forms").update(formPayload).eq("id",existingForm.id).select().single();
        if(res.error)throw res.error;publicForm=res.data;
      }else{
        const res=await admin.from("public_forms").insert(formPayload).select().single();
        if(res.error)throw res.error;publicForm=res.data;
      }
    }

    return json({success:true,profile,referral_partner:referralPartner,public_form:publicForm});
  }catch(e){return json({success:false,message:e instanceof Error?e.message:String(e)},400)}
});
