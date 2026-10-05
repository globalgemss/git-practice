import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return new Response(JSON.stringify({success:false,message:'POST required'}),{status:405,headers:{'content-type':'application/json'}});
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth=req.headers.get('Authorization')||'';
    const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await caller.auth.getUser();
    if(!user)throw new Error('Unauthorized');
    const {data:me}=await caller.from('profiles').select('role').eq('auth_user_id',user.id).maybeSingle();
    if(!me||!['Admin','Manager'].includes(me.role))throw new Error('Admin/Manager permission required');
    const body=await req.json();
    const display_name=String(body.display_name||'').trim(),role=String(body.role||'Agent'),profile_type=String(body.profile_type||role);
    const login_token=String(body.login_token||crypto.randomUUID().slice(0,8)).trim().toUpperCase();
    const pin=String(body.pin||'').replace(/\D/g,'');
    if(!display_name)throw new Error('Display name required');
    if(!/^\d{4}$/.test(pin))throw new Error('PIN must be exactly 4 digits');
    const email=login_token.toLowerCase()+'@rikshams.local';
    const admin=createClient(url,service);
    let authUserId:string|null=null;
    const created=await admin.auth.admin.createUser({email,password:pin,email_confirm:true,user_metadata:{display_name,role,login_token}});
    if(created.error){
      const listed=await admin.auth.admin.listUsers();
      const existing=listed.data.users.find(u=>u.email===email);
      if(!existing)throw created.error;
      authUserId=existing.id;
      const upd=await admin.auth.admin.updateUserById(existing.id,{password:pin,user_metadata:{display_name,role,login_token}});
      if(upd.error)throw upd.error;
    }else authUserId=created.data.user.id;
    const {data:profile,error}=await admin.from('profiles').upsert({
      auth_user_id:authUserId,profile_type,profile_id:body.profile_id||login_token,display_name,mobile:body.mobile||null,role,login_token,active:true,
      permissions:role==='Admin'?['*']:(body.permissions||[])
    },{onConflict:'auth_user_id'}).select().single();
    if(error)throw error;
    if(role==='Agent'){
      await admin.from('public_forms').upsert({token:login_token,owner_type:'Agent',owner_profile_id:profile.id,title:'Transport Enquiry',active:true},{onConflict:'token'});
    }
    return new Response(JSON.stringify({success:true,profile}),{headers:{'content-type':'application/json'}});
  }catch(e){return new Response(JSON.stringify({success:false,message:e instanceof Error?e.message:String(e)}),{status:400,headers:{'content-type':'application/json'}})}
});