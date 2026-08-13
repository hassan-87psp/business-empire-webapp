/* Business Empire storage adapter v4 — authenticated, user-partitioned cache, Supabase RLS. */
(function(){
  'use strict';
  const cfg=window.BUSINESS_EMPIRE_CONFIG||{};
  const url=String(cfg.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=String(cfg.supabaseAnonKey||'');
  const workspace=String(cfg.workspaceId||'business-empire-main');
  const configured=/^https:\/\/.+\.supabase\.co$/i.test(url)&&apiKey.length>20;
  const PREFIX_LOCAL='be:local:';
  let remotePausedUntil=0;
  function uid(){ return window.beAuth?.getUserId?.() || 'anon'; }
  function safeParse(raw,fallback){try{return JSON.parse(raw)}catch(_){return fallback}}
  function sharedPrefix(){return 'be:shared:'+workspace+':'+uid()+':'}
  function localKey(key,shared){return (shared?sharedPrefix():PREFIX_LOCAL)+key}
  function localGet(key,shared){const value=localStorage.getItem(localKey(key,shared));return value===null?null:{key,value}}
  function localSet(key,value,shared){localStorage.setItem(localKey(key,shared),String(value));return{key,value:String(value)}}
  function localDelete(key,shared){localStorage.removeItem(localKey(key,shared))}
  function queueKey(){return 'be:sync-queue:'+workspace+':'+uid()}
  function token(){return window.beAuth?.getAccessToken?.()||''}
  function headers(extra){return Object.assign({'apikey':apiKey,'Authorization':'Bearer '+token(),'Content-Type':'application/json'},extra||{})}
  function endpoint(q){return url+'/rest/v1/app_storage'+(q||'')}
  function canRemote(){return configured&&navigator.onLine&&!!token()&&Date.now()>=remotePausedUntil}
  function markRemoteFailure(){remotePausedUntil=Date.now()+10000}
  async function fetchTimed(resource,options,timeoutMs=6000){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),timeoutMs);try{return await fetch(resource,Object.assign({},options||{},{signal:ctl.signal}))}finally{clearTimeout(timer)}}
  async function remoteGet(key){const q='?select=value&workspace_id=eq.'+encodeURIComponent(workspace)+'&key=eq.'+encodeURIComponent(key)+'&limit=1';const res=await fetchTimed(endpoint(q),{headers:headers(),cache:'no-store'});if(!res.ok)throw new Error('Supabase GET failed: '+res.status);const rows=await res.json();return rows.length?{key,value:rows[0].value}:null}
  async function remoteSet(key,value){const res=await fetchTimed(endpoint('?on_conflict=workspace_id,key'),{method:'POST',headers:headers({'Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({workspace_id:workspace,key,value:String(value),updated_at:new Date().toISOString()})});if(!res.ok)throw new Error('Supabase SET failed: '+res.status)}
  async function remoteDelete(key){const q='?workspace_id=eq.'+encodeURIComponent(workspace)+'&key=eq.'+encodeURIComponent(key);const res=await fetchTimed(endpoint(q),{method:'DELETE',headers:headers()});if(!res.ok)throw new Error('Supabase DELETE failed: '+res.status)}
  function getQueue(){return safeParse(localStorage.getItem(queueKey())||'[]',[])}
  function setQueue(q){if(q.length)localStorage.setItem(queueKey(),JSON.stringify(q));else localStorage.removeItem(queueKey())}
  function enqueue(op){let q=getQueue().filter(x=>x.key!==op.key);q.push(Object.assign({queuedAt:Date.now()},op));setQueue(q)}
  async function flushQueue(){if(!canRemote())return;const q=getQueue();if(!q.length)return;const remaining=[];for(let i=0;i<q.length;i++){const item=q[i];try{if(item.type==='set')await remoteSet(item.key,item.value);else await remoteDelete(item.key)}catch(e){remaining.push(...q.slice(i));markRemoteFailure();break}}setQueue(remaining)}
  function syncSet(key,value){if(!canRemote()){enqueue({type:'set',key,value:String(value)});return}remoteSet(key,value).then(flushQueue).catch(e=>{console.warn('[Business Empire] write queued',e);markRemoteFailure();enqueue({type:'set',key,value:String(value)})})}
  function syncDelete(key){if(!canRemote()){enqueue({type:'delete',key});return}remoteDelete(key).then(flushQueue).catch(e=>{console.warn('[Business Empire] delete queued',e);markRemoteFailure();enqueue({type:'delete',key})})}
  window.storage={
    async get(key,shared){shared=!!shared;if(!shared)return localGet(key,false);const mirror=localGet(key,true);if(!canRemote())return mirror;try{const r=await remoteGet(key);if(r)localSet(key,r.value,true);return r||mirror}catch(e){console.warn('[Business Empire] remote read fallback',e);markRemoteFailure();return mirror}},
    async set(key,value,shared){shared=!!shared;const result=localSet(key,value,shared);if(shared)syncSet(key,value);return result},
    async delete(key,shared){shared=!!shared;localDelete(key,shared);if(shared)syncDelete(key)},
    sync:flushQueue,mode:configured?'supabase-auth':'local',version:'4.0.0'
  };
  window.addEventListener('online',()=>{remotePausedUntil=0;flushQueue()});
})();
