const CACHE_NAME = 'business-empire-pwa-v7';
const APP_SHELL = [
  './', './index.html', './app-config.js?v=7', './auth-client.js?v=7', './storage-adapter.js?v=7', './app.js?v=7',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET') return;
  const u=new URL(req.url);
  if(u.origin!==self.location.origin) return;
  const dynamic = req.mode==='navigate' || /\.(?:js|html|webmanifest)$/.test(u.pathname);
  if(dynamic){
    event.respondWith(fetch(req).then(res=>{
      const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)); return res;
    }).catch(()=>caches.match(req).then(x=>x||caches.match('./index.html'))));
  } else {
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
      const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)); return res;
    })));
  }
});
