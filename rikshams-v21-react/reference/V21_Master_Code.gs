const RIKSHA = {
  TZ: 'Asia/Kathmandu',
  VERSION: '21.0.0-advanced-notice-center',
  BACKEND_PROPERTY: 'RIKSHA_BACKEND_SPREADSHEET_ID',
  SESSION_TTL: 21600,
  MODULES: {
    orders:{sheet:'Riksha_Orders',preferred:['id','createRequestId','source','sourceLeadId','createdAt','lastStageAt','assignedAt','dispatchedAt','tripStartedAt','deliveredAt','completedAt','cancelledAt','date','time','customerId','customer','phone','pickup','drop','goods','vehicleTypeId','vehicleType','distance','loading','unloading','status','payment','customerRate','vehicleCost','labourCost','estimatedVehicleCost','estimatedLabourCost','vehicleId','partnerId','driverId','driverName','partnerCommitment','labourIds','labourCommitments','settlementStatus','cancellationCharge','notes','timeline','contact','_recordVersion','_updatedAt','_syncStatus']},
    vehicles:{sheet:'Riksha_Vehicles',preferred:['id','vehicleTypeId','type','number','capacity','area','status','ownershipType','partnerId','ownerId','defaultDriverId','owner','driver','mobile','notes','trips','rating','profileNotes','_recordVersion','_updatedAt','_syncStatus']},
    labour:{sheet:'Riksha_Labour',preferred:['id','name','mobile','area','skill','status','rate','payment','jobs','rating','profileNotes','_recordVersion','_updatedAt','_syncStatus']},
    customers:{sheet:'Riksha_Customers',preferred:['id','name','mobile','business','area','status','orders','total','received','outstanding','last','_recordVersion','_updatedAt','_syncStatus']},
    leads:{sheet:'Riksha_Leads',preferred:['id','customerId','name','phone','pickup','drop','goods','vehicleTypeId','vehicleType','distance','loading','unloading','preferredDate','preferredTime','source','referralPartnerId','referralPartnerName','referralCode','status','latestQuote','confirmedRate','notes','createdAt','quoteHistory','followups','timeline','convertedOrderId','createdByProfileId','_recordVersion','_updatedAt','_syncStatus']},
    partners:{sheet:'Riksha_Partners',preferred:['id','name','mobile','area','type','status','jobs','totalEarned','totalPaid','balancePayable','notes','_recordVersion','_updatedAt','_syncStatus']},
    transactions:{sheet:'Riksha_Transactions',preferred:['id','actionId','date','time','orderId','partyType','partyId','partyName','type','direction','amount','method','reference','note','createdBy','createdAt','status','reversalOf','reversedBy','_recordVersion','_updatedAt','_syncStatus']},
    slips:{sheet:'Riksha_Slips',preferred:['id','revisionRequestId','slipNo','type','orderId','transactionId','customerId','customerName','customerPhone','vehicleId','partnerId','labourIds','createdDate','createdTime','createdAt','createdBy','version','status','amount','paymentMethod','snapshot','printCount','lastPrintedAt','source','_recordVersion','_updatedAt','_syncStatus']},
    daybookClosings:{sheet:'Riksha_Daybook_Closings',preferred:['id','date','cash','bank','esewa','khalti','other','total','verifiedBy','verifiedAt','note','_updatedAt']},
    vehicleOwners:{sheet:'Riksha_Vehicle_Owners',preferred:['id','name','mobile','address','status','vehicleIds','notes','profileNotes','_updatedAt']},
    drivers:{sheet:'Riksha_Drivers',preferred:['id','name','mobile','address','licenseNo','status','vehicleId','notes','profileNotes','_updatedAt']},
    referralPartners:{sheet:'Riksha_Referral_Partners',preferred:['id','name','mobile','area','status','referralCode','commissionType','commissionValue','totalLeads','converted','earned','paid','notes','profileNotes','_updatedAt']},
    notices:{sheet:'Riksha_Notices',preferred:['id','title','text','audience','profileIds','targets','displayType','semanticType','customColor','textColor','icon','priority','startAt','endAt','active','dismissible','ctaText','ctaAction','marqueeSpeed','sortOrder','ownerType','ownerProfileId','archived','createdAt','updatedAt','createdBy']}
  }
};

function doGet(e){
  const t=HtmlService.createTemplateFromFile('Index');
  t.WEBAPP_URL=ScriptApp.getService().getUrl()||'';
  t.INIT_LOGIN_TOKEN=(e&&e.parameter&&e.parameter.token)||'';
  t.INIT_PUBLIC_TOKEN=(e&&e.parameter&&e.parameter.public)||'';
  return t.evaluate().setTitle('RikshaMS — Transport Management').addMetaTag('viewport','width=device-width, initial-scale=1.0').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupRikshaMS(){
  const ss=getBackend_();
  PropertiesService.getScriptProperties().setProperty(RIKSHA.BACKEND_PROPERTY,ss.getId());
  ensureBackend_(ss);
  seedAdmin_(ss);
  ensureAdminPublicForm_(ss);
  setMeta_(ss,'version',RIKSHA.VERSION);
  return {success:true,message:'RikshaMS initialized',spreadsheetId:ss.getId(),name:ss.getName(),adminPin:'4462'};
}
function setRikshaBackend(spreadsheetId){
  const id=extractSpreadsheetId_(spreadsheetId);if(!id)throw new Error('Spreadsheet ID required');
  const ss=SpreadsheetApp.openById(id);PropertiesService.getScriptProperties().setProperty(RIKSHA.BACKEND_PROPERTY,id);ensureBackend_(ss);seedAdmin_(ss);return {success:true,name:ss.getName()};
}
function getBackend_(){
  const p=String(PropertiesService.getScriptProperties().getProperty(RIKSHA.BACKEND_PROPERTY)||'').trim();
  if(p)return SpreadsheetApp.openById(p);
  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(active)return active;
  throw new Error('Backend not configured. Run setupRikshaMS() once from the bound Apps Script project.');
}
function extractSpreadsheetId_(s){s=String(s||'').trim();const m=s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);return m?m[1]:s;}
function now_(){return Utilities.formatDate(new Date(),RIKSHA.TZ,"yyyy-MM-dd'T'HH:mm:ss");}
function uid_(p){return String(p||'ID')+'-'+Utilities.getUuid().slice(0,8).toUpperCase();}
function clean_(v,n){return String(v==null?'':v).trim().slice(0,n||500);}
function fail_(e){return {success:false,message:String(e&&e.message||e)};}

