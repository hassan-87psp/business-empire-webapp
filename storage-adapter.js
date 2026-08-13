/* Business Empire storage adapter v2: local-first writes, bounded remote waits, Supabase sync. */
(function(){
  'use strict';
  const cfg = window.BUSINESS_EMPIRE_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const apiKey = String(cfg.supabaseAnonKey || '');
  const workspace = String(cfg.workspaceId || 'business-empire-main');
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(url) && apiKey.length > 20;
  const PREFIX_LOCAL = 'be:local:';
  const PREFIX_SHARED = 'be:shared:' + workspace + ':';
  const QUEUE_KEY = 'be:sync-queue:' + workspace;
  let remotePausedUntil = 0;

  function safeParse(raw, fallback){ try { return JSON.parse(raw); } catch(_) { return fallback; } }
  function localKey(key, shared){ return (shared ? PREFIX_SHARED : PREFIX_LOCAL) + key; }
  function localGet(key, shared){
    const value = localStorage.getItem(localKey(key, shared));
    return value === null ? null : { key, value };
  }
  function localSet(key, value, shared){
    localStorage.setItem(localKey(key, shared), String(value));
    return { key, value: String(value) };
  }
  function localDelete(key, shared){ localStorage.removeItem(localKey(key, shared)); }
  function headers(extra){
    return Object.assign({
      'apikey': apiKey,
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    }, extra || {});
  }
  function endpoint(query){ return url + '/rest/v1/app_storage' + (query || ''); }
  function canRemote(){ return configured && navigator.onLine && Date.now() >= remotePausedUntil; }
  function markRemoteFailure(){ remotePausedUntil = Date.now() + 15000; }

  async function fetchTimed(resource, options, timeoutMs=5000){
    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), timeoutMs);
    try { return await fetch(resource, Object.assign({}, options || {}, {signal:ctl.signal})); }
    finally { clearTimeout(timer); }
  }
  async function remoteGet(key){
    const q='?select=value&workspace_id=eq.'+encodeURIComponent(workspace)+'&key=eq.'+encodeURIComponent(key)+'&limit=1';
    const res=await fetchTimed(endpoint(q),{headers:headers(),cache:'no-store'});
    if(!res.ok) throw new Error('Supabase GET failed: '+res.status);
    const rows=await res.json();
    return rows.length ? {key,value:rows[0].value} : null;
  }
  async function remoteSet(key,value){
    const res=await fetchTimed(endpoint('?on_conflict=workspace_id,key'),{
      method:'POST', headers:headers({'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify({workspace_id:workspace,key,value:String(value),updated_at:new Date().toISOString()})
    });
    if(!res.ok) throw new Error('Supabase SET failed: '+res.status);
  }
  async function remoteDelete(key){
    const q='?workspace_id=eq.'+encodeURIComponent(workspace)+'&key=eq.'+encodeURIComponent(key);
    const res=await fetchTimed(endpoint(q),{method:'DELETE',headers:headers()});
    if(!res.ok) throw new Error('Supabase DELETE failed: '+res.status);
  }

  function getQueue(){ return safeParse(localStorage.getItem(QUEUE_KEY)||'[]',[]); }
  function setQueue(q){ if(q.length) localStorage.setItem(QUEUE_KEY,JSON.stringify(q)); else localStorage.removeItem(QUEUE_KEY); }
  function enqueue(op){
    let q=getQueue().filter(x=>x.key!==op.key);
    q.push(Object.assign({queuedAt:Date.now()},op));
    setQueue(q);
  }
  async function flushQueue(){
    if(!canRemote()) return;
    const q=getQueue(); if(!q.length) return;
    const remaining=[];
    for(const item of q){
      try{
        if(item.type==='set') await remoteSet(item.key,item.value);
        else await remoteDelete(item.key);
      }catch(e){ remaining.push(item); markRemoteFailure(); break; }
    }
    // keep any unprocessed tail too
    const processedCount=q.length-remaining.length;
    if(remaining.length && processedCount < q.length){
      const remKeys=new Set(remaining.map(x=>x.key));
      q.slice(processedCount).forEach(x=>{ if(!remKeys.has(x.key)) remaining.push(x); });
    }
    setQueue(remaining);
  }
  function syncSetInBackground(key,value){
    if(!canRemote()){ enqueue({type:'set',key,value:String(value)}); return; }
    remoteSet(key,value).then(flushQueue).catch(err=>{ console.warn('[Business Empire] Remote write queued.',err); markRemoteFailure(); enqueue({type:'set',key,value:String(value)}); });
  }
  function syncDeleteInBackground(key){
    if(!canRemote()){ enqueue({type:'delete',key}); return; }
    remoteDelete(key).then(flushQueue).catch(err=>{ console.warn('[Business Empire] Remote delete queued.',err); markRemoteFailure(); enqueue({type:'delete',key}); });
  }

  window.storage={
    async get(key,shared){
      shared=!!shared;
      if(!shared) return localGet(key,false);
      const mirror=localGet(key,true);
      if(!canRemote()) return mirror;
      try{
        const r=await remoteGet(key);
        if(r) localSet(key,r.value,true); else if(!mirror) localDelete(key,true);
        return r || mirror;
      }catch(e){
        console.warn('[Business Empire] Remote read failed; using local mirror.',e);
        markRemoteFailure();
        return mirror;
      }
    },
    async set(key,value,shared){
      shared=!!shared;
      const result=localSet(key,value,shared);
      if(shared) syncSetInBackground(key,value);
      return result;
    },
    async delete(key,shared){
      shared=!!shared;
      localDelete(key,shared);
      if(shared) syncDeleteInBackground(key);
    },
    sync:flushQueue,
    mode:configured?'supabase':'local',
    version:'2.0.0'
  };
  window.addEventListener('online',()=>{ remotePausedUntil=0; flushQueue(); });
  if(configured) setTimeout(flushQueue,250);
})();
