/*
  window.storage compatibility adapter for the original Business Empire Dashboard.
  - shared=true  -> Supabase REST (with an offline local mirror / write queue)
  - shared=false -> this browser only (localStorage)
  This preserves the existing dashboard code and UI without rewriting its storage calls.
*/
(function(){
  'use strict';

  const cfg = window.BUSINESS_EMPIRE_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const anon = String(cfg.supabaseAnonKey || '');
  const workspace = String(cfg.workspaceId || 'business-empire-main');
  const remoteEnabled = /^https:\/\/.+\.supabase\.co$/i.test(url) && anon.length > 20;
  const PREFIX_LOCAL = 'be:local:';
  const PREFIX_SHARED = 'be:shared:' + workspace + ':';
  const QUEUE_KEY = 'be:sync-queue:' + workspace;

  function safeParse(raw, fallback){
    try { return JSON.parse(raw); } catch(_) { return fallback; }
  }
  function localKey(key, shared){ return (shared ? PREFIX_SHARED : PREFIX_LOCAL) + key; }
  function localGet(key, shared){
    const value = localStorage.getItem(localKey(key, shared));
    return value === null ? null : { key, value };
  }
  function localSet(key, value, shared){
    localStorage.setItem(localKey(key, shared), String(value));
    return { key, value: String(value) };
  }
  function localDelete(key, shared){
    localStorage.removeItem(localKey(key, shared));
  }
  function headers(extra){
    return Object.assign({
      'apikey': anon,
      'Authorization': 'Bearer ' + anon,
      'Content-Type': 'application/json'
    }, extra || {});
  }
  function endpoint(query){ return url + '/rest/v1/app_storage' + (query || ''); }

  async function remoteGet(key){
    const q = '?select=value&workspace_id=eq.' + encodeURIComponent(workspace) +
              '&key=eq.' + encodeURIComponent(key) + '&limit=1';
    const res = await fetch(endpoint(q), { headers: headers(), cache: 'no-store' });
    if(!res.ok) throw new Error('Supabase GET failed: ' + res.status);
    const rows = await res.json();
    if(!rows.length) return null;
    return { key, value: rows[0].value };
  }
  async function remoteSet(key, value){
    const res = await fetch(endpoint('?on_conflict=workspace_id,key'), {
      method: 'POST',
      headers: headers({'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body: JSON.stringify({ workspace_id: workspace, key, value: String(value), updated_at: new Date().toISOString() })
    });
    if(!res.ok) throw new Error('Supabase SET failed: ' + res.status);
  }
  async function remoteDelete(key){
    const q = '?workspace_id=eq.' + encodeURIComponent(workspace) + '&key=eq.' + encodeURIComponent(key);
    const res = await fetch(endpoint(q), { method:'DELETE', headers: headers() });
    if(!res.ok) throw new Error('Supabase DELETE failed: ' + res.status);
  }

  function getQueue(){ return safeParse(localStorage.getItem(QUEUE_KEY) || '[]', []); }
  function setQueue(q){
    if(q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else localStorage.removeItem(QUEUE_KEY);
  }
  function enqueue(op){
    let q = getQueue();
    // Keep only the latest pending operation for the same key.
    q = q.filter(x => x.key !== op.key);
    q.push(Object.assign({ queuedAt: Date.now() }, op));
    setQueue(q);
  }
  async function flushQueue(){
    if(!remoteEnabled || !navigator.onLine) return;
    let q = getQueue();
    if(!q.length) return;
    const remaining = [];
    for(const item of q){
      try{
        if(item.type === 'set') await remoteSet(item.key, item.value);
        else if(item.type === 'delete') await remoteDelete(item.key);
      }catch(e){
        remaining.push(item);
      }
    }
    setQueue(remaining);
  }

  window.storage = {
    async get(key, shared){
      shared = !!shared;
      if(!shared) return localGet(key, false);
      if(remoteEnabled && navigator.onLine){
        try{
          const r = await remoteGet(key);
          if(r) localSet(key, r.value, true);
          else localDelete(key, true);
          return r;
        }catch(e){
          console.warn('[Business Empire] Remote read failed; using offline mirror.', e);
        }
      }
      return localGet(key, true);
    },

    async set(key, value, shared){
      shared = !!shared;
      const result = localSet(key, value, shared);
      if(!shared) return result;
      if(remoteEnabled && navigator.onLine){
        try{
          await remoteSet(key, value);
          await flushQueue();
          return result;
        }catch(e){
          console.warn('[Business Empire] Remote write queued for sync.', e);
        }
      }
      enqueue({type:'set', key, value:String(value)});
      return result;
    },

    async delete(key, shared){
      shared = !!shared;
      localDelete(key, shared);
      if(!shared) return;
      if(remoteEnabled && navigator.onLine){
        try{
          await remoteDelete(key);
          await flushQueue();
          return;
        }catch(e){
          console.warn('[Business Empire] Remote delete queued for sync.', e);
        }
      }
      enqueue({type:'delete', key});
    },

    sync: flushQueue,
    mode: remoteEnabled ? 'supabase' : 'local'
  };

  window.addEventListener('online', flushQueue);
  if(remoteEnabled) setTimeout(flushQueue, 0);
  if(!remoteEnabled){
    console.info('[Business Empire] Supabase is not configured; using browser storage only.');
  }
})();