/* V16 fast-path helpers: keep public/login reads small and avoid full-sheet rewrites. */
function cacheJsonGet_(key){try{const v=CacheService.getScriptCache().get(key);return v?JSON.parse(v):null}catch(e){return null}}
function cacheJsonPut_(key,val,ttl){try{CacheService.getScriptCache().put(key,JSON.stringify(val),ttl||120)}catch(e){}return val}
function cacheRemove_(key){try{CacheService.getScriptCache().remove(key)}catch(e){}}
/* V17 near-real-time sync: revision checks are cheap; sheet reads happen only after a revision changes. */
function revisionKey_(module){return 'RKS_REV_'+String(module||'');}
function revisionMap_(modules){const props=PropertiesService.getScriptProperties().getProperties(),out={};(modules||Object.keys(RIKSHA.MODULES)).forEach(function(k){if(!RIKSHA.MODULES[k])return;const v=Number(props[revisionKey_(k)]||0);out[k]=isFinite(v)?v:0});return out;}
function moduleRevision_(module){return Number(revisionMap_([module])[module]||0);}
function moduleRevisions_(modules){return revisionMap_(modules);}
function publishModuleChange_(module,rows,full){
  if(!RIKSHA.MODULES[module])return 0;
  const p=PropertiesService.getScriptProperties(),next=moduleRevision_(module)+1;
  p.setProperty(revisionKey_(module),String(next));
  cacheJsonPut_('RKS_DELTA_'+module+'_'+next,{full:!!full,rows:Array.isArray(rows)?rows:[]},600);
  return next;
}
function readRecentObjects_(sh,limit){
  if(!sh||sh.getLastRow()<2)return [];
  const cols=sh.getLastColumn(),headers=sh.getRange(1,1,1,cols).getDisplayValues()[0].map(String),last=sh.getLastRow(),n=Math.max(1,Number(limit||100)),start=Math.max(2,last-n+1),vals=sh.getRange(start,1,last-start+1,cols).getValues();
  return vals.filter(function(r){return r.some(function(x){return x!==''&&x!=null})}).map(function(r){const o={};headers.forEach(function(k,i){o[k]=fromCell_(r[i])});return o;});
}
function nextFastId_(sh,module,prefix,base){
  const p=PropertiesService.getScriptProperties(),key='RKS_SEQ_'+module;let n=Number(p.getProperty(key)||0);
  if(!n){
    n=Number(base||0);if(sh&&sh.getLastRow()>=2){const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0],c=h.indexOf('id');if(c>=0){const ids=sh.getRange(2,c+1,sh.getLastRow()-1,1).getDisplayValues();ids.forEach(function(r){const x=Number(String(r[0]||'').replace(/\D/g,''));if(x>n)n=x;});}}
  }
  n++;p.setProperty(key,String(n));return String(prefix||'ID')+'-'+n;
}
function moduleRowsForSession_(ss,s,module){
  let rows=readObjects_(ss.getSheetByName(RIKSHA.MODULES[module].sheet));
  if(String(s.role||'').toLowerCase()==='admin')return rows;
  const pid=String(s.profileId||'');
  if(module==='leads')return rows.filter(function(x){return String(x.referralPartnerId||x.createdByProfileId||'')===pid});
  if(module==='notices'){const now=now_();return rows.map(normalizeNotice_).filter(function(x){if(!noticeIsLive_(x,now))return false;if(String(x.ownerType||'Admin')==='Agent')return String(x.ownerProfileId||'')===pid;return noticeTargetsAgent_(x,pid);});}
  if(module==='orders'){const leads=readObjects_(ss.getSheetByName('Riksha_Leads')).filter(function(x){return String(x.referralPartnerId||x.createdByProfileId||'')===pid}),ids={};leads.forEach(function(x){if(x.convertedOrderId)ids[String(x.convertedOrderId)]=1});return rows.filter(function(x){return ids[String(x.id)]||String(x.partnerId||'')===pid});}
  return [];
}
function getModuleChanges(sessionToken,known,modules){
  try{
    const s=requireSession_(sessionToken),want=(modules||[]).filter(function(k){return !!RIKSHA.MODULES[k]}),revMap=revisionMap_(want),out={success:true,changes:{},revisions:{},at:now_()};let ss=null;known=known||{};
    want.forEach(function(module){
      const cur=Number(revMap[module]||0),prev=Number(known[module]||0);out.revisions[module]=cur;if(cur===prev)return;
      let canMerge=prev>0,merged=[];
      if(canMerge){for(let r=prev+1;r<=cur;r++){const d=cacheJsonGet_('RKS_DELTA_'+module+'_'+r);if(!d||d.full){canMerge=false;break;}if(Array.isArray(d.rows))merged=merged.concat(d.rows);}}
      if(canMerge){
        if(String(s.role||'').toLowerCase()!=='admin'&&module==='leads'){const pid=String(s.profileId||'');merged=merged.filter(function(x){return String(x.referralPartnerId||x.createdByProfileId||'')===pid});}
        const by={};merged.forEach(function(x){if(x&&x.id)by[String(x.id)]=x});out.changes[module]={mode:'merge',rows:Object.keys(by).map(function(k){return by[k]}),revision:cur};
      }else {ss=ss||getBackend_();out.changes[module]={mode:'replace',rows:moduleRowsForSession_(ss,s,module),revision:cur};}
    });
    return out;
  }catch(e){return fail_(e)}
}
function updateObjectFields_(sh,rowNumber,patch){
  if(!sh||rowNumber<2||!patch)return;
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  Object.keys(patch).forEach(function(k){const c=headers.indexOf(k);if(c>=0)sh.getRange(rowNumber,c+1).setValue(toCell_(patch[k]));});
}
function fastVehicleTypes_(ss){
  const key='RKS_V16_VTYPES',hit=cacheJsonGet_(key);if(hit)return hit;
  return cacheJsonPut_(key,vehicleTypeNames_(readRates_(ss)),180);
}
function fastAccessIdentity_(ss,loginToken){
  const token=String(loginToken||''),key='RKS_V16_IDENT_'+token,hit=cacheJsonGet_(key);if(hit)return hit;
  const x=readObjects_(ss.getSheetByName('Riksha_Access')).find(function(r){return String(r.loginToken||'')===token&&String(r.active).toLowerCase()!=='false'});
  if(!x)return null;
  return cacheJsonPut_(key,{displayName:x.displayName,role:x.role,profileType:x.profileType,profileId:x.profileId},180);
}
function invalidateProfileCaches_(ss,profileId){
  try{
    const a=readObjects_(ss.getSheetByName('Riksha_Access')).find(function(x){return String(x.profileId)===String(profileId)});
    if(a&&a.loginToken)cacheRemove_('RKS_V16_IDENT_'+String(a.loginToken));
    const f=readObjects_(ss.getSheetByName('Riksha_Public_Forms')).find(function(x){return String(x.profileId)===String(profileId)});
    if(f&&f.publicToken)cacheRemove_('RKS_V16_PFORM_'+String(f.publicToken));
  }catch(e){}
}

function ensureBackend_(ss){
  ensureSheet_(ss,'Riksha_System',['Key','Value','Updated At']);
  Object.keys(RIKSHA.MODULES).forEach(k=>ensureSheet_(ss,RIKSHA.MODULES[k].sheet,RIKSHA.MODULES[k].preferred));
  ensureSheet_(ss,'Riksha_Rates',['key','type','customerBase','customerKm','partnerBase','partnerKm','capacity','value','id','code','icon','status','sortOrder']);
  ensureSheet_(ss,'Riksha_Access',['id','profileType','profileId','displayName','mobile','role','pin','loginToken','active','permissions','lastLoginAt','createdAt','updatedAt']);
  ensureSheet_(ss,'Riksha_Profile_Timeline',['id','profileType','profileId','category','text','visibility','author','createdAt']);
  ensureSheet_(ss,'Riksha_Public_Forms',['id','profileId','title','loginToken','publicToken','active','notice','createdAt','updatedAt']);
  ensureSheet_(ss,'Riksha_Notice_Reads',['id','noticeId','profileId','readAt']);
  ensureSheet_(ss,'Riksha_Audit_Log',['at','actorId','actorName','action','module','recordId','detail']);
  ensureAdminPublicForm_(ss);
  setMeta_(ss,'version',RIKSHA.VERSION);
}
function ensureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]);styleHeader_(sh,headers.length);}
  else{const current=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0];const missing=headers.filter(h=>current.indexOf(h)<0);if(missing.length)sh.getRange(1,current.length+1,1,missing.length).setValues([missing]);}
  sh.setFrozenRows(1);return sh;
}
function styleHeader_(sh,n){sh.getRange(1,1,1,n).setFontWeight('bold').setBackground('#0b1f38').setFontColor('#fff');}
function seedAdmin_(ss){
  const rows=readObjects_(ss.getSheetByName('Riksha_Access'));
  if(rows.some(x=>String(x.role).toLowerCase()==='admin'))return;
  appendObject_(ss.getSheetByName('Riksha_Access'),{id:'ACCESS-ADMIN',profileType:'Admin',profileId:'ADMIN',displayName:'Administrator',mobile:'',role:'Admin',pin:'4462',loginToken:'ADMIN',active:true,permissions:['*'],lastLoginAt:'',createdAt:now_(),updatedAt:now_()});
}
function setMeta_(ss,key,val){const sh=ss.getSheetByName('Riksha_System');const rows=readObjects_(sh);const i=rows.findIndex(x=>x.Key===key||x.key===key);if(i>=0)sh.getRange(i+2,2,1,2).setValues([[String(val),now_()]]);else sh.appendRow([key,String(val),now_()]);}
function normalizeSheetField_(key,val){
  if(val==null||val==='')return val;
  var k=String(key||'');
  var s=String(val);
  var dateFields={date:1,preferredDate:1,createdDate:1,nextDate:1,startDate:1,endDate:1};
  var timeFields={time:1,preferredTime:1,createdTime:1,pickupTime:1};
  if(dateFields[k]){var dm=s.match(/^(\d{4}-\d{2}-\d{2})/);return dm?dm[1]:s;}
  if(timeFields[k]){var tm=s.match(/T(\d{2}):(\d{2})(?::\d{2})?/);if(tm)return tm[1]+':'+tm[2];tm=s.match(/^(\d{1,2}):(\d{2})/);if(tm)return String(Number(tm[1])).padStart(2,'0')+':'+tm[2];}
  return val;
}
function readObjects_(sh){if(!sh||sh.getLastRow()<2)return [];const v=sh.getDataRange().getValues(),h=v.shift().map(String);return v.filter(r=>r.some(x=>x!==''&&x!=null)).map(r=>{const o={};h.forEach((k,i)=>o[k]=normalizeSheetField_(k,fromCell_(r[i])));return o;});}
function appendObject_(sh,obj){const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];sh.appendRow(h.map(k=>toCell_(obj[k])));}
function writeObjects_(sh,rows,preferred){const keys={};(preferred||[]).forEach(k=>keys[k]=1);(rows||[]).forEach(o=>Object.keys(o||{}).forEach(k=>keys[k]=1));const h=(preferred||[]).concat(Object.keys(keys).filter(k=>(preferred||[]).indexOf(k)<0).sort());sh.clearContents();sh.getRange(1,1,1,h.length).setValues([h]);styleHeader_(sh,h.length);if(rows&&rows.length)sh.getRange(2,1,rows.length,h.length).setValues(rows.map(o=>h.map(k=>toCell_(o[k]))));}
function toCell_(v){if(v==null)return '';if(typeof v==='object')return '@@JSON@@'+JSON.stringify(v);return v;}
function fromCell_(v){
  // google.script.run cannot serialize Date objects. Google Sheets may auto-convert
  // ISO/date-looking strings into real Date cells, so normalize every Date here.
  if(Object.prototype.toString.call(v)==='[object Date]'){
    if(isNaN(v.getTime()))return '';
    return Utilities.formatDate(v,RIKSHA.TZ,"yyyy-MM-dd'T'HH:mm:ss");
  }
  if(typeof v==='string'&&v.indexOf('@@JSON@@')===0){
    var raw=v;
    // Be tolerant of values that were serialized more than once.
    while(typeof raw==='string'&&raw.indexOf('@@JSON@@')===0){
      var body=raw.slice(8);
      try{raw=JSON.parse(body);}catch(e){raw=body;break;}
    }
    return raw;
  }
  return v;
}

