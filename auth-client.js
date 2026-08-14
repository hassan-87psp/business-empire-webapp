/* Business Empire Auth Client v9 — Supabase Auth + owner/collaborator roles. */
(function(){
  'use strict';
  const cfg = window.BUSINESS_EMPIRE_CONFIG || {};
  const base = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const key = String(cfg.supabaseAnonKey || '');
  const siteUrl = String(cfg.siteUrl || (location.origin + location.pathname));
  const SESSION_KEY = 'be:auth-session:v6';
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(base) && key.length > 20;
  let session = null;
  let user = null;
  let profile = null;
  let businessIds = [];
  let callbackType = null;
  let callbackError = null;

  function jsonSafe(raw, fallback=null){ try{return JSON.parse(raw)}catch(_){return fallback} }
  function authHeaders(token, extra){
    return Object.assign({'apikey':key,'Content-Type':'application/json'}, token ? {'Authorization':'Bearer '+token} : {}, extra||{});
  }
  function restHeaders(extra){
    const token=getAccessToken();
    return Object.assign({'apikey':key,'Authorization':'Bearer '+token,'Content-Type':'application/json'}, extra||{});
  }
  async function request(url, opts={}){
    const res = await fetch(url, opts);
    let body = null;
    const txt = await res.text();
    if(txt){ try{ body=JSON.parse(txt) }catch(_){ body=txt } }
    if(!res.ok){
      const msg = (body && (body.msg || body.message || body.error_description || body.error)) || ('Request failed ('+res.status+')');
      const err = new Error(msg); err.status=res.status; err.body=body; throw err;
    }
    return body;
  }
  function normalizeSession(s){
    if(!s) return null;
    const expiresIn = Number(s.expires_in || 3600);
    return Object.assign({}, s, {expires_at: Number(s.expires_at || (Math.floor(Date.now()/1000)+expiresIn))});
  }
  function saveSession(s){ session=normalizeSession(s); if(session) localStorage.setItem(SESSION_KEY,JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); }
  function clearSession(){ session=null; user=null; profile=null; businessIds=[]; callbackType=null; localStorage.removeItem(SESSION_KEY); }
  function getAccessToken(){ return session && session.access_token ? session.access_token : ''; }
  function getUserId(){ return user?.id || session?.user?.id || ''; }
  function getUser(){ return user || session?.user || null; }
  function getProfile(){ return profile; }
  function getBusinessIds(){ return [...businessIds]; }
  function isOwner(){ return profile?.role === 'owner'; }
  function isAuthenticated(){ return !!getAccessToken() && !!getUserId(); }

  function parseCallback(){
    const hash = new URLSearchParams((location.hash||'').replace(/^#/,''));
    const query = new URLSearchParams(location.search||'');
    const params = hash.has('access_token') || hash.has('error') ? hash : query;
    const forceInvite = query.get('be_invite') === '1';
    const err = params.get('error_description') || params.get('error');
    if(err){ callbackError = decodeURIComponent(String(err).replace(/\+/g,' ')); return; }
    const at=params.get('access_token'), rt=params.get('refresh_token');
    if(at){
      callbackType=forceInvite ? 'invite' : (params.get('type') || 'auth');
      saveSession({access_token:at, refresh_token:rt||'', expires_in:Number(params.get('expires_in')||3600), token_type:params.get('token_type')||'bearer'});
      try{ history.replaceState({},document.title,location.pathname); }catch(_){}
    }
  }
  async function fetchUser(){
    if(!getAccessToken()) return null;
    user = await request(base+'/auth/v1/user',{headers:authHeaders(getAccessToken(),{'Content-Type':'application/json'})});
    session.user=user; saveSession(session); return user;
  }
  async function refreshSession(){
    if(!session?.refresh_token) throw new Error('Session expired');
    const data=await request(base+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:authHeaders(null),body:JSON.stringify({refresh_token:session.refresh_token})
    });
    saveSession(data); user=data.user||null; return session;
  }
  async function ensureFresh(){
    if(!session) return null;
    const now=Math.floor(Date.now()/1000);
    if(!session.expires_at || session.expires_at-now < 90){ await refreshSession(); }
    if(!user) await fetchUser();
    return session;
  }
  async function fetchProfile(){
    const uid=getUserId(); if(!uid) return null;
    const rows=await request(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(uid)+'&select=id,email,name,phone,role,status,last_sign_in_at,created_at&limit=1',{headers:restHeaders()});
    profile=Array.isArray(rows)&&rows[0] ? rows[0] : null;
    return profile;
  }
  async function fetchAccess(){
    const uid=getUserId(); if(!uid){businessIds=[];return []}
    if(isOwner()){businessIds=[];return []}
    const rows=await request(base+'/rest/v1/business_access?user_id=eq.'+encodeURIComponent(uid)+'&select=business_id',{headers:restHeaders()});
    businessIds=(rows||[]).map(r=>r.business_id); return getBusinessIds();
  }
  async function activateMyProfile(){
    if(!isAuthenticated()) return;
    try{
      await request(base+'/rest/v1/rpc/activate_my_profile',{method:'POST',headers:restHeaders(),body:'{}'});
      await fetchProfile();
    }catch(e){ console.warn('[Business Empire] profile activation:',e); }
  }
  async function touchLastLogin(){
    if(!isAuthenticated()) return;
    try{ await request(base+'/rest/v1/rpc/touch_my_login',{method:'POST',headers:restHeaders(),body:'{}'}); }catch(_){}
  }
  async function initialize(){
    if(!configured) return {configured:false};
    parseCallback();
    if(!session){ session=normalizeSession(jsonSafe(localStorage.getItem(SESSION_KEY))); }
    if(session){
      try{
        await ensureFresh();
        await fetchProfile();
        if(profile?.status==='disabled'){ clearSession(); return {configured:true,disabled:true}; }
        // V7: an invited collaborator must set a password before the app profile
        // becomes active. Never auto-activate merely because a magic-link session exists.
        // If the invite page is reloaded after the URL hash was cleaned, keep showing
        // Set Password while the database profile is still invited.
        if(profile?.status==='invited' && callbackType!=='recovery') callbackType='invite';
        if(profile) await fetchAccess();
      }catch(e){ console.warn('[Business Empire] auth initialize failed:',e); clearSession(); }
    }
    return {configured:true,session,user,profile,callbackType,callbackError};
  }
  async function signIn(email,password){
    const data=await request(base+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:authHeaders(null),body:JSON.stringify({email:String(email||'').trim().toLowerCase(),password:String(password||'')})
    });
    saveSession(data); user=data.user||null;
    if(!user) await fetchUser();
    await fetchProfile();
    if(!profile){ clearSession(); throw new Error('This account has not been given Business Empire access.'); }
    if(profile.status==='disabled'){ clearSession(); throw new Error('This account is disabled. Contact the owner.'); }
    if(profile.status==='invited'){
      clearSession();
      throw new Error('Invitation setup is not complete. Open the latest invitation email and set your password first.');
    }
    await fetchAccess();
    touchLastLogin();
    return {user,profile,businessIds:getBusinessIds()};
  }
  async function signOut(){
    const token=getAccessToken();
    if(token){ try{ await request(base+'/auth/v1/logout',{method:'POST',headers:authHeaders(token)}); }catch(_){} }
    clearSession();
  }
  async function sendPasswordReset(email){
    const redirect=siteUrl;
    await request(base+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{
      method:'POST',headers:authHeaders(null),body:JSON.stringify({email:String(email||'').trim().toLowerCase()})
    });
  }
  async function updatePassword(password){
    if(!getAccessToken()) throw new Error('Invite/reset session not found. Open the latest email link again.');
    const u=await request(base+'/auth/v1/user',{method:'PUT',headers:authHeaders(getAccessToken()),body:JSON.stringify({password:String(password||'')})});
    user=u; if(session){session.user=u;saveSession(session)}
    await activateMyProfile(); await fetchAccess(); await touchLastLogin();
    callbackType=null;
    return u;
  }
  async function updateMyProfile(name,phone){
    const uid=getUserId(); if(!uid) throw new Error('Not signed in');
    const rows=await request(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(uid),{
      method:'PATCH',headers:restHeaders({'Prefer':'return=representation'}),body:JSON.stringify({name:String(name||'').trim(),phone:String(phone||'').trim(),updated_at:new Date().toISOString()})
    });
    profile=Array.isArray(rows)&&rows[0] ? rows[0] : Object.assign({},profile,{name,phone});
    return profile;
  }
  async function listCollaborators(){
    if(!isOwner()) return [];
    const [profs,access]=await Promise.all([
      request(base+'/rest/v1/profiles?role=eq.collaborator&select=id,email,name,phone,status,last_sign_in_at,created_at,updated_at,invite_sent_at,last_invite_sent_at,accepted_at,disabled_at&order=created_at.desc',{headers:restHeaders()}),
      request(base+'/rest/v1/business_access?select=user_id,business_id,created_at',{headers:restHeaders()})
    ]);
    const map={}; (access||[]).forEach(a=>{(map[a.user_id]||(map[a.user_id]=[])).push(a.business_id)});
    return (profs||[]).map(p=>({id:p.id,email:p.email,name:p.name||'',phone:p.phone||'',status:p.status||'invited',businessIds:map[p.id]||[],requestedAt:p.created_at,inviteSentAt:p.invite_sent_at||p.created_at,lastInviteSentAt:p.last_invite_sent_at||p.invite_sent_at||p.created_at,acceptedAt:p.accepted_at||null,approvedAt:p.accepted_at||(p.status==='active'?p.updated_at:null),disabledAt:p.disabled_at||null,lastLoginAt:p.last_sign_in_at||null}));
  }

  async function manageCollaborator(payload){
    if(!isOwner()) throw new Error('Owner access required');
    try{ await ensureFresh(); }
    catch(_){ clearSession(); throw new Error('Your session expired. Please sign in again.'); }

    const invoke = async ()=>{
      const token=getAccessToken();
      if(!token) throw new Error('Your session expired. Please sign in again.');
      return await request(base+'/functions/v1/manage-collaborator',{
        method:'POST',
        headers:{'apikey':key,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify(payload||{})
      });
    };

    let result;
    try{
      result=await invoke();
    }catch(e){
      if(e && (e.status===401 || e.status===403) && /session|token|jwt|expired/i.test(String(e.message||''))){
        try{ await refreshSession(); result=await invoke(); }
        catch(_){ clearSession(); throw new Error('Your session expired. Please sign in again.'); }
      }else throw e;
    }

    if(String(result?.backendVersion||'')!=='9.0.0'){
      throw new Error('Backend update required. Deploy manage-collaborator V9 in Supabase, then try again.');
    }
    if((payload?.action==='invite' || payload?.action==='resend_invite') && result?.emailSent!==true){
      throw new Error(result?.emailError || 'Invitation email was not confirmed as sent.');
    }
    return result;
  }
  window.beAuth={initialize,signIn,signOut,sendPasswordReset,updatePassword,updateMyProfile,listCollaborators,manageCollaborator,fetchProfile,fetchAccess,activateMyProfile,ensureFresh,getAccessToken,getUserId,getUser,getProfile,getBusinessIds,isOwner,isAuthenticated,getCallbackType:()=>callbackType,getCallbackError:()=>callbackError,siteUrl,version:'9.0.0'};
})();