function loginAdmin(pin){return loginAccess_('ADMIN',pin,true);}
function loginUser(loginToken,pin){return loginAccess_(loginToken,pin,false);}
function loginAccess_(loginToken,pin,isAdmin){
  try{
    const ss=getBackend_(),sh=ss.getSheetByName('Riksha_Access');
    if(!sh)throw new Error('Access system is not initialized. Run setupRikshaMS() once.');
    const rows=readObjects_(sh);let row,rowIndex=-1;
    if(isAdmin)rowIndex=rows.findIndex(function(x){return String(x.role).toLowerCase()==='admin'});
    else rowIndex=rows.findIndex(function(x){return String(x.loginToken||'')===String(loginToken||'')});
    row=rowIndex>=0?rows[rowIndex]:null;
    if(!row||String(row.active).toLowerCase()==='false')throw new Error('Login access is inactive or invalid.');
    if(!/^\d{4}$/.test(String(pin||'')))throw new Error('PIN must be exactly 4 digits.');
    if(String(row.pin||'')!==String(pin))throw new Error('Invalid PIN.');
    const token=Utilities.getUuid()+'-'+Utilities.getUuid();
    const session={accessId:row.id,profileType:row.profileType,profileId:row.profileId,displayName:row.displayName,role:row.role,permissions:row.permissions||[],loginToken:row.loginToken||'',issuedAt:now_()};
    CacheService.getScriptCache().put('RIKSHA_SESSION_'+token,JSON.stringify(session),RIKSHA.SESSION_TTL);
    const stamp=now_();updateObjectFields_(sh,rowIndex+2,{lastLoginAt:stamp,updatedAt:stamp});
    audit_(ss,session,'LOGIN','access',row.id,'Successful login');
    return {success:true,sessionToken:token,user:session};
  }catch(e){return fail_(e)}
}
function getSession(sessionToken){try{return {success:true,user:requireSession_(sessionToken)}}catch(e){return fail_(e)}}
function logoutSession(token){if(token)CacheService.getScriptCache().remove('RIKSHA_SESSION_'+token);return {success:true};}
function logoutAllProfileSessions(adminToken,profileId){const s=requireAdmin_(adminToken);CacheService.getScriptCache().removeAll([]);audit_(getBackend_(),s,'LOGOUT_ALL','access',profileId,'Session invalidation requested');return {success:true,message:'Existing sessions will expire; PIN/token changes take effect immediately.'};}
function requireSession_(token){if(!token)throw new Error('Please login again.');const raw=CacheService.getScriptCache().get('RIKSHA_SESSION_'+token);if(!raw)throw new Error('Session expired. Please login again.');return JSON.parse(raw);}
function requireAdmin_(token){const s=requireSession_(token);if(String(s.role).toLowerCase()!=='admin')throw new Error('Admin permission required.');return s;}

function agentBootstrap(sessionToken){
  try{
    const s=requireSession_(sessionToken);
    if(String(s.role||'').toLowerCase()==='admin')throw new Error('Agent session required.');
    const ss=getBackend_(),pid=String(s.profileId||''),now=now_();
    const allLeads=readObjects_(ss.getSheetByName('Riksha_Leads'));
    const leads=allLeads.filter(function(x){return String(x.referralPartnerId||x.createdByProfileId||'')===pid});
    const orderIds={};leads.forEach(function(x){if(x.convertedOrderId)orderIds[String(x.convertedOrderId)]=1});
    const orders=readObjects_(ss.getSheetByName('Riksha_Orders')).filter(function(x){return orderIds[String(x.id)]||String(x.partnerId||'')===pid});
    const tx=readObjects_(ss.getSheetByName('Riksha_Transactions')).filter(function(x){return String(x.partyId||'')===pid||orderIds[String(x.orderId)]});
    const notices=readObjects_(ss.getSheetByName('Riksha_Notices')).map(normalizeNotice_).filter(function(x){
      if(!noticeIsLive_(x,now))return false;
      if(String(x.ownerType||'Admin')==='Agent')return String(x.ownerProfileId||'')===pid;
      return noticeTargetsAgent_(x,pid);
    });
    const f=readObjects_(ss.getSheetByName('Riksha_Public_Forms')).find(function(x){return String(x.profileId)===pid})||null;
    const timeline=readObjects_(ss.getSheetByName('Riksha_Profile_Timeline')).filter(function(x){return String(x.profileId)===pid}).slice(0,80);
    const data={rates:{},orders:orders,vehicles:[],labour:[],customers:[],leads:leads,partners:[],transactions:tx,slips:[],daybookClosings:[],vehicleOwners:[],drivers:[],referralPartners:[],notices:notices,vehicleTypes:fastVehicleTypes_(ss),publicForm:f?Object.assign({},f,{publicUrl:publicUrl_(f.publicToken)}):null};
    return {success:true,user:s,data:data,timeline:timeline,loginUrl:loginUrl_(s.loginToken),qrUrl:qrUrl_(loginUrl_(s.loginToken)),revisions:moduleRevisions_(['leads','orders','notices']),at:now_()};
  }catch(e){return fail_(e)}
}

function appLoad(sessionToken){
  try{
    const s=requireSession_(sessionToken),ss=getBackend_();
    ensureBackend_(ss);
    const out={success:true,user:s,data:buildDataFor_(ss,s),version:RIKSHA.VERSION,revisions:moduleRevisions_(),at:now_()};
    if(String(s.role||'').toLowerCase()==='admin'){
      out.accessRows=readObjects_(ss.getSheetByName('Riksha_Access')).map(function(x){return safeAccess_(x);});
    }
    return out;
  }catch(e){return fail_(e)}
}
function saveModules(sessionToken,payload){
  const lock=LockService.getScriptLock();
  try{
    if(!lock.tryLock(8000))throw new Error('System busy. Please retry.');
    const s=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);payload=payload||{};
    const saved=[],revisions={};Object.keys(payload).forEach(k=>{if(!RIKSHA.MODULES[k])return;if(!Array.isArray(payload[k]))throw new Error('Invalid '+k+' data.');writeObjects_(ss.getSheetByName(RIKSHA.MODULES[k].sheet),payload[k],RIKSHA.MODULES[k].preferred);saved.push(k);revisions[k]=publishModuleChange_(k,[],true)});
    if(saved.length){setMeta_(ss,'lastSavedAt',now_());setMeta_(ss,'lastSavedModules',saved.join(','));}
    return {success:true,modules:saved,revisions:revisions,at:now_()};
  }catch(e){return fail_(e)}finally{try{lock.releaseLock()}catch(e){}}
}

function appSave(sessionToken,data){
  const lock=LockService.getScriptLock();
  try{if(!lock.tryLock(15000))throw new Error('System busy. Please retry.');const s=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);validateData_(data);Object.keys(RIKSHA.MODULES).forEach(k=>{writeObjects_(ss.getSheetByName(RIKSHA.MODULES[k].sheet),Array.isArray(data[k])?data[k]:[],RIKSHA.MODULES[k].preferred);publishModuleChange_(k,[],true)});/* Rate Master is saved only by saveRates(). This prevents a stale general autosave from overwriting newly added vehicle types. */setMeta_(ss,'lastSavedAt',now_());audit_(ss,s,'SAVE_APP','all','*','Operational modules saved; Rate Master preserved independently');SpreadsheetApp.flush();return {success:true,at:now_()};}catch(e){return fail_(e)}finally{try{lock.releaseLock()}catch(e){}}
}
function buildDataFor_(ss,s){
  const d={rates:readRates_(ss)};Object.keys(RIKSHA.MODULES).forEach(k=>d[k]=readObjects_(ss.getSheetByName(RIKSHA.MODULES[k].sheet)));
  if(String(s.role).toLowerCase()==='admin'){const forms=readObjects_(ss.getSheetByName('Riksha_Public_Forms'));const af=forms.find(x=>String(x.profileId)==='ADMIN_DIRECT')||null;d.adminPublicForm=af?Object.assign({},af,{publicUrl:publicUrl_(af.publicToken)}):null;d.vehicleTypes=vehicleTypeNames_(d.rates);return d;}
  const pid=String(s.profileId||'');
  d.leads=(d.leads||[]).filter(x=>String(x.referralPartnerId||x.createdByProfileId||'')===pid);
  const orderIds={};d.leads.forEach(x=>{if(x.convertedOrderId)orderIds[x.convertedOrderId]=1});
  d.orders=(d.orders||[]).filter(x=>orderIds[x.id]||String(x.partnerId||'')===pid);
  d.transactions=(d.transactions||[]).filter(x=>String(x.partyId||'')===pid||orderIds[x.orderId]);
  d.slips=(d.slips||[]).filter(x=>orderIds[x.orderId]);
  const now=now_();
  d.notices=(d.notices||[]).map(normalizeNotice_).filter(function(x){
    if(!noticeIsLive_(x,now))return false;
    if(String(x.ownerType||'Admin')==='Agent')return String(x.ownerProfileId||'')===pid;
    return noticeTargetsAgent_(x,pid);
  });
  const forms=readObjects_(ss.getSheetByName('Riksha_Public_Forms'));
  const f=forms.find(x=>String(x.profileId)===pid)||null;
  if(f){d.publicForm=Object.assign({},f,{publicUrl:publicUrl_(f.publicToken)});}else d.publicForm=null;
  d.vehicleTypes=vehicleTypeNames_(d.rates);d.customers=[];d.vehicles=[];d.labour=[];d.rates={};d.partners=[];d.vehicleOwners=[];d.drivers=[];d.referralPartners=[];
  return d;
}
function validateData_(d){if(!d||typeof d!=='object')throw new Error('Invalid data payload.');['orders','leads','transactions','slips'].forEach(k=>{if(d[k]&&!Array.isArray(d[k]))throw new Error('Invalid '+k+' data.');});}

function getAccessUsers(adminToken){
  try{
    requireAdmin_(adminToken);
    const ss=getBackend_();ensureBackend_(ss);
    const sh=ss.getSheetByName('Riksha_Access');
    if(!sh)throw new Error('Riksha_Access sheet is missing. Run setupRikshaMS() once.');
    const rows=readObjects_(sh).map(function(x){return safeAccess_(x);});
    return {success:true,rows:rows,count:rows.length,version:RIKSHA.VERSION,at:now_()};
  }catch(e){return fail_(e)}
}
function saveAccessUser(adminToken,input){
  try{const admin=requireAdmin_(adminToken),ss=getBackend_(),sh=ss.getSheetByName('Riksha_Access'),rows=readObjects_(sh),x=Object.assign({},input||{});if(!x.profileId)throw new Error('Profile ID required.');if(!x.displayName)throw new Error('Display name required.');if(!/^\d{4}$/.test(String(x.pin||'')))throw new Error('PIN must be exactly 4 digits.');let i=rows.findIndex(r=>String(r.id)===String(x.id));if(i<0&&x.profileId)i=rows.findIndex(r=>String(r.profileType||'')===String(x.profileType||'')&&String(r.profileId||'')===String(x.profileId||''));if(i<0){x.id=uid_('ACCESS');x.loginToken=clean_(x.loginToken||uid_('LOGIN'),80);x.createdAt=now_();rows.unshift(x);i=0}else rows[i]=Object.assign({},rows[i],x);rows[i].role=rows[i].role||'Agent';rows[i].active=rows[i].active!==false;rows[i].permissions=rows[i].permissions||['LEAD_CREATE','OWN_PROFILE','OWN_LEADS'];rows[i].updatedAt=now_();writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);ensurePublicForm_(ss,rows[i]);invalidateProfileCaches_(ss,rows[i].profileId);audit_(ss,admin,'SAVE_ACCESS','access',rows[i].id,rows[i].displayName);const saved=safeAccess_(rows[i]);return {success:true,row:saved,rows:readObjects_(sh).map(safeAccess_),loginUrl:saved.loginUrl,qrUrl:saved.qrUrl};}catch(e){return fail_(e)}
}
function setAccessActive(adminToken,id,active){try{const admin=requireAdmin_(adminToken),ss=getBackend_(),sh=ss.getSheetByName('Riksha_Access'),rows=readObjects_(sh),x=rows.find(r=>String(r.id)===String(id));if(!x)throw new Error('Access user not found');x.active=!!active;x.updatedAt=now_();writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);invalidateProfileCaches_(ss,x.profileId);audit_(ss,admin,'ACCESS_STATUS','access',id,String(active));return {success:true}}catch(e){return fail_(e)}}
function resetAccessPin(adminToken,id,newPin){try{requireAdmin_(adminToken);if(!/^\d{4}$/.test(String(newPin||'')))throw new Error('PIN must be exactly 4 digits.');const ss=getBackend_(),sh=ss.getSheetByName('Riksha_Access'),rows=readObjects_(sh),x=rows.find(r=>String(r.id)===String(id));if(!x)throw new Error('Access user not found');x.pin=String(newPin);x.updatedAt=now_();writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);invalidateProfileCaches_(ss,x.profileId);return {success:true}}catch(e){return fail_(e)}}
function downloadAccessQr(adminToken,id){
  try{
    requireAdmin_(adminToken);
    const ss=getBackend_(),rows=readObjects_(ss.getSheetByName('Riksha_Access'));
    const x=rows.find(r=>String(r.id)===String(id));
    if(!x)throw new Error('Access user not found');
    const url=loginUrl_(x.loginToken),qr=qrUrl_(url);
    const res=UrlFetchApp.fetch(qr,{muteHttpExceptions:true,followRedirects:true});
    if(res.getResponseCode()<200||res.getResponseCode()>=300)throw new Error('QR service did not return an image.');
    const blob=res.getBlob();
    return {success:true,fileName:'RikshaMS-'+clean_(x.displayName||x.profileId||'User',60).replace(/[^A-Za-z0-9_-]+/g,'-')+'-Login-QR.png',mimeType:blob.getContentType()||'image/png',base64:Utilities.base64Encode(blob.getBytes()),loginUrl:url};
  }catch(e){return fail_(e)}
}
function safeAccess_(x){const y=Object.assign({},x);delete y.pin;y.loginUrl=loginUrl_(x.loginToken);y.qrUrl=qrUrl_(y.loginUrl);return y;}
function loginUrl_(token){const base=ScriptApp.getService().getUrl()||PropertiesService.getScriptProperties().getProperty('RIKSHA_WEBAPP_URL')||'';return base?base.replace(/\?.*$/,'')+'?token='+encodeURIComponent(String(token||'')):'?token='+encodeURIComponent(String(token||''));}
function publicUrl_(token){const base=ScriptApp.getService().getUrl()||PropertiesService.getScriptProperties().getProperty('RIKSHA_WEBAPP_URL')||'';return base?base.replace(/\?.*$/,'')+'?public='+encodeURIComponent(String(token||'')):'?public='+encodeURIComponent(String(token||''));}
function qrUrl_(url){return 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data='+encodeURIComponent(url);}
function vehicleTypeNames_(rates){const simple={labourCustomer:1,labourPartner:1,waitingPerHour:1,extraStop:1};return Object.keys(rates||{}).filter(k=>!simple[k]&&rates[k]&&typeof rates[k]==='object'&&!Array.isArray(rates[k])&&String(rates[k].status||'Active')!=='Inactive').sort((a,b)=>Number((rates[a]||{}).sortOrder||0)-Number((rates[b]||{}).sortOrder||0)||a.localeCompare(b));}
function ensureAdminPublicForm_(ss){const sh=ss.getSheetByName('Riksha_Public_Forms');if(!sh)return;const rows=readObjects_(sh);if(rows.some(x=>String(x.profileId)==='ADMIN_DIRECT'))return;rows.unshift({id:'FORM-ADMIN-DIRECT',profileId:'ADMIN_DIRECT',title:'Transport Enquiry',loginToken:'',publicToken:uid_('PUBLIC'),active:true,notice:'',createdAt:now_(),updatedAt:now_()});writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);}
function updateAdminPublicForm(sessionToken,input){try{const s=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);ensureAdminPublicForm_(ss);const sh=ss.getSheetByName('Riksha_Public_Forms'),rows=readObjects_(sh);let f=rows.find(x=>String(x.profileId)==='ADMIN_DIRECT');const x=input||{};if(Object.prototype.hasOwnProperty.call(x,'active'))f.active=!!x.active;if(x.title!=null)f.title=clean_(x.title,120)||'Transport Enquiry';if(x.notice!=null)f.notice=clean_(x.notice,1000);f.updatedAt=now_();writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);cacheRemove_('RKS_V16_PFORM_'+String(f.publicToken||''));audit_(ss,s,'ADMIN_PUBLIC_FORM_UPDATE','publicForm',f.id,f.title);return {success:true,form:Object.assign({},f,{publicUrl:publicUrl_(f.publicToken)})};}catch(e){return fail_(e)}}
function getAdminPublicForm(sessionToken){try{requireAdmin_(sessionToken);const ss=getBackend_();ensureBackend_(ss);ensureAdminPublicForm_(ss);const f=readObjects_(ss.getSheetByName('Riksha_Public_Forms')).find(x=>String(x.profileId)==='ADMIN_DIRECT');return {success:true,form:Object.assign({},f,{publicUrl:publicUrl_(f.publicToken)})};}catch(e){return fail_(e)}}
function saveDaybookClosing(sessionToken,input){try{const s=requireAdmin_(sessionToken),ss=getBackend_(),sh=ss.getSheetByName('Riksha_Daybook_Closings'),rows=readObjects_(sh),x=Object.assign({},input||{});if(!clean_(x.date,30))throw new Error('Date is required.');let r=rows.find(v=>String(v.date)===String(x.date));if(!r){r={id:uid_('DBCLOSE'),date:x.date};rows.unshift(r)}['cash','bank','esewa','khalti','other','total'].forEach(k=>r[k]=Number(x[k]||0));r.verifiedBy=s.displayName;r.verifiedAt=now_();r.note=clean_(x.note,500);r._updatedAt=now_();writeObjects_(sh,rows,RIKSHA.MODULES.daybookClosings.preferred);audit_(ss,s,'DAYBOOK_CLOSE','daybookClosings',r.id,r.date);return {success:true,closing:r};}catch(e){return fail_(e)}}
function ensurePublicForm_(ss,a){const sh=ss.getSheetByName('Riksha_Public_Forms'),rows=readObjects_(sh);if(rows.some(x=>String(x.profileId)===String(a.profileId)))return;rows.unshift({id:uid_('FORM'),profileId:a.profileId,title:a.displayName+' Referral Form',loginToken:a.loginToken,publicToken:uid_('PUBLIC'),active:true,notice:'',createdAt:now_(),updatedAt:now_()});writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);}

function agentCreateLead(sessionToken,input){
  const lock=LockService.getScriptLock();try{
    if(!lock.tryLock(10000))throw new Error('System busy.');const s=requireSession_(sessionToken);if(String(s.role).toLowerCase()==='admin')throw new Error('Use Admin Leads screen.');
    const ss=getBackend_(),sh=ss.getSheetByName('Riksha_Leads'),x=Object.assign({},input||{});if(!clean_(x.name)||!clean_(x.phone)||!clean_(x.pickup)||!clean_(x.drop))throw new Error('Name, phone, pickup and drop are required.');
    x.id=nextFastId_(sh,'leads','ENQ',1000);x.status='New Enquiry';x.source='Referral';x.referralPartnerId=s.profileId;x.referralPartnerName=s.displayName;x.createdByProfileId=s.profileId;x.createdAt=now_();x.quoteHistory=[];x.followups=[];x.timeline=[{at:now_(),text:'Enquiry created by '+s.displayName}];
    appendObject_(sh,x);const revision=publishModuleChange_('leads',[x],false);audit_(ss,s,'CREATE_LEAD','leads',x.id,x.name);return {success:true,lead:x,revision:revision};
  }catch(e){return fail_(e)}finally{try{lock.releaseLock()}catch(e){}}
}
function agentAddProfileNote(sessionToken,text){try{const s=requireSession_(sessionToken),ss=getBackend_(),sh=ss.getSheetByName('Riksha_Profile_Timeline'),rows=readObjects_(sh);const t=clean_(text,1000);if(!t)throw new Error('Note is required.');rows.unshift({id:uid_('NOTE'),profileType:s.profileType,profileId:s.profileId,category:'Note',text:t,visibility:'Admin+Self',author:s.displayName,createdAt:now_()});writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);return {success:true}}catch(e){return fail_(e)}}
function getMyProfile(sessionToken){try{const s=requireSession_(sessionToken),ss=getBackend_(),timeline=readObjects_(ss.getSheetByName('Riksha_Profile_Timeline')).filter(x=>String(x.profileId)===String(s.profileId));const data=buildDataFor_(ss,s);return {success:true,user:s,timeline:timeline,data:data,loginUrl:loginUrl_(s.loginToken),qrUrl:qrUrl_(loginUrl_(s.loginToken))}}catch(e){return fail_(e)}}

function updateMyPublicForm(sessionToken,input){
  try{const s=requireSession_(sessionToken);if(String(s.role).toLowerCase()==='admin')throw new Error('Operational user required.');const ss=getBackend_(),sh=ss.getSheetByName('Riksha_Public_Forms'),rows=readObjects_(sh);let f=rows.find(x=>String(x.profileId)===String(s.profileId));if(!f){f={id:uid_('FORM'),profileId:s.profileId,title:s.displayName+' Referral Form',loginToken:s.loginToken,publicToken:uid_('PUBLIC'),active:true,notice:'',createdAt:now_()};rows.unshift(f)}const x=input||{};if(Object.prototype.hasOwnProperty.call(x,'active'))f.active=!!x.active;if(x.title!=null)f.title=clean_(x.title,120)||f.title;if(x.notice!=null)f.notice=clean_(x.notice,1000);f.updatedAt=now_();writeObjects_(sh,rows,sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]);cacheRemove_('RKS_V16_PFORM_'+String(f.publicToken||''));audit_(ss,s,'PUBLIC_FORM_UPDATE','publicForm',f.id,f.title);return {success:true,form:Object.assign({},f,{publicUrl:publicUrl_(f.publicToken)})};}catch(e){return fail_(e)}
}
function getPublicForm(publicToken){return getPublicFormFast(publicToken);}
function noticeTargets_(x){var a=Array.isArray(x&&x.targets)?x.targets:[];if(!a.length){var legacy=String(x&&x.displayTarget||'');if(legacy)a=[legacy];else a=['Agent Dashboard'];}return a.map(String);}
function normalizeNotice_(input){
  const x=Object.assign({},input||{}),allowedDisplay=['Banner','Marquee','Highlight Card','Sticky Strip','Popup'],allowedSemantic=['info','success','warning','danger','custom'],allowedPriority=['Normal','Important','Critical'],allowedSpeed=['Slow','Normal','Fast'];
  x.title=clean_(x.title,160);x.text=clean_(x.text,1800);x.audience=x.audience||'All Agents';x.profileIds=Array.isArray(x.profileIds)?x.profileIds:[];x.targets=noticeTargets_(x);
  x.displayType=allowedDisplay.indexOf(String(x.displayType))>=0?String(x.displayType):'Banner';x.semanticType=allowedSemantic.indexOf(String(x.semanticType))>=0?String(x.semanticType):'info';
  x.customColor=clean_(x.customColor||'#1268f3',20);x.textColor=clean_(x.textColor||'',20);x.icon=clean_(x.icon||'🔔',20);x.priority=allowedPriority.indexOf(String(x.priority))>=0?String(x.priority):'Normal';
  x.startAt=clean_(x.startAt||'',40);x.endAt=clean_(x.endAt||'',40);x.active=x.active!==false&&String(x.active).toLowerCase()!=='false';x.dismissible=x.dismissible!==false&&String(x.dismissible).toLowerCase()!=='false';
  x.ctaText=clean_(x.ctaText||'',80);x.ctaAction=clean_(x.ctaAction||'',500);x.marqueeSpeed=allowedSpeed.indexOf(String(x.marqueeSpeed))>=0?String(x.marqueeSpeed):'Normal';x.sortOrder=Math.max(0,Number(x.sortOrder)||0);
  x.ownerType=String(x.ownerType||'Admin')==='Agent'?'Agent':'Admin';x.ownerProfileId=clean_(x.ownerProfileId||'',120);x.archived=x.archived===true||String(x.archived).toLowerCase()==='true';
  return x;
}
function noticeIsLive_(x,at){x=normalizeNotice_(x);if(x.archived||!x.active)return false;const now=String(at||now_());if(x.startAt&&String(x.startAt)>now)return false;if(x.endAt&&String(x.endAt)<now)return false;return true;}
function noticePriorityRank_(p){return String(p)==='Critical'?3:String(p)==='Important'?2:1;}
function noticeSort_(a,b){return noticePriorityRank_(b.priority)-noticePriorityRank_(a.priority)||(String(a.ownerType||'Admin')==='Admin'?0:1)-(String(b.ownerType||'Admin')==='Admin'?0:1)||(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)||String(b.createdAt||'').localeCompare(String(a.createdAt||''));}
function noticeTargetsAgent_(x,pid){x=normalizeNotice_(x);const targets=noticeTargets_(x),aud=String(x.audience||'All Agents'),ids=(x.profileIds||[]).map(String),targeted=(aud==='All Agents'||aud==='All'||ids.indexOf(String(pid))>=0);return targeted&&(targets.indexOf('Agent Dashboard')>=0||targets.indexOf('Agent Public Form')>=0);}
function publicNoticesForForm_(ss,f){
  const rev=moduleRevision_('notices'),token=String(f.publicToken||''),key='RKS_V21_PNOTICE_'+token+'_'+rev,hit=cacheJsonGet_(key);if(hit)return hit;
  const direct=String(f.profileId)==='ADMIN_DIRECT',pid=String(f.profileId||''),now=now_();
  const rows=readObjects_(ss.getSheetByName('Riksha_Notices')).map(normalizeNotice_).filter(function(x){
    if(!noticeIsLive_(x,now))return false;
    const targets=noticeTargets_(x);
    if(String(x.ownerType||'Admin')==='Agent')return !direct&&String(x.ownerProfileId||'')===pid&&targets.indexOf('Agent Public Form')>=0;
    if(direct)return targets.indexOf('Direct Public Form')>=0;
    if(targets.indexOf('Agent Public Form')<0)return false;
    const aud=String(x.audience||'All Agents'),ids=(x.profileIds||[]).map(String);return aud==='All Agents'||aud==='All'||ids.indexOf(pid)>=0;
  }).sort(noticeSort_);
  return cacheJsonPut_(key,rows,300);
}
function getPublicFormFast(publicToken){
  try{
    const token=String(publicToken||''),key='RKS_V16_PFORM_'+token,cached=cacheJsonGet_(key),ss=getBackend_();
    if(cached){cached.publicToken=cached.publicToken||token;cached.vehicleTypes=fastVehicleTypes_(ss);cached.notices=publicNoticesForForm_(ss,cached);cached.noticeRevision=moduleRevision_('notices');return {success:true,form:cached,cached:true};}
    const forms=readObjects_(ss.getSheetByName('Riksha_Public_Forms')),f=forms.find(function(x){return String(x.publicToken||'')===token});
    if(!f||String(f.active).toLowerCase()==='false')throw new Error('This public form is disabled or invalid.');
    const direct=String(f.profileId)==='ADMIN_DIRECT';
    const access=direct?null:readObjects_(ss.getSheetByName('Riksha_Access')).find(function(x){return String(x.profileId)===String(f.profileId)});
    const base={id:f.id,title:f.title||'Transport Enquiry',notice:f.notice||'',displayName:direct?'RikshaMS':(access&&access.displayName||'Transport Partner'),profileId:f.profileId,isDirect:direct,publicToken:f.publicToken};
    cacheJsonPut_(key,base,300);
    const form=Object.assign({},base,{vehicleTypes:fastVehicleTypes_(ss),notices:publicNoticesForForm_(ss,f),noticeRevision:moduleRevision_('notices')});
    return {success:true,form:form,cached:false};
  }catch(e){return fail_(e)}
}
function getPublicNoticeChanges(publicToken,knownRevision){
  try{const current=moduleRevision_('notices');if(Number(knownRevision||0)===current)return {success:true,changed:false,revision:current};const fr=getPublicFormFast(publicToken);if(!fr||!fr.success)return fr;return {success:true,changed:true,revision:current,notices:(fr.form&&fr.form.notices)||[]};}catch(e){return fail_(e)}
}
function submitPublicLead(publicToken,input){
  const lock=LockService.getScriptLock();try{
    if(!lock.tryLock(10000))throw new Error('System busy. Please retry.');
    const ss=getBackend_(),fr=getPublicFormFast(publicToken);if(!fr||!fr.success)throw new Error(fr&&fr.message||'This public form is disabled or invalid.');const f=fr.form||{},sh=ss.getSheetByName('Riksha_Leads'),recent=readRecentObjects_(sh,120),x=Object.assign({},input||{});if(!clean_(x.name)||!clean_(x.phone)||!clean_(x.pickup)||!clean_(x.drop))throw new Error('Name, phone, pickup and drop are required.');
    const normalizedPhone=clean_(x.phone,40).replace(/\s+/g,'');
    const dup=recent.find(function(r){if(clean_(r.phone,40).replace(/\s+/g,'')!==normalizedPhone)return false;if(clean_(r.pickup,120).toLowerCase()!==clean_(x.pickup,120).toLowerCase())return false;if(clean_(r.drop,120).toLowerCase()!==clean_(x.drop,120).toLowerCase())return false;var t=Date.parse(String(r.createdAt||'').replace(' ','T'));return isFinite(t)&&(Date.now()-t)<5*60*1000;});
    if(dup)return {success:true,leadId:dup.id,duplicate:true,message:'A similar enquiry was already submitted recently.',revision:moduleRevision_('leads')};
    x.id=nextFastId_(sh,'leads','ENQ',1000);x.status='New Enquiry';const direct=!!f.isDirect;x.source=direct?'Direct Public Form':'Public Referral Form';x.referralPartnerId=direct?'':f.profileId;x.referralPartnerName=direct?'':(f.displayName||'');x.createdByProfileId=direct?'ADMIN_DIRECT':f.profileId;x.createdAt=now_();x.quoteHistory=[];x.followups=[];x.timeline=[{at:now_(),text:direct?'Enquiry submitted from direct public form':'Enquiry submitted from public referral form'}];appendObject_(sh,x);const revision=publishModuleChange_('leads',[x],false);return {success:true,leadId:x.id,lead:x,revision:revision};
  }catch(e){return fail_(e)}finally{try{lock.releaseLock()}catch(e){}}
}
function saveNoticeAdmin(sessionToken,input){
  try{
    const actor=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);const sh=ss.getSheetByName('Riksha_Notices'),rows=readObjects_(sh).map(normalizeNotice_),raw=Object.assign({},input||{});if(!clean_(raw.title)||!clean_(raw.text))throw new Error('Notice title and text are required.');
    let i=raw.id?rows.findIndex(function(n){return String(n.id)===String(raw.id)}):-1,old=i>=0?rows[i]:null;if(old&&String(old.ownerType||'Admin')==='Agent')throw new Error('Agent-owned notices can be disabled or archived by Admin, but not edited.');let x=normalizeNotice_(Object.assign({},old||{},raw));x.id=x.id||uid_('NOTICE');x.ownerType='Admin';x.ownerProfileId='';x.createdAt=(old&&old.createdAt)||x.createdAt||now_();x.updatedAt=now_();x.createdBy=(old&&old.createdBy)||actor.displayName;x.archived=false;
    if(String(x.audience)==='Selected Agents'&&!x.profileIds.length)throw new Error('Select at least one agent.');
    if(i>=0)rows[i]=x;else rows.unshift(x);writeObjects_(sh,rows,RIKSHA.MODULES.notices.preferred);const revision=publishModuleChange_('notices',[],true);audit_(ss,actor,old?'NOTICE_UPDATE':'NOTICE_CREATE','notices',x.id,x.title);return {success:true,notice:x,revision:revision};
  }catch(e){return fail_(e)}
}
function setNoticeActive(sessionToken,id,active){
  try{const actor=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);const sh=ss.getSheetByName('Riksha_Notices'),rows=readObjects_(sh).map(normalizeNotice_),x=rows.find(n=>String(n.id)===String(id));if(!x)throw new Error('Notice not found.');x.active=!!active;x.updatedAt=now_();writeObjects_(sh,rows,RIKSHA.MODULES.notices.preferred);const revision=publishModuleChange_('notices',[],true);audit_(ss,actor,'NOTICE_STATUS','notices',id,String(active));return {success:true,notice:x,revision:revision};}catch(e){return fail_(e)}
}
function archiveNoticeAdmin(sessionToken,id){
  try{const actor=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);const sh=ss.getSheetByName('Riksha_Notices'),rows=readObjects_(sh).map(normalizeNotice_),x=rows.find(n=>String(n.id)===String(id));if(!x)throw new Error('Notice not found.');x.active=false;x.archived=true;x.updatedAt=now_();writeObjects_(sh,rows,RIKSHA.MODULES.notices.preferred);const revision=publishModuleChange_('notices',[],true);audit_(ss,actor,'NOTICE_ARCHIVE','notices',id,x.title);return {success:true,notice:x,revision:revision};}catch(e){return fail_(e)}
}
function saveMyFormNotice(sessionToken,input){
  try{
    const actor=requireSession_(sessionToken);if(String(actor.role||'').toLowerCase()==='admin')throw new Error('Operational user required.');const ss=getBackend_();ensureBackend_(ss);const sh=ss.getSheetByName('Riksha_Notices'),rows=readObjects_(sh).map(normalizeNotice_),raw=Object.assign({},input||{});if(!clean_(raw.title)||!clean_(raw.text))throw new Error('Notice title and text are required.');
    let i=raw.id?rows.findIndex(function(n){return String(n.id)===String(raw.id)&&String(n.ownerProfileId||'')===String(actor.profileId)}):-1,old=i>=0?rows[i]:null,x=normalizeNotice_(Object.assign({},old||{},raw));x.id=x.id||uid_('NOTICE');x.ownerType='Agent';x.ownerProfileId=actor.profileId;x.audience='Own Public Form';x.profileIds=[actor.profileId];x.targets=['Agent Public Form'];x.priority=String(x.priority)==='Important'?'Important':'Normal';if(x.displayType==='Popup')x.displayType='Banner';x.createdAt=(old&&old.createdAt)||x.createdAt||now_();x.updatedAt=now_();x.createdBy=(old&&old.createdBy)||actor.displayName;x.archived=false;
    if(x.active){const activeCount=rows.filter(function(n){return String(n.ownerType)==='Agent'&&String(n.ownerProfileId)===String(actor.profileId)&&!n.archived&&n.active&&String(n.id)!==String(x.id)}).length;if(activeCount>=2)throw new Error('Only two active form notices are allowed. Disable one notice first.');}
    if(i>=0)rows[i]=x;else rows.unshift(x);writeObjects_(sh,rows,RIKSHA.MODULES.notices.preferred);const revision=publishModuleChange_('notices',[],true);audit_(ss,actor,old?'FORM_NOTICE_UPDATE':'FORM_NOTICE_CREATE','notices',x.id,x.title);return {success:true,notice:x,revision:revision};
  }catch(e){return fail_(e)}
}
function setMyFormNoticeActive(sessionToken,id,active){
  try{const actor=requireSession_(sessionToken);if(String(actor.role||'').toLowerCase()==='admin')throw new Error('Operational user required.');const ss=getBackend_();ensureBackend_(ss);const sh=ss.getSheetByName('Riksha_Notices'),rows=readObjects_(sh).map(normalizeNotice_),x=rows.find(function(n){return String(n.id)===String(id)&&String(n.ownerProfileId||'')===String(actor.profileId)});if(!x)throw new Error('Notice not found.');if(active){const c=rows.filter(function(n){return String(n.ownerType)==='Agent'&&String(n.ownerProfileId)===String(actor.profileId)&&!n.archived&&n.active&&String(n.id)!==String(x.id)}).length;if(c>=2)throw new Error('Only two active form notices are allowed.');}x.active=!!active;x.updatedAt=now_();writeObjects_(sh,rows,RIKSHA.MODULES.notices.preferred);const revision=publishModuleChange_('notices',[],true);audit_(ss,actor,'FORM_NOTICE_STATUS','notices',id,String(active));return {success:true,notice:x,revision:revision};}catch(e){return fail_(e)}
}
function archiveMyFormNotice(sessionToken,id){
  try{const actor=requireSession_(sessionToken);if(String(actor.role||'').toLowerCase()==='admin')throw new Error('Operational user required.');const ss=getBackend_();ensureBackend_(ss);const sh=ss.getSheetByName('Riksha_Notices'),rows=readObjects_(sh).map(normalizeNotice_),x=rows.find(function(n){return String(n.id)===String(id)&&String(n.ownerProfileId||'')===String(actor.profileId)});if(!x)throw new Error('Notice not found.');x.active=false;x.archived=true;x.updatedAt=now_();writeObjects_(sh,rows,RIKSHA.MODULES.notices.preferred);const revision=publishModuleChange_('notices',[],true);audit_(ss,actor,'FORM_NOTICE_ARCHIVE','notices',id,x.title);return {success:true,notice:x,revision:revision};}catch(e){return fail_(e)}
}
function nextId_(rows,prefix,base){let m=Number(base||0);(rows||[]).forEach(x=>{const n=Number(String(x.id||'').replace(/\D/g,''));if(n>m)m=n});return prefix+'-'+(m+1);}
function audit_(ss,s,action,module,id,detail){try{ss.getSheetByName('Riksha_Audit_Log').appendRow([now_(),s&&s.profileId||'',s&&s.displayName||'',action,module,id||'',clean_(detail,1000)])}catch(e){}}
function saveRates(sessionToken,rates){
  const lock=LockService.getScriptLock();
  try{
    if(!lock.tryLock(10000))throw new Error('System busy. Please retry.');
    const s=requireAdmin_(sessionToken),ss=getBackend_();ensureBackend_(ss);
    const clean=sanitizeRates_(rates||{});
    writeRates_(ss,clean);
    cacheRemove_('RKS_V16_VTYPES');
    setMeta_(ss,'ratesUpdatedAt',now_());
    audit_(ss,s,'SAVE_RATES','rates','*','Pricing master updated');
    SpreadsheetApp.flush();
    return {success:true,rates:clean,at:now_()};
  }catch(e){return fail_(e)}finally{try{lock.releaseLock()}catch(e){}}
}
function sanitizeRates_(rates){
  const simple=['labourCustomer','labourPartner','waitingPerHour','extraStop'],out={},n=v=>Math.max(0,Number(v)||0);
  Object.keys(rates||{}).forEach(function(k){if(simple.indexOf(k)>=0)return;const x=rates[k];if(!x||typeof x!=='object'||Array.isArray(x))return;const name=clean_(k,80);if(!name)return;out[name]={id:clean_(x.id||('TYPE-'+name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'')),80),code:clean_(x.code||'',50),icon:clean_(x.icon||'🚚',10),status:String(x.status||'Active')==='Inactive'?'Inactive':'Active',sortOrder:n(x.sortOrder),customerBase:n(x.customerBase),customerKm:n(x.customerKm),partnerBase:n(x.partnerBase),partnerKm:n(x.partnerKm),capacity:clean_(x.capacity||'',80)};});
  if(!Object.keys(out).length){[['Rickshaw','RICKSHAW','🛺'],['Hatti Gadi','HATTI-GADI','🚚'],['Mini Truck','MINI-TRUCK','🚛']].forEach((a,i)=>out[a[0]]={id:'TYPE-'+a[1],code:a[1],icon:a[2],status:'Active',sortOrder:i+1,customerBase:0,customerKm:0,partnerBase:0,partnerKm:0,capacity:''});}
  simple.forEach(function(k){out[k]=n(rates&&rates[k]);});return out;
}
function writeRates_(ss,rates){const sh=ss.getSheetByName('Riksha_Rates'),h=['key','type','customerBase','customerKm','partnerBase','partnerKm','capacity','value','id','code','icon','status','sortOrder'],rows=[];const clean=sanitizeRates_(rates||{});Object.keys(clean).forEach(k=>{const v=clean[k];if(v&&typeof v==='object'&&!Array.isArray(v))rows.push([k,'vehicle',v.customerBase||0,v.customerKm||0,v.partnerBase||0,v.partnerKm||0,v.capacity||'','',v.id||'',v.code||'',v.icon||'🚚',v.status||'Active',v.sortOrder||0]);else rows.push([k,'simple','','','','','',v,'','','','',''])});sh.clearContents();sh.getRange(1,1,1,h.length).setValues([h]);styleHeader_(sh,h.length);if(rows.length)sh.getRange(2,1,rows.length,h.length).setValues(rows);}
function readRates_(ss){const sh=ss.getSheetByName('Riksha_Rates');if(!sh||sh.getLastRow()<2)return sanitizeRates_({});const cols=Math.max(13,sh.getLastColumn()),v=sh.getRange(2,1,sh.getLastRow()-1,cols).getValues(),r={};v.forEach(x=>{const k=String(x[0]||'');if(!k)return;if(String(x[1])==='vehicle')r[k]={customerBase:Number(x[2]||0),customerKm:Number(x[3]||0),partnerBase:Number(x[4]||0),partnerKm:Number(x[5]||0),capacity:String(x[6]||''),id:String(x[8]||('TYPE-'+k.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,''))),code:String(x[9]||''),icon:String(x[10]||'🚚'),status:String(x[11]||'Active')==='Inactive'?'Inactive':'Active',sortOrder:Number(x[12]||0)};else r[k]=typeof x[7]==='number'?x[7]:Number(x[7])||x[7]});return sanitizeRates_(r);}

function backupEverything(spreadsheetId,data,source,clientMeta){try{const ss=getBackend_();ensureBackend_(ss);Object.keys(RIKSHA.MODULES).forEach(k=>writeObjects_(ss.getSheetByName(RIKSHA.MODULES[k].sheet),Array.isArray((data||{})[k])?(data||{})[k]:[],RIKSHA.MODULES[k].preferred));writeRates_(ss,(data||{}).rates||{});return {success:true,message:'Saved',at:now_(),revision:1}}catch(e){return fail_(e)}}
function restoreEverything(){try{const ss=getBackend_(),d={rates:readRates_(ss)};Object.keys(RIKSHA.MODULES).forEach(k=>d[k]=readObjects_(ss.getSheetByName(RIKSHA.MODULES[k].sheet)));return {success:true,data:d,hasData:true,at:now_(),revision:1}}catch(e){return fail_(e)}}
function verifyAdminPin(sessionToken,pin){try{requireAdmin_(sessionToken);const ss=getBackend_(),rows=readObjects_(ss.getSheetByName('Riksha_Access')),a=rows.find(x=>String(x.role).toLowerCase()==='admin');if(!a||String(a.pin)!==String(pin||''))throw new Error('Invalid override PIN');return {success:true}}catch(e){return fail_(e)}}
function getLoginIdentity(loginToken){try{const ss=getBackend_(),identity=fastAccessIdentity_(ss,loginToken);if(!identity)throw new Error('Invalid or inactive login link.');return {success:true,identity:identity,cached:true}}catch(e){return fail_(e)}}

/* V10 lightweight live refresh: keeps Leads/Agent workspace fresh without reloading every module. */
function livePulse(sessionToken,page){
  try{
    const s=requireSession_(sessionToken),ss=getBackend_(),role=String(s.role||'').toLowerCase(),p=String(page||'dashboard');
    if(role==='admin'){
      const out={success:true,at:now_()};
      if(['dashboard','orders','dispatch','profile'].indexOf(p)>=0)out.orders=readObjects_(ss.getSheetByName('Riksha_Orders'));
      if(['leads','dashboard'].indexOf(p)>=0)out.leads=readObjects_(ss.getSheetByName('Riksha_Leads'));
      if(['fleet','dispatch','profile'].indexOf(p)>=0){out.vehicles=readObjects_(ss.getSheetByName('Riksha_Vehicles'));out.labour=readObjects_(ss.getSheetByName('Riksha_Labour'));out.partners=readObjects_(ss.getSheetByName('Riksha_Partners'));out.vehicleOwners=readObjects_(ss.getSheetByName('Riksha_Vehicle_Owners'));out.drivers=readObjects_(ss.getSheetByName('Riksha_Drivers'));}
      if(['receive','pay','daybook','accounts'].indexOf(p)>=0)out.transactions=readObjects_(ss.getSheetByName('Riksha_Transactions'));
      if(['dashboard','leads','access','settings'].indexOf(p)>=0)out.notices=readObjects_(ss.getSheetByName('Riksha_Notices'));
      if(['access','settings'].indexOf(p)>=0){ensureAdminPublicForm_(ss);const af=readObjects_(ss.getSheetByName('Riksha_Public_Forms')).find(x=>String(x.profileId)==='ADMIN_DIRECT')||null;out.adminPublicForm=af?Object.assign({},af,{publicUrl:publicUrl_(af.publicToken)}):null;}
      return out;
    }
    const leads=readObjects_(ss.getSheetByName('Riksha_Leads')),notices=readObjects_(ss.getSheetByName('Riksha_Notices')),pid=String(s.profileId||''),mine=leads.filter(x=>String(x.referralPartnerId||x.createdByProfileId||'')===pid),ids={};mine.forEach(x=>{if(x.convertedOrderId)ids[x.convertedOrderId]=1});
    const orders=readObjects_(ss.getSheetByName('Riksha_Orders')).filter(x=>ids[x.id]||String(x.partnerId||'')===pid),now=now_(),myNotices=notices.filter(x=>String(x.active).toLowerCase()!=='false').filter(x=>{const aud=String(x.audience||'All Agents'),a=Array.isArray(x.profileIds)?x.profileIds:[];return aud==='All Agents'||aud==='All'||a.map(String).indexOf(pid)>=0}).filter(x=>(!x.startAt||String(x.startAt)<=now)&&(!x.endAt||String(x.endAt)>=now));
    const f=readObjects_(ss.getSheetByName('Riksha_Public_Forms')).find(x=>String(x.profileId)===pid)||null;
    return {success:true,leads:mine,orders:orders,notices:myNotices,publicForm:f?Object.assign({},f,{publicUrl:publicUrl_(f.publicToken)}):null,at:now_()};
  }catch(e){return fail_(e)}
}