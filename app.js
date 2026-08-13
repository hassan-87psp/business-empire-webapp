/* ===================== DATA MODEL ===================== */
const DEFAULT_BUSINESSES = [
  {id:'best',    name:'Team Best',        tag:'Partners — joint deals',            icon:'🤝', color:'#F0B90B'},
  {id:'dp',      name:'D Prime (DP)',     tag:'Forex Broker — clients & deposits', icon:'📈', color:'#0ECB81'},
  {id:'webdev',  name:'Web Developer',    tag:'CRMs, automation, broker sites',    icon:'💻', color:'#3B82F6'},
  {id:'appdev',  name:'App Developer',    tag:'3 apps in progress',                icon:'📱', color:'#22D3EE'},
  {id:'hassan',  name:'Hassan Bina',      tag:'Malaysia workers business',         icon:'👷', color:'#84CC16'},
  {id:'kebaabish',name:'Kebaabish',       tag:'Restaurants',                       icon:'🍽️', color:'#F97316'},
  {id:'umrah',   name:'Hamara Umrah',     tag:'Pakistan Umrah business',           icon:'🕋', color:'#14B8A6'},
  {id:'k24',     name:'24K',              tag:'Online education — Lahore',         icon:'🎓', color:'#EAB308'},
  {id:'pipsepaisa',name:'PipSePaisa',     tag:'Online education — Malaysia',       icon:'📊', color:'#EC4899'},
  {id:'farhan',  name:'Farhan Visas',     tag:'Malaysia visas',                    icon:'🛂', color:'#818CF8'},
];
let BUSINESSES = [];
const BIZ_COLOR_PALETTE = ['#F0B90B','#0ECB81','#3B82F6','#22D3EE','#84CC16','#F97316','#14B8A6','#EAB308','#EC4899','#818CF8','#F6465D','#A78BFA'];
const BIZ_ICON_SUGGESTIONS = ['💼','🤝','📈','💻','📱','👷','🍽️','🕋','🎓','📊','🛂','🏗️','🚗','🏥','📦','⚖️','🏦','🛒'];

const EXPENSE_CATS_DEFAULT = ['Marketing','Salaries/Team','Rent & Office','Software/Tools','Travel','Personal Purchase','Bank/Transaction Fees','Utilities','Other'];
const INCOME_CATS_DEFAULT  = ['Client Payment','Product/Service Sale','Commission','Partner Share','Other Income'];
const CURRENCIES = ['RM','PKR','USD'];

let bizData = {};      // id -> { transactions:[], categories:{expense:[],income:[]}, assets:[], liabilities:[] }
let currentBiz = null;
let currentTab = 'overview';
let currentView = 'dashboard'; // 'dashboard' | 'business' | 'reminders'

/* ===================== HOME + PWA ===================== */
let deferredInstallPrompt = null;
function isPwaStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function goHome(){
  closeSidebar();
  currentBiz = null;
  if(accessMode){
    renderDashboard();
    window.scrollTo({top:0, behavior:'smooth'});
  } else {
    renderGate();
  }
}
async function installPWA(){
  if(isPwaStandalone()){ showToast('Business Empire app already installed ✅'); return; }
  if(deferredInstallPrompt){
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    promptEvent.prompt();
    try{
      const choice = await promptEvent.userChoice;
      if(choice && choice.outcome === 'accepted') showToast('App install started ✅');
    }catch(e){}
    renderSidebarContent();
    return;
  }
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if(isiOS){
    openModal(`
      <h3>📲 Install Business Empire <span class="modal-close" onclick="closeModal()">✕</span></h3>
      <p style="font-size:13px; color:var(--sub); line-height:1.7">Safari mein <b>Share</b> button tap karein, phir <b>Add to Home Screen</b> select karein.</p>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Got it</button></div>`);
  } else {
    openModal(`
      <h3>📲 Install Business Empire <span class="modal-close" onclick="closeModal()">✕</span></h3>
      <p style="font-size:13px; color:var(--sub); line-height:1.7">Browser menu mein <b>Install app</b> ya <b>Add to Home Screen</b> choose karein. Agar install option available hoga to browser usay show karega.</p>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Got it</button></div>`);
  }
}
window.addEventListener('beforeinstallprompt', (event)=>{
  event.preventDefault();
  deferredInstallPrompt = event;
  if(document.getElementById('sidebarContent')?.innerHTML) renderSidebarContent();
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  showToast('Business Empire installed ✅');
  if(document.getElementById('sidebarContent')?.innerHTML) renderSidebarContent();
});
let bizOrderState = { order: BUSINESSES.map(b=>b.id), autoSort: true };
let reminders = [];
let reminderLog = [];
let draggedId = null;
const EMAIL_TO = 'syedshahid035@gmail.com';
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEFAULT_FX = { RM:1, USD:4.09, PKR:0.0147 }; // approx market rates — editable via ⚙️ FX Rates
let fxRates = {...DEFAULT_FX};

/* ===================== STORAGE ===================== */
async function loadBiz(id){
  try{
    const r = await window.storage.get('biz:'+id, true);
    if(r && r.value){ const d = JSON.parse(r.value); 
      d.transactions = d.transactions || [];
      d.categories = d.categories || {expense:[...EXPENSE_CATS_DEFAULT], income:[...INCOME_CATS_DEFAULT]};
      d.assets = d.assets || []; d.liabilities = d.liabilities || [];
      // backward-compat: ensure createdAt/history/source exist on older records
      d.transactions.forEach(t=>{ t.createdAt = t.createdAt || t.date+'T00:00:00.000Z'; t.history = t.history || []; if(t.type==='income') t.source = t.source || ''; });
      d.assets.forEach(a=>{ a.createdAt = a.createdAt || nowISO(); a.history = a.history || []; });
      d.liabilities.forEach(l=>{ l.createdAt = l.createdAt || nowISO(); l.history = l.history || []; });
      return d;
    }
  }catch(e){}
  return {transactions:[], categories:{expense:[...EXPENSE_CATS_DEFAULT], income:[...INCOME_CATS_DEFAULT]}, assets:[], liabilities:[]};
}
async function saveBiz(id){
  try{ await window.storage.set('biz:'+id, JSON.stringify(bizData[id]), true); }
  catch(e){ showToast('Save failed — try again'); }
}
async function loadBusinessesList(){
  try{
    const r = await window.storage.get('businesses-list', true);
    if(r && r.value){ BUSINESSES = JSON.parse(r.value); return; }
  }catch(e){}
  BUSINESSES = DEFAULT_BUSINESSES.slice();
  await saveBusinessesList();
}
async function saveBusinessesList(){
  try{ await window.storage.set('businesses-list', JSON.stringify(BUSINESSES), true); }catch(e){}
}
async function loadAll(){
  for(const b of BUSINESSES){ bizData[b.id] = await loadBiz(b.id); }
}
async function loadOrder(){
  try{
    const r = await window.storage.get('biz-order', true);
    if(r && r.value){ const d = JSON.parse(r.value);
      d.order = (d.order||[]).filter(id=>BUSINESSES.some(b=>b.id===id));
      BUSINESSES.forEach(b=>{ if(!d.order.includes(b.id)) d.order.push(b.id); });
      bizOrderState = { order: d.order, autoSort: d.autoSort !== false };
      return;
    }
  }catch(e){}
  bizOrderState = { order: BUSINESSES.map(b=>b.id), autoSort: true };
}
async function saveOrder(){
  try{ await window.storage.set('biz-order', JSON.stringify(bizOrderState), true); }catch(e){}
}
async function loadReminders(){
  try{
    const r = await window.storage.get('reminders', true);
    if(r && r.value){
      reminders = JSON.parse(r.value);
      reminders.forEach(rm=>{ rm.history = rm.history || []; rm.days = rm.days || []; rm.active = rm.active !== false; rm.snoozeUntil = rm.snoozeUntil || null; rm.snoozeFiredFor = rm.snoozeFiredFor || null; });
      return;
    }
  }catch(e){}
  reminders = [];
}
async function saveReminders(){
  try{ await window.storage.set('reminders', JSON.stringify(reminders), true); }catch(e){ showToast('Save failed'); }
}
async function loadLog(){
  try{
    const r = await window.storage.get('reminder-log', true);
    if(r && r.value){ reminderLog = JSON.parse(r.value); return; }
  }catch(e){}
  reminderLog = [];
}
async function saveLog(){
  try{
    if(reminderLog.length>150) reminderLog = reminderLog.slice(0,150);
    await window.storage.set('reminder-log', JSON.stringify(reminderLog), true);
  }catch(e){}
}
async function loadFx(){
  try{
    const r = await window.storage.get('fx-rates', true);
    if(r && r.value){ fxRates = {...DEFAULT_FX, ...JSON.parse(r.value)}; return; }
  }catch(e){}
  fxRates = {...DEFAULT_FX};
}
async function saveFx(){
  try{ await window.storage.set('fx-rates', JSON.stringify(fxRates), true); }catch(e){}
}
function toRM(amount, currency){ return Number(amount) * (fxRates[currency]!==undefined ? fxRates[currency] : 1); }

let accessMode = null;      // 'owner' | 'collaborator'
let myEmail = '';
let allowedBizIds = null;   // array of business ids for a collaborator; null = unrestricted (owner)
let ownerPasscode = null;
let collaborators = [];     // shared: [{id, email, name, businessIds:[], status:'pending'|'approved', requestedAt, approvedAt}]
let ownerProfile = {name:'', email:'', phone:''};
let myAvatar = '';
let sidebarBizOpen = false;
function myBusinesses(){ return accessMode==='owner' ? BUSINESSES : BUSINESSES.filter(b=> (allowedBizIds||[]).includes(b.id)); }
function updateBizCountBadge(){
  const el = document.getElementById('bizCountBadge');
  if(!el) return;
  const n = myBusinesses().length;
  el.textContent = accessMode==='owner' ? (n+' Businesses') : (n+' Business'+(n===1?'':'es')+' (yours)');
}
function canAccessBiz(id){ return accessMode==='owner' || (allowedBizIds||[]).includes(id); }
function reminderVisibleToMe(r){ return accessMode==='owner' || (r.business && (allowedBizIds||[]).includes(r.business)); }

async function loadOwnerPasscode(){
  try{ const r = await window.storage.get('owner-passcode', true); if(r && r.value) return r.value; }catch(e){}
  return null;
}
async function saveOwnerPasscode(pass){
  try{ await window.storage.set('owner-passcode', pass, true); }catch(e){}
}
async function loadCollaborators(){
  try{ const r = await window.storage.get('collaborators', true); if(r && r.value) return JSON.parse(r.value); }catch(e){}
  return [];
}
async function saveCollaboratorsList(){
  try{ await window.storage.set('collaborators', JSON.stringify(collaborators), true); }catch(e){}
}
async function loadOwnerProfile(){
  try{ const r = await window.storage.get('owner-profile', true); if(r && r.value) return JSON.parse(r.value); }catch(e){}
  return {name:'', email:'', phone:''};
}
async function saveOwnerProfileData(){
  try{ await window.storage.set('owner-profile', JSON.stringify(ownerProfile), true); }catch(e){}
}
async function loadAvatar(){
  try{ const r = await window.storage.get('my-avatar', false); if(r && r.value) return r.value; }catch(e){}
  return '';
}
async function saveAvatarData(dataUrl){
  try{ await window.storage.set('my-avatar', dataUrl, false); }catch(e){}
}
async function loadMySession(){
  try{ const r = await window.storage.get('my-session', false); if(r && r.value) return JSON.parse(r.value); }catch(e){}
  return null;
}
async function saveMySession(session){
  try{ await window.storage.set('my-session', JSON.stringify(session), false); }catch(e){}
}
function currencyTriple(totalRM){
  return { RM: totalRM, USD: totalRM/(fxRates.USD||1), PKR: totalRM/(fxRates.PKR||1) };
}
function totalRMFor(txns, type){
  let totalRM = 0;
  if(type==='net'){
    const net = netByCurrency(txns);
    Object.keys(net).forEach(c=> totalRM += toRM(net[c], c));
  } else {
    const t = totalsByCurrency(txns, type);
    Object.keys(t).forEach(c=> totalRM += toRM(t[c], c));
  }
  return totalRM;
}
function fmtTripleBlock(obj){
  return `<div class="val">RM ${fmt(obj.RM)}</div><div class="sub-val">$ ${fmt(obj.USD)} USD &nbsp;·&nbsp; ₨ ${fmt(obj.PKR)} PKR</div>`;
}
function fmtDualBlock(obj){
  return `<div class="val">RM ${fmt(obj.RM)}</div><div class="sub-val">$ ${fmt(obj.USD)} USD</div>`;
}
function fmtTripleCompact(obj){
  return `<div class="v">RM ${fmt(obj.RM)}</div><div class="v-sub">$ ${fmt(obj.USD)} · ₨ ${fmt(obj.PKR)}</div>`;
}
function fmtDualCompact(obj){
  return `<div class="v">RM ${fmt(obj.RM)}</div><div class="v-sub">$ ${fmt(obj.USD)}</div>`;
}

/* ===================== HELPERS ===================== */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function fmt(n){ return (Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function nowISO(){ return new Date().toISOString(); }
function fmtDateTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + ', ' +
         d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}
function showToast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}
function openModal(html){
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('show'); }
let __confirmCallback = null;
function openConfirm(message, callback, opts){
  opts = opts || {};
  const label = opts.label || 'Yes, Delete';
  const danger = opts.danger !== false; // default true (red) unless explicitly set false
  __confirmCallback = callback;
  openModal(`
    <h3>Are you sure? <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div style="font-size:13.5px; color:var(--text); margin-bottom:6px">${message}</div>
    <div class="modal-actions">
      <button class="btn" style="background:${danger?'var(--red)':'var(--gold)'}" onclick="runConfirmCallback()">${label}</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function runConfirmCallback(){
  closeModal();
  if(__confirmCallback){ await __confirmCallback(); __confirmCallback = null; }
}
function totalsByCurrency(txns, type){
  const out = {};
  txns.filter(t=>t.type===type).forEach(t=>{ out[t.currency] = (out[t.currency]||0) + Number(t.amount); });
  return out;
}
function fmtMulti(obj){
  const keys = Object.keys(obj);
  if(keys.length===0) return '—';
  return keys.map(k=>k+' '+fmt(obj[k])).join('  +  ');
}
function netByCurrency(txns){
  const inc = totalsByCurrency(txns,'income'), exp = totalsByCurrency(txns,'expense');
  const all = new Set([...Object.keys(inc), ...Object.keys(exp)]);
  const out = {};
  all.forEach(c=> out[c] = (inc[c]||0) - (exp[c]||0));
  return out;
}
function incomeScore(bizId){
  // Approximate ranking score: sums income across currencies (not FX-converted — used only for default sort order)
  return bizData[bizId].transactions.filter(t=>t.type==='income').reduce((s,t)=> s+Number(t.amount), 0);
}
function getOrderedBusinesses(){
  const pool = myBusinesses();
  if(bizOrderState.autoSort){
    return pool.slice().sort((a,b)=> incomeScore(b.id) - incomeScore(a.id));
  }
  return bizOrderState.order.map(id=> pool.find(b=>b.id===id)).filter(Boolean);
}

/* ===================== REMINDER HELPERS ===================== */
function isApplicableToday(r, d){
  const dow = d.getDay();
  if(r.repeat==='once') return r.date === todayStr();
  if(r.repeat==='daily') return true;
  if(r.repeat==='weekly') return (r.days||[]).includes(dow);
  return false;
}
function repeatLabel(r){
  if(r.repeat==='once') return 'One-time · '+r.date;
  if(r.repeat==='daily') return 'Every day';
  if(r.repeat==='weekly') return (r.days||[]).length===7 ? 'Every day (weekly)' : (r.days||[]).slice().sort().map(d=>DAY_NAMES[d]).join(', ');
  return '';
}
function reminderStatusToday(r, now){
  const hhmm = now.toTimeString().slice(0,5);
  const doneToday = r.lastFiredKey === todayStr()+':'+r.time || r.dismissedKey === todayStr();
  if(doneToday) return 'done';
  return (r.time <= hhmm) ? 'overdue' : 'later';
}
function getTodayReminders(now){
  return reminders.filter(r=> r.active && isApplicableToday(r, now) && reminderVisibleToMe(r)).sort((a,b)=> a.time.localeCompare(b.time));
}
function getUpcomingReminders(){
  return reminders.filter(r=> r.active && r.repeat==='once' && r.date > todayStr() && reminderVisibleToMe(r)).sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
}
function getRecurringReminders(){
  return reminders.filter(r=> r.active && r.repeat!=='once' && reminderVisibleToMe(r));
}
function updateReminderBadge(){
  const now = new Date();
  const todays = getTodayReminders(now);
  const overdue = todays.filter(r=> reminderStatusToday(r, now)==='overdue').length;
  const pendingToday = todays.filter(r=> reminderStatusToday(r, now)!=='done').length;
  const badge = document.getElementById('reminderBadge');
  if(!badge) return;
  badge.textContent = pendingToday;
  badge.classList.toggle('zero', pendingToday===0);
  if(overdue>0) badge.style.background = 'var(--red)';
  else if(pendingToday>0) badge.style.background = 'var(--gold)';
}

/* ===================== RENDER: DASHBOARD ===================== */
function renderDashboard(){
  currentView = 'dashboard';
  document.getElementById('pageHeading').style.display = 'none';
  document.getElementById('backBtn').style.display = 'none';
  updateBizCountBadge();

  let allInc={}, allExp={};
  myBusinesses().forEach(b=>{
    const t = bizData[b.id].transactions;
    const i = totalsByCurrency(t,'income'), e = totalsByCurrency(t,'expense');
    Object.keys(i).forEach(c=> allInc[c]=(allInc[c]||0)+i[c]);
    Object.keys(e).forEach(c=> allExp[c]=(allExp[c]||0)+e[c]);
  });
  let allNet = {};
  new Set([...Object.keys(allInc),...Object.keys(allExp)]).forEach(c=> allNet[c]=(allInc[c]||0)-(allExp[c]||0));

  const incomeRM = Object.keys(allInc).reduce((s,c)=> s + toRM(allInc[c], c), 0);
  const expenseRM = Object.keys(allExp).reduce((s,c)=> s + toRM(allExp[c], c), 0);
  const netRM = incomeRM - expenseRM;
  const incomeTriple = currencyTriple(incomeRM);
  const expenseTriple = currencyTriple(expenseRM);
  const netTriple = currencyTriple(netRM);

  let totalTxns = myBusinesses().reduce((s,b)=> s + bizData[b.id].transactions.length, 0);
  const ordered = getOrderedBusinesses();

  let html = `
  <div class="summary-row">
    <div class="sum-card income"><div class="lbl">Total Income</div>${fmtDualBlock(incomeTriple)}</div>
    <div class="sum-card expense"><div class="lbl">Total Expenses</div>${fmtDualBlock(expenseTriple)}</div>
    <div class="sum-card net"><div class="lbl">Net Profit</div>${fmtDualBlock(netTriple)}</div>
    <div class="sum-card clickable" onclick="openGlobalLog()"><div class="lbl">Total Entries Logged</div><div class="val">${totalTxns}</div><div class="sub-val">Activity Logs →</div></div>
  </div>
  <div class="fx-note" style="margin:-18px 0 20px 2px">Rates used: 1 USD = RM ${fxRates.USD} · 1 PKR = RM ${fxRates.PKR} — <span style="text-decoration:underline dotted; cursor:pointer" onclick="openFxSettings()">⚙️ edit rates</span></div>
  <div class="sort-bar" style="justify-content:flex-end">
    <div style="display:flex; align-items:center; gap:10px">
      <span class="sort-note">${bizOrderState.autoSort ? '🔀 Auto-sorted by highest income — drag any card to set your own order' : '📌 Custom order — drag cards to rearrange'}</span>
      ${!bizOrderState.autoSort ? '<button class="btn-ghost" onclick="resetAutoSort()">↺ Reset to Auto-sort</button>' : ''}
    </div>
  </div>
  <div class="biz-grid">`;

  ordered.forEach((b,idx)=>{
    const t = bizData[b.id].transactions;
    const inc = totalsByCurrency(t,'income'), exp = totalsByCurrency(t,'expense'), net = netByCurrency(t);
    html += `
    <div class="biz-card" style="--accent:${b.color}" draggable="true"
         ondragstart="dragStart(event,'${b.id}')" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropCard(event,'${b.id}')"
         onclick="openBiz('${b.id}')" id="card-${b.id}">
      <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
      <div class="biz-num">${idx+1}</div>
      <div class="biz-top">
        <div class="biz-icon">${b.icon}</div>
        <div><div class="biz-name">${b.name}</div><div class="biz-tag">${b.tag}</div></div>
      </div>
      <div class="biz-stats">
        <div class="biz-stat">
          <div class="l">Income</div>
          <div class="v" style="color:var(--green)">RM ${fmt(currencyTriple(totalRMFor(t,'income')).RM)}</div>
          <div class="v-sub">$ ${fmt(currencyTriple(totalRMFor(t,'income')).USD)}</div>
        </div>
        <div class="biz-stat">
          <div class="l">Expense</div>
          <div class="v" style="color:var(--red)">RM ${fmt(currencyTriple(totalRMFor(t,'expense')).RM)}</div>
          <div class="v-sub">$ ${fmt(currencyTriple(totalRMFor(t,'expense')).USD)}</div>
        </div>
        <div class="biz-stat net">
          <div class="l">Net</div>
          <div class="v">RM ${fmt(currencyTriple(totalRMFor(t,'net')).RM)}</div>
          <div class="v-sub">$ ${fmt(currencyTriple(totalRMFor(t,'net')).USD)}</div>
        </div>
      </div>
    </div>`;
  });
  html += `</div>`;
  document.getElementById('app').innerHTML = html;
  updateReminderBadge();
}

/* ===================== DRAG & DROP REORDERING ===================== */
function dragStart(e, id){ draggedId = id; e.target.closest('.biz-card').classList.add('dragging'); }
function dragOver(e){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
async function dropCard(e, targetId){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  document.querySelectorAll('.biz-card').forEach(c=>c.classList.remove('dragging'));
  if(!draggedId || draggedId===targetId) return;
  // Always reorder against the FULL 10-business list (not just what this user can see),
  // so a collaborator's own reordering doesn't wipe out the order of businesses they can't see.
  let order = bizOrderState.autoSort
    ? BUSINESSES.slice().sort((a,b)=> incomeScore(b.id) - incomeScore(a.id)).map(b=>b.id)
    : bizOrderState.order.slice();
  order = order.filter(id=>id!==draggedId);
  const targetIdx = order.indexOf(targetId);
  order.splice(targetIdx, 0, draggedId);
  bizOrderState = { order, autoSort:false };
  await saveOrder();
  showToast('Order updated');
  renderDashboard();
}
async function resetAutoSort(){
  bizOrderState.autoSort = true;
  await saveOrder();
  showToast('Sorted by income again');
  renderDashboard();
}

/* ===================== FX RATES ===================== */
function openFxSettings(){
  openModal(`
    <h3>Edit FX Rates <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div style="font-size:12px; color:var(--sub); margin-bottom:14px">1 unit of currency = how many RM (Malaysian Ringgit)? Update these anytime to match today's rate.</div>
    <div class="modal-field"><label>1 USD = ? RM</label><input type="number" id="fx_usd" value="${fxRates.USD}" step="0.01"></div>
    <div class="modal-field"><label>1 PKR = ? RM</label><input type="number" id="fx_pkr" value="${fxRates.PKR}" step="0.0001"></div>
    <div class="modal-actions">
      <button class="btn" onclick="saveFxSettings()">Save Rates</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function saveFxSettings(){
  const usd = parseFloat(document.getElementById('fx_usd').value);
  const pkr = parseFloat(document.getElementById('fx_pkr').value);
  if(!usd || !pkr){ showToast('Enter valid rates'); return; }
  fxRates = { RM:1, USD:usd, PKR:pkr };
  await saveFx();
  closeModal();
  showToast('FX rates updated');
  if(currentView==='dashboard') renderDashboard();
}

/* ===================== GLOBAL ACTIVITY LOG ===================== */
function openGlobalLog(){
  currentView = 'globallog';
  currentBiz = null;
  renderGlobalLog();
}
function renderGlobalLog(filterBiz, filterType){
  currentView = 'globallog';
  filterBiz = filterBiz || 'all';
  filterType = filterType || 'all';
  document.getElementById('pageHeading').style.display = 'block';
  document.getElementById('pageTitle').textContent = 'Full Activity Log';
  document.getElementById('pageSub').textContent = 'Every income & expense entry, across all businesses';
  document.getElementById('backBtn').style.display = 'flex';

  let all = [];
  myBusinesses().forEach(b=>{
    bizData[b.id].transactions.forEach(t=> all.push({...t, bizId:b.id, bizName:b.name, bizColor:b.color}));
  });
  if(filterBiz!=='all') all = all.filter(t=>t.bizId===filterBiz);
  if(filterType!=='all') all = all.filter(t=>t.type===filterType);
  all.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));

  let html = `
  <div class="log-filters">
    <select id="logBizFilter" onchange="renderGlobalLog(this.value, document.getElementById('logTypeFilter').value)">
      <option value="all" ${filterBiz==='all'?'selected':''}>All Businesses</option>
      ${myBusinesses().map(b=>`<option value="${b.id}" ${filterBiz===b.id?'selected':''}>${b.name}</option>`).join('')}
    </select>
    <select id="logTypeFilter" onchange="renderGlobalLog(document.getElementById('logBizFilter').value, this.value)">
      <option value="all" ${filterType==='all'?'selected':''}>Income + Expenses</option>
      <option value="income" ${filterType==='income'?'selected':''}>Income Only</option>
      <option value="expense" ${filterType==='expense'?'selected':''}>Expenses Only</option>
    </select>
  </div>
  <div class="card"><h3>${all.length} Entries</h3>`;

  if(all.length===0){
    html += `<div class="empty-state"><div class="big">📭</div>No entries match this filter.</div>`;
  } else {
    html += `<table><thead><tr><th>Business</th><th>Type</th><th>Date</th><th>Category</th><th>Source / Description</th><th>Amount</th><th>Logged</th></tr></thead><tbody>`;
    all.forEach(t=>{
      const isIncome = t.type==='income';
      const edited = t.history && t.history.length>0;
      html += `<tr>
        <td><span class="chip" style="background:${t.bizColor}22; color:${t.bizColor}">${t.bizName}</span></td>
        <td><span class="chip" style="background:${isIncome?'rgba(14,203,129,.15)':'rgba(246,70,93,.15)'}; color:${isIncome?'var(--green)':'var(--red)'}">${isIncome?'Income':'Expense'}</span></td>
        <td>${t.date}</td>
        <td>${t.category}</td>
        <td>${isIncome? (t.source||'—') : (t.description||'—')}</td>
        <td class="${isIncome?'amt-pos':'amt-neg'}">${isIncome?'+':'-'} ${t.currency} ${fmt(t.amount)}</td>
        <td><div class="meta-line">${fmtDateTime(t.createdAt)}</div>${edited?`<span class="edited-tag" onclick="openBizAndHistory('${t.bizId}','${t.id}')">edited ×${t.history.length}</span>`:''}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  document.getElementById('app').innerHTML = html;
  updateReminderBadge();
}
function openBizAndHistory(bizId, txnId){
  currentBiz = bizId;
  currentTab = (bizData[bizId].transactions.find(t=>t.id===txnId)||{}).type || 'income';
  renderBizDetail();
  viewHistory('txn', txnId);
}

/* ===================== RENDER: BUSINESS DETAIL ===================== */
function openBiz(id){
  if(!canAccessBiz(id)){ showToast('Aapko is business ka access nahi hai'); return; }
  currentBiz = id; currentTab = 'overview'; currentView = 'business';
  renderBizDetail();
}
function backToDashboard(){
  currentBiz = null;
  renderDashboard();
}

function renderBizDetail(){
  currentView = 'business';
  const b = BUSINESSES.find(x=>x.id===currentBiz);
  const data = bizData[currentBiz];
  document.getElementById('pageHeading').style.display = 'block';
  document.getElementById('pageTitle').textContent = b.name;
  document.getElementById('pageSub').textContent = b.tag;
  document.getElementById('backBtn').style.display = 'flex';

  let html = `
  <div class="detail-header">
    <div class="detail-icon" style="background:color-mix(in srgb, ${b.color} 20%, transparent)">${b.icon}</div>
    <div class="detail-title"><h2>${b.name}</h2><p>${b.tag}</p></div>
  </div>
  <div class="tabs" style="--accent:${b.color}">
    <div class="tab ${currentTab==='overview'?'active':''}" onclick="switchTab('overview')">Overview</div>
    <div class="tab ${currentTab==='income'?'active':''}" onclick="switchTab('income')">Sales / Income</div>
    <div class="tab ${currentTab==='expense'?'active':''}" onclick="switchTab('expense')">Expenses</div>
    <div class="tab ${currentTab==='balance'?'active':''}" onclick="switchTab('balance')">Balance Sheet</div>
  </div>
  <div id="tabContent"></div>`;
  document.getElementById('app').innerHTML = html;
  updateReminderBadge();

  if(currentTab==='overview'){
    document.getElementById('tabContent').innerHTML = buildOverviewHTML(b, data);
    mountOverviewCharts(data);
  } else if(currentTab==='income'){
    document.getElementById('tabContent').innerHTML = buildTxnSectionHTML(b, data, 'income');
  } else if(currentTab==='expense'){
    document.getElementById('tabContent').innerHTML = buildTxnSectionHTML(b, data, 'expense');
  } else if(currentTab==='balance'){
    document.getElementById('tabContent').innerHTML = buildBalanceSheetHTML(b, data);
  }
}
function switchTab(t){ currentTab = t; renderBizDetail(); }

function buildOverviewHTML(b, data){
  const incTriple = currencyTriple(totalRMFor(data.transactions,'income'));
  const expTriple = currencyTriple(totalRMFor(data.transactions,'expense'));
  const netTriple = currencyTriple(totalRMFor(data.transactions,'net'));
  return `
  <div class="stat-strip">
    <div class="stat-box income"><div class="l">Total Income</div>${fmtDualBlock(incTriple)}</div>
    <div class="stat-box expense"><div class="l">Total Expenses</div>${fmtDualBlock(expTriple)}</div>
    <div class="stat-box profit"><div class="l">Net Profit</div>${fmtDualBlock(netTriple)}</div>
  </div>
  <div class="grid2">
    <div class="card"><h3>Monthly Income vs Expense</h3><div id="monthChart"></div></div>
    <div class="card"><h3>Expense Breakdown by Category</h3><div id="catChart"></div></div>
  </div>`;
}
function mountOverviewCharts(data){
  const incByC = totalsByCurrency(data.transactions,'income');
  const expByC = totalsByCurrency(data.transactions,'expense');
  const currency = Object.keys(incByC).length ? Object.keys(incByC)[0] : (Object.keys(expByC)[0] || 'RM');
  const months = {};
  data.transactions.forEach(t=>{
    if(t.currency !== currency) return;
    const m = t.date.slice(0,7);
    months[m] = months[m] || {income:0, expense:0};
    months[m][t.type] += Number(t.amount);
  });
  const sortedMonths = Object.keys(months).sort();
  const monthEl = document.getElementById('monthChart');
  if(monthEl) monthEl.innerHTML = buildBarChart(sortedMonths, months, currency);

  const catTotals = {};
  data.transactions.filter(t=>t.type==='expense' && t.currency===currency).forEach(t=>{
    catTotals[t.category] = (catTotals[t.category]||0) + Number(t.amount);
  });
  const catEl = document.getElementById('catChart');
  if(catEl) catEl.innerHTML = buildDonutChart(catTotals);
}

/* ===================== LIGHTWEIGHT SVG CHARTS (no external libs) ===================== */
function buildBarChart(monthsArr, months, currency){
  if(monthsArr.length===0){
    return `<div class="empty-state" style="padding:30px"><div class="big">📊</div>No data yet for a chart</div>`;
  }
  const W=520, H=240, padL=44, padB=34, padT=14, padR=10;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const maxVal = Math.max(1, ...monthsArr.map(m=>Math.max(months[m].income, months[m].expense)));
  const groupW = chartW / monthsArr.length;
  const barW = Math.min(22, groupW*0.32);
  let bars='', labels='';
  monthsArr.forEach((m,i)=>{
    const gx = padL + i*groupW + groupW/2;
    const incH = (months[m].income/maxVal)*chartH;
    const expH = (months[m].expense/maxVal)*chartH;
    bars += `<rect x="${gx-barW-2}" y="${padT+chartH-incH}" width="${barW}" height="${incH}" fill="#0ECB81" rx="3"/>`;
    bars += `<rect x="${gx+2}" y="${padT+chartH-expH}" width="${barW}" height="${expH}" fill="#F6465D" rx="3"/>`;
    labels += `<text x="${gx}" y="${H-10}" fill="#848E9C" font-size="10" text-anchor="middle">${m.slice(5)}/${m.slice(2,4)}</text>`;
  });
  let grid='';
  for(let g=0; g<=4; g++){
    const y = padT + chartH - (g/4)*chartH;
    grid += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#1c1f26"/>`;
    grid += `<text x="${padL-6}" y="${y+3}" fill="#848E9C" font-size="9" text-anchor="end">${fmt(Math.round(maxVal*g/4))}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto">
    ${grid}${bars}${labels}
  </svg>
  <div style="display:flex; gap:16px; margin-top:8px; font-size:11px; color:var(--sub)">
    <span><span style="display:inline-block;width:9px;height:9px;background:#0ECB81;border-radius:2px;margin-right:5px"></span>Income (${currency})</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#F6465D;border-radius:2px;margin-right:5px"></span>Expense (${currency})</span>
  </div>`;
}
function buildDonutChart(catTotals){
  const labels = Object.keys(catTotals);
  const palette = ['#F0B90B','#F6465D','#3B82F6','#0ECB81','#EC4899','#22D3EE','#818CF8','#F97316','#84CC16','#EAB308'];
  if(labels.length===0){
    return `<div class="empty-state" style="padding:30px"><div class="big">🍩</div>No expenses yet for a chart</div>`;
  }
  const total = labels.reduce((s,l)=>s+catTotals[l],0);
  const cx=100, cy=100, r=70, rInner=42;
  let angle = -Math.PI/2, paths='';
  labels.forEach((l,i)=>{
    const frac = catTotals[l]/total;
    const a2 = angle + frac*2*Math.PI;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    const xi1=cx+rInner*Math.cos(a2), yi1=cy+rInner*Math.sin(a2);
    const xi2=cx+rInner*Math.cos(angle), yi2=cy+rInner*Math.sin(angle);
    const large = frac>0.5 ? 1 : 0;
    paths += `<path d="M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi1},${yi1} A${rInner},${rInner} 0 ${large} 0 ${xi2},${yi2} Z" fill="${palette[i%palette.length]}"/>`;
    angle = a2;
  });
  let legend = labels.map((l,i)=>`<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--sub);margin-bottom:6px">
      <span style="width:9px;height:9px;background:${palette[i%palette.length]};border-radius:2px;display:inline-block;flex-shrink:0"></span>
      <span style="flex:1">${l}</span><span style="color:var(--text);font-weight:600">${fmt(catTotals[l])}</span>
    </div>`).join('');
  return `<div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap">
    <svg viewBox="0 0 200 200" style="width:180px; height:180px; flex-shrink:0">${paths}</svg>
    <div style="flex:1; min-width:150px">${legend}</div>
  </div>`;
}

function buildTxnSectionHTML(b, data, type){
  const cats = data.categories[type];
  const isIncome = type==='income';
  return `
  <div class="card" style="margin-bottom:18px">
    <h3>Add ${isIncome?'Sale / Income':'Expense'}</h3>
    <div class="form-row wide">
      <div class="field"><label>Date</label><input type="date" id="f_date_${type}" value="${todayStr()}"></div>
      <div class="field"><label>Category</label>
        <select id="f_cat_${type}">${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Description</label><input type="text" id="f_desc_${type}" placeholder="e.g. ${isIncome?'Client deposit':'FB Ads campaign'}"></div>
      <div class="field"><label>Amount</label><input type="number" id="f_amt_${type}" placeholder="0.00" step="0.01"></div>
      <div class="field"><label>Currency</label>
        <select id="f_cur_${type}">${CURRENCIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <button class="btn" style="background:${isIncome?'#0ECB81':'#F6465D'}" onclick="addTxn('${type}')">+ Add</button>
    </div>
    ${isIncome? `<div class="field" style="max-width:420px; margin-bottom:14px">
      <label>Source — Kahan se aya? (required)</label>
      <input type="text" id="f_source_${type}" placeholder="e.g. Client Ahmed / DP commission / Partner ABC deal">
    </div>` : ''}
    <button class="btn-add-cat" onclick="addCategory('${type}')">+ Add custom category</button>
  </div>
  <div class="card">
    <h3>${isIncome?'Income':'Expense'} History (${data.transactions.filter(t=>t.type===type).length})</h3>
    ${renderTxnTable(data, type)}
  </div>`;
}

function renderTxnTable(data, type){
  const isIncome = type==='income';
  const rows = data.transactions.filter(t=>t.type===type).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  if(rows.length===0){
    return `<div class="empty-state"><div class="big">📭</div>No entries yet. Add your first one above.</div>`;
  }
  let html = `<table><thead><tr><th>Date</th>${isIncome?'<th>Source</th>':''}<th>Category</th><th>Description</th><th>Amount</th><th>Logged</th><th></th></tr></thead><tbody>`;
  rows.forEach(t=>{
    const edited = t.history && t.history.length>0;
    html += `<tr>
      <td>${t.date}</td>
      ${isIncome? `<td>${t.source? t.source : '<span style="color:var(--sub)">—</span>'}</td>` : ''}
      <td><span class="chip" style="background:#262A33;color:#EAECEF">${t.category}</span></td>
      <td>${t.description || '—'}</td>
      <td class="${isIncome?'amt-pos':'amt-neg'}">${isIncome?'+':'-'} ${t.currency} ${fmt(t.amount)}</td>
      <td>
        <div class="meta-line">${fmtDateTime(t.createdAt)}</div>
        ${edited? `<span class="edited-tag" onclick="viewHistory('txn','${t.id}')">edited ×${t.history.length}</span>` : ''}
      </td>
      <td>
        <div class="row-actions">
          <button class="btn-ghost" onclick="editTxn('${t.id}')">Edit</button>
          <button class="btn-ghost" onclick="deleteTxn('${t.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

function buildBalanceSheetHTML(b, data){
  const inc = totalsByCurrency(data.transactions,'income');
  const exp = totalsByCurrency(data.transactions,'expense');
  const incT = currencyTriple(totalRMFor(data.transactions,'income'));
  const expT = currencyTriple(totalRMFor(data.transactions,'expense'));
  const netT = currencyTriple(totalRMFor(data.transactions,'net'));
  const currency = data.assets[0]?.currency || Object.keys(inc)[0] || Object.keys(exp)[0] || 'RM';

  const assetsTotal = data.assets.reduce((s,a)=> s+Number(a.amount), 0);
  const liabTotal = data.liabilities.reduce((s,l)=> s+Number(l.amount), 0);
  const equity = assetsTotal - liabTotal;

  return `
  <div class="grid2">
    <div class="card">
      <h3>Profit &amp; Loss Summary</h3>
      <div class="bs-item" style="align-items:flex-start"><span>Total Income</span><span class="amt-pos" style="text-align:right">RM ${fmt(incT.RM)}<br><span style="font-size:11px; opacity:.8">$ ${fmt(incT.USD)} · ₨ ${fmt(incT.PKR)}</span></span></div>
      <div class="bs-item" style="align-items:flex-start"><span>Total Expenses</span><span class="amt-neg" style="text-align:right">RM ${fmt(expT.RM)}<br><span style="font-size:11px; opacity:.8">$ ${fmt(expT.USD)} · ₨ ${fmt(expT.PKR)}</span></span></div>
      <div class="bs-total" style="align-items:flex-start"><span>Net Profit</span><span style="text-align:right">RM ${fmt(netT.RM)}<br><span style="font-size:11px; opacity:.8; font-weight:600">$ ${fmt(netT.USD)} · ₨ ${fmt(netT.PKR)}</span></span></div>
    </div>
    <div class="card">
      <h3>Add Asset / Liability (${currency})</h3>
      <div class="form-row" style="grid-template-columns:1fr 1fr auto">
        <div class="field"><label>Description</label><input type="text" id="bs_desc" placeholder="e.g. Office laptop / Bank loan"></div>
        <div class="field"><label>Amount</label><input type="number" id="bs_amt" placeholder="0.00" step="0.01"></div>
        <button class="btn" onclick="addAsset()">+ Asset</button>
      </div>
      <div class="form-row" style="grid-template-columns:1fr 1fr auto; margin-top:2px">
        <div></div><div></div>
        <button class="btn" style="background:#F6465D" onclick="addLiability()">+ Liability</button>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <div class="bs-grid">
      <div class="bs-col">
        <h4>Assets</h4>
        ${data.assets.length? data.assets.map(a=>`<div class="bs-item" style="display:block">
            <div style="display:flex; justify-content:space-between">
              <span>${a.description}</span>
              <span>${currency} ${fmt(a.amount)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px">
              <div class="meta-line">${fmtDateTime(a.createdAt)} ${a.history&&a.history.length? `<span class="edited-tag" onclick="viewHistory('asset','${a.id}')">edited ×${a.history.length}</span>`:''}</div>
              <div class="row-actions"><button class="btn-ghost" onclick="editAsset('${a.id}')">Edit</button><button class="btn-ghost" onclick="deleteAsset('${a.id}')">Delete</button></div>
            </div>
          </div>`).join('') : '<div class="bs-item" style="color:var(--sub)">No assets added yet</div>'}
        <div class="bs-total"><span>Total Assets</span><span>${currency} ${fmt(assetsTotal)}</span></div>
      </div>
      <div class="bs-col">
        <h4>Liabilities</h4>
        ${data.liabilities.length? data.liabilities.map(l=>`<div class="bs-item" style="display:block">
            <div style="display:flex; justify-content:space-between">
              <span>${l.description}</span>
              <span>${currency} ${fmt(l.amount)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px">
              <div class="meta-line">${fmtDateTime(l.createdAt)} ${l.history&&l.history.length? `<span class="edited-tag" onclick="viewHistory('liability','${l.id}')">edited ×${l.history.length}</span>`:''}</div>
              <div class="row-actions"><button class="btn-ghost" onclick="editLiability('${l.id}')">Edit</button><button class="btn-ghost" onclick="deleteLiability('${l.id}')">Delete</button></div>
            </div>
          </div>`).join('') : '<div class="bs-item" style="color:var(--sub)">No liabilities added yet</div>'}
        <div class="bs-total"><span>Total Liabilities</span><span>${currency} ${fmt(liabTotal)}</span></div>
      </div>
    </div>
    <div class="bs-total" style="margin-top:20px; font-size:16px; color:var(--gold)"><span>Net Worth (Equity)</span><span>${currency} ${fmt(equity)}</span></div>
  </div>`;
}

/* ===================== ACTIONS: ADD ===================== */
async function addTxn(type){
  const date = document.getElementById('f_date_'+type).value || todayStr();
  const category = document.getElementById('f_cat_'+type).value;
  const description = document.getElementById('f_desc_'+type).value.trim();
  const amount = parseFloat(document.getElementById('f_amt_'+type).value);
  const currency = document.getElementById('f_cur_'+type).value;
  const isIncome = type==='income';
  const source = isIncome ? (document.getElementById('f_source_'+type).value.trim()) : '';
  if(!amount || amount<=0){ showToast('Enter a valid amount'); return; }
  if(isIncome && !source){ showToast('Please enter the Source — kahan se aya hai?'); return; }
  bizData[currentBiz].transactions.push({id:uid(), type, date, category, description, amount, currency, source, createdAt:nowISO(), history:[]});
  await saveBiz(currentBiz);
  showToast((isIncome?'Income':'Expense')+' added');
  renderBizDetail();
}
async function deleteTxn(id){
  openConfirm('Delete this entry? This cannot be undone.', async ()=>{
    bizData[currentBiz].transactions = bizData[currentBiz].transactions.filter(t=>t.id!==id);
    await saveBiz(currentBiz);
    renderBizDetail();
    showToast('Entry deleted');
  });
}
async function addCategory(type){
  const label = type==='income' ? 'Income' : 'Expense';
  openModal(`
    <h3>Add ${label} Category <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="modal-field"><label>Category Name</label><input type="text" id="newCatInput" placeholder="e.g. ${type==='income'?'Broker Rebate':'Office Rent'}"></div>
    <div class="modal-actions">
      <button class="btn" onclick="saveCategory('${type}')">+ Add Category</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(()=>{ const el=document.getElementById('newCatInput'); if(el){ el.focus();
    el.addEventListener('keydown', e=>{ if(e.key==='Enter') saveCategory(type); }); } }, 50);
}
async function saveCategory(type){
  const el = document.getElementById('newCatInput');
  const name = el ? el.value.trim() : '';
  if(!name){ showToast('Enter a category name'); return; }
  if(!bizData[currentBiz].categories[type].includes(name)){
    bizData[currentBiz].categories[type].push(name);
    await saveBiz(currentBiz);
    showToast('Category added');
    closeModal();
    renderBizDetail();
  } else {
    showToast('This category already exists');
  }
}
async function addAsset(){
  const description = document.getElementById('bs_desc').value.trim();
  const amount = parseFloat(document.getElementById('bs_amt').value);
  if(!description || !amount){ showToast('Enter description & amount'); return; }
  const currency = bizData[currentBiz].assets[0]?.currency || 'RM';
  bizData[currentBiz].assets.push({id:uid(), description, amount, currency, createdAt:nowISO(), history:[]});
  await saveBiz(currentBiz); renderBizDetail(); showToast('Asset added');
}
async function addLiability(){
  const description = document.getElementById('bs_desc').value.trim();
  const amount = parseFloat(document.getElementById('bs_amt').value);
  if(!description || !amount){ showToast('Enter description & amount'); return; }
  const currency = bizData[currentBiz].assets[0]?.currency || 'RM';
  bizData[currentBiz].liabilities.push({id:uid(), description, amount, currency, createdAt:nowISO(), history:[]});
  await saveBiz(currentBiz); renderBizDetail(); showToast('Liability added');
}
async function deleteAsset(id){
  openConfirm('Delete this asset?', async ()=>{
    bizData[currentBiz].assets = bizData[currentBiz].assets.filter(a=>a.id!==id);
    await saveBiz(currentBiz); renderBizDetail();
    showToast('Asset deleted');
  });
}
async function deleteLiability(id){
  openConfirm('Delete this liability?', async ()=>{
    bizData[currentBiz].liabilities = bizData[currentBiz].liabilities.filter(l=>l.id!==id);
    await saveBiz(currentBiz); renderBizDetail();
    showToast('Liability deleted');
  });
}

/* ===================== ACTIONS: EDIT (with logged history) ===================== */
function editTxn(id){
  const t = bizData[currentBiz].transactions.find(x=>x.id===id);
  if(!t) return;
  const cats = bizData[currentBiz].categories[t.type];
  const isIncome = t.type==='income';
  const html = `
    <h3>Edit ${isIncome?'Income':'Expense'} <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="modal-field"><label>Date</label><input type="date" id="e_date" value="${t.date}"></div>
    <div class="modal-field"><label>Category</label>
      <select id="e_cat">${cats.map(c=>`<option value="${c}" ${c===t.category?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    ${isIncome? `<div class="modal-field"><label>Source — Kahan se aya?</label><input type="text" id="e_source" value="${(t.source||'').replace(/"/g,'&quot;')}"></div>` : ''}
    <div class="modal-field"><label>Description</label><input type="text" id="e_desc" value="${(t.description||'').replace(/"/g,'&quot;')}"></div>
    <div class="modal-field"><label>Amount</label><input type="number" id="e_amt" value="${t.amount}" step="0.01"></div>
    <div class="modal-field"><label>Currency</label>
      <select id="e_cur">${CURRENCIES.map(c=>`<option value="${c}" ${c===t.currency?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="meta-line" style="margin-bottom:10px">Originally logged: ${fmtDateTime(t.createdAt)}</div>
    <div class="modal-actions">
      <button class="btn" onclick="saveEditTxn('${id}')">Save Changes</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
  openModal(html);
}
function saveEditTxn(id){
  const t = bizData[currentBiz].transactions.find(x=>x.id===id);
  if(!t) return;
  const isIncome = t.type==='income';
  const newVals = {
    date: document.getElementById('e_date').value || t.date,
    category: document.getElementById('e_cat').value,
    description: document.getElementById('e_desc').value.trim(),
    amount: parseFloat(document.getElementById('e_amt').value),
    currency: document.getElementById('e_cur').value,
    source: isIncome ? document.getElementById('e_source').value.trim() : t.source,
  };
  if(!newVals.amount || newVals.amount<=0){ showToast('Enter a valid amount'); return; }
  if(isIncome && !newVals.source){ showToast('Source is required for income'); return; }

  const changes = {};
  Object.keys(newVals).forEach(k=>{ if(String(t[k]) !== String(newVals[k])) changes[k] = {from:t[k], to:newVals[k]}; });
  if(Object.keys(changes).length===0){ showToast('No changes made'); closeModal(); return; }
  openConfirm('Ye changes save kar dein?', async ()=>{
    t.history = t.history || [];
    t.history.push({editedAt: nowISO(), changes});
    Object.assign(t, newVals);
    await saveBiz(currentBiz);
    showToast('Changes saved & logged');
    closeModal();
    renderBizDetail();
  }, {label:'Yes, Save Changes', danger:false});
}

function editAsset(id){ editBSItem('asset', id); }
function editLiability(id){ editBSItem('liability', id); }
function editBSItem(kind, id){
  const list = kind==='asset' ? bizData[currentBiz].assets : bizData[currentBiz].liabilities;
  const item = list.find(x=>x.id===id);
  if(!item) return;
  const html = `
    <h3>Edit ${kind==='asset'?'Asset':'Liability'} <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="modal-field"><label>Description</label><input type="text" id="e_bsdesc" value="${(item.description||'').replace(/"/g,'&quot;')}"></div>
    <div class="modal-field"><label>Amount</label><input type="number" id="e_bsamt" value="${item.amount}" step="0.01"></div>
    <div class="meta-line" style="margin-bottom:10px">Originally logged: ${fmtDateTime(item.createdAt)}</div>
    <div class="modal-actions">
      <button class="btn" onclick="saveEditBSItem('${kind}','${id}')">Save Changes</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
  openModal(html);
}
function saveEditBSItem(kind, id){
  const list = kind==='asset' ? bizData[currentBiz].assets : bizData[currentBiz].liabilities;
  const item = list.find(x=>x.id===id);
  if(!item) return;
  const newVals = {
    description: document.getElementById('e_bsdesc').value.trim(),
    amount: parseFloat(document.getElementById('e_bsamt').value),
  };
  if(!newVals.description || !newVals.amount){ showToast('Enter description & amount'); return; }
  const changes = {};
  Object.keys(newVals).forEach(k=>{ if(String(item[k]) !== String(newVals[k])) changes[k] = {from:item[k], to:newVals[k]}; });
  if(Object.keys(changes).length===0){ showToast('No changes made'); closeModal(); return; }
  openConfirm('Ye changes save kar dein?', async ()=>{
    item.history = item.history || [];
    item.history.push({editedAt: nowISO(), changes});
    Object.assign(item, newVals);
    await saveBiz(currentBiz);
    showToast('Changes saved & logged');
    closeModal();
    renderBizDetail();
  }, {label:'Yes, Save Changes', danger:false});
}

/* ===================== HISTORY VIEWER ===================== */
function viewHistory(kind, id){
  let item, title;
  if(kind==='txn'){ item = bizData[currentBiz].transactions.find(x=>x.id===id); title = (item.type==='income'?'Income':'Expense')+' — Edit History'; }
  else if(kind==='asset'){ item = bizData[currentBiz].assets.find(x=>x.id===id); title = 'Asset — Edit History'; }
  else { item = bizData[currentBiz].liabilities.find(x=>x.id===id); title = 'Liability — Edit History'; }
  if(!item) return;

  const hist = (item.history||[]).slice().reverse();
  let body = `<div class="meta-line" style="margin-bottom:12px">Added on: <b style="color:var(--text)">${fmtDateTime(item.createdAt)}</b></div>`;
  if(hist.length===0){
    body += `<div style="color:var(--sub); font-size:13px">No edits made yet.</div>`;
  } else {
    hist.forEach(h=>{
      const chgLines = Object.keys(h.changes).map(f=>{
        const c = h.changes[f];
        return `<div class="chg">${f}: <b>${c.from||'—'}</b> → <b>${c.to||'—'}</b></div>`;
      }).join('');
      body += `<div class="history-item"><div class="ts">${fmtDateTime(h.editedAt)}</div>${chgLines}</div>`;
    });
  }
  openModal(`<h3>${title} <span class="modal-close" onclick="closeModal()">✕</span></h3>${body}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
}

document.getElementById('backBtn').addEventListener('click', ()=>{
  if(currentView==='reminders' || currentView==='globallog' || currentView==='collaborators'){ currentBiz=null; renderDashboard(); }
  else backToDashboard();
});
document.getElementById('reminderBtn').addEventListener('click', openReminders);

/* ===================== ACCESS GATE (Owner / Collaborator) ===================== */
function renderGate(mode){
  document.getElementById('sessionBar').style.display = 'none';
  document.getElementById('collabBtn').style.display = 'none';
  document.getElementById('reminderBtn').style.display = 'none';
  document.getElementById('bizCountBadge').style.display = 'none';
  document.getElementById('signOutBtn').style.display = 'none';
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('fabReminder').style.display = 'none';
  document.getElementById('pageHeading').style.display = 'none';
  document.getElementById('pageTitle').textContent = 'Business Empire';
  document.getElementById('pageSub').textContent = 'Sign in to continue';

  if(!ownerPasscode){
    document.getElementById('app').innerHTML = `
    <div class="gate-wrap"><div class="gate-card">
      <h2>🔐 First-time Setup</h2>
      <p>Koi Owner Passcode set nahi hai abhi tak. Ye passcode aap (Shahid) hamesha dashboard kholne ke liye use karenge, aur isi se collaborators approve karenge.</p>
      <div class="modal-field" style="text-align:left"><label>Create Owner Passcode</label><input type="password" id="setupPass1" placeholder="e.g. a memorable phrase"></div>
      <div class="modal-field" style="text-align:left"><label>Confirm Passcode</label><input type="password" id="setupPass2" placeholder="Retype it"></div>
      <button class="btn" style="width:100%; margin-top:6px" onclick="doOwnerSetup()">Create & Enter Dashboard</button>
    </div></div>`;
    return;
  }

  if(mode==='owner'){
    document.getElementById('app').innerHTML = `
    <div class="gate-wrap"><div class="gate-card">
      <h2>🔑 Owner Sign-in</h2>
      <p>Apna Owner Passcode daalein.</p>
      <div class="modal-field" style="text-align:left"><input type="password" id="ownerPassInput" placeholder="Owner Passcode"></div>
      <button class="btn" style="width:100%; margin-top:6px" onclick="tryOwnerLogin()">Enter Dashboard</button>
      <span class="gate-back" onclick="renderGate()">← Back</span>
    </div></div>`;
    return;
  }
  if(mode==='collab'){
    document.getElementById('app').innerHTML = `
    <div class="gate-wrap"><div class="gate-card">
      <h2>🙋 Collaborator Sign-in</h2>
      <p>Apni email daalein jo aapko business owner se milegi/di gayi hai.</p>
      <div class="modal-field" style="text-align:left"><input type="email" id="collabEmailInput" placeholder="you@example.com"></div>
      <button class="btn" style="width:100%; margin-top:6px" onclick="tryCollabLogin()">Continue</button>
      <span class="gate-back" onclick="renderGate()">← Back</span>
    </div></div>`;
    return;
  }
  // default choice screen
  document.getElementById('app').innerHTML = `
  <div class="gate-wrap"><div class="gate-card">
    <h2>👋 Welcome</h2>
    <p>Kaun sign in kar raha hai?</p>
    <div class="gate-choice">
      <div class="gate-btn" onclick="renderGate('owner')"><span class="ic">🔑</span> I'm the Owner (Shahid)</div>
      <div class="gate-btn" onclick="renderGate('collab')"><span class="ic">🙋</span> I'm a Collaborator</div>
    </div>
  </div></div>`;
}
async function doOwnerSetup(){
  const p1 = document.getElementById('setupPass1').value.trim();
  const p2 = document.getElementById('setupPass2').value.trim();
  if(!p1 || p1.length<4){ showToast('Passcode kam se kam 4 characters ka rakhein'); return; }
  if(p1!==p2){ showToast('Passcode match nahi hua'); return; }
  await saveOwnerPasscode(p1);
  ownerPasscode = p1;
  await saveMySession({role:'owner'});
  accessMode = 'owner'; allowedBizIds = null;
  proceedToApp();
}
async function tryOwnerLogin(){
  const p = document.getElementById('ownerPassInput').value.trim();
  if(p !== ownerPasscode){ showToast('Galat passcode'); return; }
  await saveMySession({role:'owner'});
  accessMode = 'owner'; allowedBizIds = null;
  proceedToApp();
}
async function tryCollabLogin(){
  const email = document.getElementById('collabEmailInput').value.trim().toLowerCase();
  if(!email || !email.includes('@')){ showToast('Valid email daalein'); return; }
  const entry = collaborators.find(c=>c.email.toLowerCase()===email);
  if(entry && entry.status==='approved'){
    await saveMySession({role:'collaborator', email});
    accessMode='collaborator'; myEmail=email; allowedBizIds = entry.businessIds;
    proceedToApp();
  } else if(entry && entry.status==='pending'){
    await saveMySession({role:'collaborator', email});
    renderPendingScreen(email);
  } else {
    renderRequestAccessScreen(email);
  }
}
function renderPendingScreen(email){
  document.getElementById('app').innerHTML = `
  <div class="gate-wrap"><div class="gate-card">
    <h2>⏳ Waiting for Approval</h2>
    <p>Aapki request (<b style="color:var(--text)">${email}</b>) owner ko bhej di gayi hai. Jaise hi approve hogi, aap sign in kar sakenge.</p>
    <button class="btn" style="width:100%" onclick="tryCollabLogin_check('${email}')">🔄 Check Again</button>
    <span class="gate-back" onclick="signOut()">← Use a different email</span>
  </div></div>`;
}
async function tryCollabLogin_check(email){
  collaborators = await loadCollaborators();
  const entry = collaborators.find(c=>c.email.toLowerCase()===email.toLowerCase());
  if(entry && entry.status==='approved'){
    accessMode='collaborator'; myEmail=email; allowedBizIds = entry.businessIds;
    proceedToApp();
  } else {
    showToast('Abhi tak approve nahi hui — thodi der baad try karein');
  }
}
function renderRequestAccessScreen(email){
  document.getElementById('app').innerHTML = `
  <div class="gate-wrap"><div class="gate-card">
    <h2>📨 Request Access</h2>
    <p>Aap system mein nahi hain. Batayein kis business (ya businesses) ka access chahiye — owner ko request chali jayegi.</p>
    <div class="modal-field" style="text-align:left"><label>Your Name (optional)</label><input type="text" id="reqName" placeholder="e.g. Ali — DP Team"></div>
    <div class="biz-check-list">
      ${BUSINESSES.map(b=>`<label class="biz-check-item"><input type="checkbox" value="${b.id}" class="reqBizChk"> ${b.icon} ${b.name}</label>`).join('')}
    </div>
    <button class="btn" style="width:100%; margin-top:10px" onclick="submitAccessRequest('${email}')">Send Request</button>
    <span class="gate-back" onclick="signOut()">← Use a different email</span>
  </div></div>`;
}
async function submitAccessRequest(email){
  const chosen = Array.from(document.querySelectorAll('.reqBizChk:checked')).map(el=>el.value);
  const name = document.getElementById('reqName').value.trim();
  if(chosen.length===0){ showToast('Kam se kam ek business select karein'); return; }
  collaborators = await loadCollaborators();
  collaborators.push({id:uid(), email, name, businessIds:chosen, status:'pending', requestedAt:nowISO(), history:[]});
  await saveCollaboratorsList();
  await saveMySession({role:'collaborator', email});
  renderPendingScreen(email);
  showToast('Request bhej di gayi');
}
async function signOut(){
  await saveMySession({});
  accessMode=null; myEmail=''; allowedBizIds=null;
  renderGate();
}

function proceedToApp(){
  document.getElementById('reminderBtn').style.display = 'flex';
  document.getElementById('signOutBtn').style.display = 'flex';
  document.getElementById('fabReminder').style.display = 'flex';
  document.getElementById('bizCountBadge').style.display = 'flex';
  document.getElementById('pageHeading').style.display = 'block';
  const sb = document.getElementById('sessionBar');
  sb.style.display = 'flex';
  sb.innerHTML = accessMode==='owner' ? 'Signed in as <b>Owner</b>' : `Signed in as <b>${myEmail}</b> (Collaborator)`;
  if(accessMode==='owner'){
    document.getElementById('collabBtn').style.display = 'flex';
    updateCollabBadge();
  }
  renderDashboard();
}

/* ===================== COLLABORATORS MANAGEMENT (Owner only) ===================== */
function updateCollabBadge(){
  const badge = document.getElementById('collabBadge');
  if(!badge) return;
  const pending = collaborators.filter(c=>c.status==='pending').length;
  badge.textContent = pending;
  badge.classList.toggle('zero', pending===0);
  if(pending>0) badge.style.background = 'var(--red)';
}
function openCollaborators(){
  if(accessMode!=='owner') return;
  currentView = 'collaborators';
  currentBiz = null;
  renderCollaborators();
}
function renderCollaborators(){
  currentView = 'collaborators';
  document.getElementById('pageHeading').style.display = 'block';
  document.getElementById('pageTitle').textContent = 'Collaborators';
  document.getElementById('pageSub').textContent = 'Kis ko kaunsa business dikhna chahiye — manage yahan se karein';
  document.getElementById('backBtn').style.display = 'flex';

  const pending = collaborators.filter(c=>c.status==='pending');
  const approved = collaborators.filter(c=>c.status==='approved');

  function bizNames(ids){ return (ids||[]).map(id=> BUSINESSES.find(b=>b.id===id)?.name || id).join(', ') || '—'; }

  let html = `
  <div class="rem-toprow">
    <button class="btn" onclick="openAddCollaboratorModal()">+ Add Collaborator Directly</button>
  </div>
  <div class="rem-section-title">🟡 Pending Requests (${pending.length})</div>
  ${pending.length? pending.map(c=>`<div class="rem-item">
      <div class="rem-body">
        <div class="rem-title">${esc2(c.email)} ${c.name?'· '+esc2(c.name):''}</div>
        <div class="rem-sub">Requested access: ${bizNames(c.businessIds)} · ${fmtDateTime(c.requestedAt)}</div>
      </div>
      <div class="row-actions">
        <button class="btn" style="background:var(--green)" onclick="approveCollaborator('${c.id}')">Approve</button>
        <button class="btn-ghost" onclick="rejectCollaborator('${c.id}')">Reject</button>
      </div>
    </div>`).join('') : `<div class="empty-state" style="padding:24px; color:var(--sub)">Koi pending request nahi hai</div>`}

  <div class="rem-section-title">✅ Approved Collaborators (${approved.length})</div>
  ${approved.length? approved.map(c=>`<div class="rem-item">
      <div class="rem-body">
        <div class="rem-title">${esc2(c.email)} ${c.name?'· '+esc2(c.name):''}</div>
        <div class="rem-sub">Access: ${bizNames(c.businessIds)}</div>
      </div>
      <div class="row-actions">
        <button class="btn-ghost" onclick="editCollaboratorAccess('${c.id}')">Edit Access</button>
        <button class="btn-ghost" onclick="revokeCollaborator('${c.id}')">Revoke</button>
      </div>
    </div>`).join('') : `<div class="empty-state" style="padding:24px; color:var(--sub)">Koi approved collaborator nahi hai abhi tak</div>`}`;

  document.getElementById('app').innerHTML = html;
  updateCollabBadge();
}
async function approveCollaborator(id){
  const c = collaborators.find(x=>x.id===id);
  if(!c) return;
  c.status = 'approved'; c.approvedAt = nowISO();
  await saveCollaboratorsList();
  showToast('Collaborator approved ✅');
  renderCollaborators();
}
async function rejectCollaborator(id){
  openConfirm('Ye request reject kar dein?', async ()=>{
    collaborators = collaborators.filter(x=>x.id!==id);
    await saveCollaboratorsList();
    renderCollaborators();
    showToast('Request rejected');
  }, {label:'Yes, Reject'});
}
async function revokeCollaborator(id){
  openConfirm('Is collaborator ki access hata dein?', async ()=>{
    collaborators = collaborators.filter(x=>x.id!==id);
    await saveCollaboratorsList();
    renderCollaborators();
    showToast('Access revoked');
  }, {label:'Yes, Revoke'});
}
function editCollaboratorAccess(id){
  const c = collaborators.find(x=>x.id===id);
  if(!c) return;
  openModal(`
    <h3>Edit Access — ${esc2(c.email)} <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="biz-check-list">
      ${BUSINESSES.map(b=>`<label class="biz-check-item"><input type="checkbox" value="${b.id}" class="editBizChk" ${c.businessIds.includes(b.id)?'checked':''}> ${b.icon} ${b.name}</label>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="saveCollaboratorAccess('${id}')">Save</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function saveCollaboratorAccess(id){
  const c = collaborators.find(x=>x.id===id);
  if(!c) return;
  const chosen = Array.from(document.querySelectorAll('.editBizChk:checked')).map(el=>el.value);
  if(chosen.length===0){ showToast('Kam se kam ek business select karein'); return; }
  openConfirm('Is collaborator ki access update kar dein?', async ()=>{
    c.businessIds = chosen;
    await saveCollaboratorsList();
    closeModal();
    renderCollaborators();
    showToast('Access updated');
  }, {label:'Yes, Update', danger:false});
}
function openAddCollaboratorModal(){
  openModal(`
    <h3>Add Collaborator Directly <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="modal-field"><label>Email</label><input type="email" id="newCollabEmail" placeholder="collaborator@example.com"></div>
    <div class="modal-field"><label>Name (optional)</label><input type="text" id="newCollabName" placeholder="e.g. Ali — DP Team"></div>
    <div class="biz-check-list">
      ${BUSINESSES.map(b=>`<label class="biz-check-item"><input type="checkbox" value="${b.id}" class="newCollabChk"> ${b.icon} ${b.name}</label>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="saveNewCollaborator()">Add — pre-approved</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function saveNewCollaborator(){
  const email = document.getElementById('newCollabEmail').value.trim().toLowerCase();
  const name = document.getElementById('newCollabName').value.trim();
  const chosen = Array.from(document.querySelectorAll('.newCollabChk:checked')).map(el=>el.value);
  if(!email || !email.includes('@')){ showToast('Valid email daalein'); return; }
  if(chosen.length===0){ showToast('Kam se kam ek business select karein'); return; }
  if(collaborators.some(c=>c.email.toLowerCase()===email)){ showToast('Ye email pehle se list mein hai'); return; }
  collaborators.push({id:uid(), email, name, businessIds:chosen, status:'approved', requestedAt:nowISO(), approvedAt:nowISO(), history:[]});
  await saveCollaboratorsList();
  closeModal();
  renderCollaborators();
  showToast('Collaborator added ✅ — inhe email/URL bata dein sign in karne ke liye');
}

/* ===================== THEME (Light / Dark) ===================== */
async function applySavedTheme(){
  let theme = 'dark';
  try{ const r = await window.storage.get('ui-theme', false); if(r && r.value) theme = r.value; }catch(e){}
  document.body.classList.toggle('light-theme', theme==='light');
}
async function toggleTheme(){
  const isLight = document.body.classList.toggle('light-theme');
  try{ await window.storage.set('ui-theme', isLight?'light':'dark', false); }catch(e){}
  renderSidebarContent();
}

/* ===================== SIDEBAR ===================== */
function openSidebar(){
  document.getElementById('sidebarOverlay').classList.add('show');
  document.getElementById('sidebar').classList.add('show');
  renderSidebarContent();
}
function closeSidebar(){
  document.getElementById('sidebarOverlay').classList.remove('show');
  document.getElementById('sidebar').classList.remove('show');
}
function renderSidebarContent(){
  const isLight = document.body.classList.contains('light-theme');
  const myName = accessMode==='owner' ? (ownerProfile.name || 'Shahid') : ((collaborators.find(c=>c.email===myEmail)||{}).name || myEmail);
  const initial = (myName||'?').trim().charAt(0).toUpperCase();
  const avatarInner = myAvatar ? `<img src="${myAvatar}" alt="avatar">` : `<span>${initial}</span>`;

  let html = `
  <div class="menu-list">
    <div class="menu-avatar-row">
      <div class="menu-avatar" onclick="triggerAvatarUpload()" title="Tap to change photo">
        ${avatarInner}
        <span class="cam-badge">📷</span>
      </div>
      <input type="file" id="avatarFileInput" accept="image/*" style="display:none" onchange="handleAvatarUpload(event)">
      <div>
        <div class="menu-name">${esc2(myName)}</div>
        <div class="menu-sub">${accessMode==='owner' ? '🔑 Owner' : '🙋 Collaborator'}</div>
      </div>
    </div>

    <button class="menu-item accent" onclick="goHome();"><span class="mi-icon">🏠</span> Home</button>

    ${!isPwaStandalone() ? `<button class="menu-item" onclick="closeSidebar(); installPWA();"><span class="mi-icon">📲</span> Install App</button>` : ''}

    <button class="menu-item" onclick="closeSidebar(); openProfileModal();"><span class="mi-icon">👤</span> Profile</button>

    <button class="menu-item" onclick="toggleTheme()">
      <span class="mi-icon">${isLight?'☀️':'🌙'}</span> Light Theme
      <span class="mi-right"><span class="menu-toggle ${isLight?'on':''}"><span class="knob"></span></span></span>
    </button>

    <details class="sidebar-details" ${sidebarBizOpen?'open':''} ontoggle="sidebarBizOpen=this.open">
      <summary><span class="mi-icon">🏢</span> Businesses (${myBusinesses().length})</summary>
      <div style="padding:4px 8px 8px 40px">
        ${accessMode==='owner' ? `<button class="btn" style="width:100%; margin-bottom:10px" onclick="openAddBusinessModal()">+ Add Business</button>` : ''}
        <div class="sidebar-biz-list" style="padding-left:0">
          ${myBusinesses().map(b=>`<div class="sidebar-biz-item">
              <span onclick="closeSidebar(); openBiz('${b.id}')">${b.icon} ${esc2(b.name)}</span>
              ${accessMode==='owner' ? `<span class="sidebar-biz-actions">
                  <button class="icon-btn" onclick="openEditBusinessModal('${b.id}')" title="Edit">✎</button>
                  <button class="icon-btn" onclick="confirmDeleteBusiness('${b.id}')" title="Delete">🗑</button>
                </span>` : ''}
            </div>`).join('') || `<div style="font-size:12px; color:var(--sub)">Koi business nahi hai</div>`}
        </div>
      </div>
    </details>

    <button class="menu-item" onclick="closeSidebar(); signOut();"><span class="mi-icon">🔓</span> Switch User</button>
    <button class="menu-item" onclick="closeSidebar(); openAboutModal();"><span class="mi-icon">ℹ️</span> About App</button>
    <button class="menu-item" onclick="closeSidebar(); shareApp();"><span class="mi-icon">🔗</span> Share App</button>
  </div>`;
  document.getElementById('sidebarContent').innerHTML = html;
}
function triggerAvatarUpload(){
  document.getElementById('avatarFileInput').click();
}
function handleAvatarUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('Sirf image files allowed hain'); return; }
  if(file.size > 3*1024*1024){ showToast('Image 3MB se choti honi chahiye'); return; }
  const reader = new FileReader();
  reader.onload = async function(ev){
    myAvatar = ev.target.result;
    await saveAvatarData(myAvatar);
    renderSidebarContent();
    showToast('Profile photo updated ✅');
  };
  reader.readAsDataURL(file);
}

/* ===================== BUSINESS: ADD / EDIT / DELETE ===================== */
function bizFormFields(b){
  const name = b ? esc(b.name) : '';
  const tag = b ? esc(b.tag) : '';
  const icon = b ? b.icon : '💼';
  const color = b ? b.color : BIZ_COLOR_PALETTE[BUSINESSES.length % BIZ_COLOR_PALETTE.length];
  return `
    <div class="modal-field"><label>Business Name</label><input type="text" id="biz_name" placeholder="e.g. Gold Trading Desk" value="${name}"></div>
    <div class="modal-field"><label>Short Description / Tag</label><input type="text" id="biz_tag" placeholder="e.g. Precious metals trading" value="${tag}"></div>
    <div class="modal-field"><label>Icon (emoji)</label>
      <input type="text" id="biz_icon" maxlength="4" value="${icon}" style="width:70px; text-align:center; font-size:18px;">
      <div class="color-swatches">${BIZ_ICON_SUGGESTIONS.map(ic=>`<span style="cursor:pointer; font-size:18px;" onclick="document.getElementById('biz_icon').value='${ic}'">${ic}</span>`).join('')}</div>
    </div>
    <div class="modal-field"><label>Color</label>
      <div class="color-swatches" id="biz_color_swatches">
        ${BIZ_COLOR_PALETTE.map(c=>`<span class="color-swatch ${c===color?'sel':''}" style="background:${c}" onclick="selectBizColor('${c}', this)"></span>`).join('')}
      </div>
      <input type="hidden" id="biz_color" value="${color}">
    </div>`;
}
function selectBizColor(c, el){
  document.getElementById('biz_color').value = c;
  document.querySelectorAll('#biz_color_swatches .color-swatch').forEach(s=> s.classList.remove('sel'));
  el.classList.add('sel');
}
function openAddBusinessModal(){
  openModal(`
    <h3>+ Add Business <span class="modal-close" onclick="closeModal()">✕</span></h3>
    ${bizFormFields(null)}
    <div class="modal-actions">
      <button class="btn" onclick="saveNewBusiness()">Add Business</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function saveNewBusiness(){
  const name = document.getElementById('biz_name').value.trim();
  const tag = document.getElementById('biz_tag').value.trim();
  const icon = document.getElementById('biz_icon').value.trim() || '💼';
  const color = document.getElementById('biz_color').value;
  if(!name){ showToast('Business ka naam daalein'); return; }
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'biz';
  if(BUSINESSES.some(b=>b.id===id)) id = id + '-' + uid().slice(0,4);
  const newBiz = {id, name, tag, icon, color};
  BUSINESSES.push(newBiz);
  bizData[id] = {transactions:[], categories:{expense:[...EXPENSE_CATS_DEFAULT], income:[...INCOME_CATS_DEFAULT]}, assets:[], liabilities:[]};
  bizOrderState.order.push(id);
  await saveBusinessesList();
  await saveOrder();
  closeModal();
  renderSidebarContent();
  updateBizCountBadge();
  if(currentView==='dashboard') renderDashboard();
  showToast('Business added ✅');
}
function openEditBusinessModal(id){
  const b = BUSINESSES.find(x=>x.id===id);
  if(!b) return;
  openModal(`
    <h3>Edit Business <span class="modal-close" onclick="closeModal()">✕</span></h3>
    ${bizFormFields(b)}
    <div class="modal-actions">
      <button class="btn" onclick="saveEditBusiness('${id}')">Save Changes</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function saveEditBusiness(id){
  const b = BUSINESSES.find(x=>x.id===id);
  if(!b) return;
  const name = document.getElementById('biz_name').value.trim();
  const tag = document.getElementById('biz_tag').value.trim();
  const icon = document.getElementById('biz_icon').value.trim() || '💼';
  const color = document.getElementById('biz_color').value;
  if(!name){ showToast('Business ka naam daalein'); return; }
  openConfirm(`"${esc2(name)}" ki details update kar dein?`, async ()=>{
    b.name = name; b.tag = tag; b.icon = icon; b.color = color;
    await saveBusinessesList();
    closeModal();
    renderSidebarContent();
    updateBizCountBadge();
    if(currentView==='dashboard') renderDashboard();
    if(currentView==='business' && currentBiz===id) renderBizDetail();
    showToast('Business updated ✅');
  }, {label:'Yes, Save Changes', danger:false});
}
function confirmDeleteBusiness(id){
  const b = BUSINESSES.find(x=>x.id===id);
  if(!b) return;
  openConfirm(`"${esc2(b.name)}" ko delete kar dein? Iska saara income/expense/balance sheet data bhi hamesha ke liye chala jayega — ye wapis nahi aa sakta.`, async ()=>{
    BUSINESSES = BUSINESSES.filter(x=>x.id!==id);
    delete bizData[id];
    bizOrderState.order = bizOrderState.order.filter(x=>x!==id);
    collaborators.forEach(c=> c.businessIds = (c.businessIds||[]).filter(x=>x!==id));
    await saveBusinessesList();
    await saveOrder();
    await saveCollaboratorsList();
    try{ await window.storage.delete('biz:'+id, true); }catch(e){}
    closeModal();
    renderSidebarContent();
    updateBizCountBadge();
    if(currentView==='dashboard') renderDashboard();
    else { currentBiz=null; renderDashboard(); }
    showToast('Business deleted');
  });
}

/* ===================== PROFILE ===================== */
function openProfileModal(){
  if(accessMode==='owner'){
    openModal(`
      <h3>Edit Profile <span class="modal-close" onclick="closeModal()">✕</span></h3>
      <div class="modal-field"><label>Name</label><input type="text" id="pf_name" placeholder="e.g. Shahid" value="${esc(ownerProfile.name||'')}"></div>
      <div class="modal-field"><label>Email Address</label><input type="email" id="pf_email" placeholder="you@example.com" value="${esc(ownerProfile.email||'')}"></div>
      <div class="modal-field"><label>Contact Number</label><input type="tel" id="pf_phone" placeholder="e.g. +60 12-345 6789" value="${esc(ownerProfile.phone||'')}"></div>
      <div class="modal-actions">
        <button class="btn" onclick="confirmSaveProfile()">Save Changes</button>
        <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
      <div style="border-top:1px solid var(--border); margin-top:18px; padding-top:16px">
        <div class="mini-label">Security</div>
        <button class="btn-ghost" style="width:100%" onclick="openPinResetModal()">🔑 Reset Owner Passcode</button>
      </div>`);
  } else {
    const entry = collaborators.find(c=>c.email.toLowerCase()===myEmail.toLowerCase());
    openModal(`
      <h3>Edit Profile <span class="modal-close" onclick="closeModal()">✕</span></h3>
      <div class="modal-field"><label>Name</label><input type="text" id="pf_name" placeholder="Your name" value="${esc(entry?entry.name||'':'')}"></div>
      <div class="modal-field"><label>Contact Number</label><input type="tel" id="pf_phone" placeholder="e.g. +60 12-345 6789" value="${esc(entry?entry.phone||'':'')}"></div>
      <div class="modal-field"><label>Email Address</label><input type="email" value="${esc(myEmail)}" disabled style="opacity:.6"></div>
      <div style="font-size:11.5px; color:var(--sub); margin-bottom:14px">Email badalne ke liye "Switch User" se dobara sign in karein.</div>
      <div class="modal-actions">
        <button class="btn" onclick="confirmSaveProfile()">Save Changes</button>
        <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
  }
}
function confirmSaveProfile(){
  const name = document.getElementById('pf_name').value.trim();
  const phone = document.getElementById('pf_phone').value.trim();
  const email = accessMode==='owner' ? document.getElementById('pf_email').value.trim() : null;
  openConfirm('Profile changes save kar dein?', async ()=>{
    if(accessMode==='owner'){
      ownerProfile = {name, email: email||'', phone};
      await saveOwnerProfileData();
    } else {
      const entry = collaborators.find(c=>c.email.toLowerCase()===myEmail.toLowerCase());
      if(entry){ entry.name = name; entry.phone = phone; await saveCollaboratorsList(); }
    }
    closeModal();
    renderSidebarContent();
    showToast('Profile updated ✅');
  }, {label:'Yes, Save Changes', danger:false});
}
function openPinResetModal(){
  openModal(`
    <h3>Reset Owner Passcode <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="modal-field"><label>Current Passcode</label><input type="password" id="pin_current"></div>
    <div class="modal-field"><label>New Passcode</label><input type="password" id="pin_new"></div>
    <div class="modal-field"><label>Confirm New Passcode</label><input type="password" id="pin_confirm"></div>
    <div class="modal-actions">
      <button class="btn" onclick="confirmPinReset()">Reset Passcode</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function confirmPinReset(){
  const cur = document.getElementById('pin_current').value;
  const n1 = document.getElementById('pin_new').value;
  const n2 = document.getElementById('pin_confirm').value;
  if(cur !== ownerPasscode){ showToast('Current passcode galat hai'); return; }
  if(!n1 || n1.length<4){ showToast('Naya passcode kam se kam 4 characters ka rakhein'); return; }
  if(n1 !== n2){ showToast('New passcode match nahi hua'); return; }
  openConfirm('Passcode reset kar dein? Aapko agli baar naya passcode use karna hoga.', async ()=>{
    ownerPasscode = n1;
    await saveOwnerPasscode(n1);
    closeModal();
    showToast('Passcode reset ho gaya ✅');
  }, {label:'Yes, Reset Passcode', danger:false});
}

/* ===================== ABOUT / SHARE ===================== */
function openAboutModal(){
  openModal(`
    <h3>About this App <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div style="font-size:13.5px; line-height:1.7; color:var(--text)">
      <p style="font-weight:800; font-size:16px; margin-bottom:4px">Business Empire</p>
      <p style="color:var(--sub); font-size:11.5px; text-transform:uppercase; letter-spacing:.6px; margin-bottom:14px">Business Command Center</p>
      <p style="margin-bottom:10px">Ek hi jagah se aapke saare businesses ki income, expenses, balance sheet, reminders aur team collaboration manage karne ka private dashboard.</p>
      <p style="color:var(--sub); font-size:12px">Built for Shahid's Business Empire · All data stored securely for this dashboard only</p>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
}
function shareApp(){
  const link = window.location.href;
  openModal(`
    <h3>🔗 Share App <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div style="font-size:13.5px; line-height:1.6; margin-bottom:14px">Ye link kisi ko bhi bhej dein taake wo Business Empire dashboard khol sakein.</div>
    <div class="modal-field">
      <label>App Link</label>
      <input type="text" id="shareLinkInput" value="${link}" readonly onclick="this.select()">
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="copyShareLink()">📋 Copy Link</button>
      ${navigator.share ? `<button class="btn-ghost" onclick="nativeShareApp()">📤 Share via...</button>` : ''}
    </div>
    <div class="email-note" style="margin-top:16px">Note: Naye sign-in karne wale "Collaborator" ke tor pe apni email daalein, aap unko owner ki taraf se approve karenge — is se wo sirf apna assigned business hi dekh sakenge.</div>`);
}
function copyShareLink(){
  const link = window.location.href;
  if(navigator.clipboard){
    navigator.clipboard.writeText(link).then(()=> showToast('Link copied ✅')).catch(()=> showToast('Copy nahi ho saka'));
  } else {
    const el = document.getElementById('shareLinkInput');
    el.select(); document.execCommand('copy');
    showToast('Link copied ✅');
  }
}
function nativeShareApp(){
  const shareData = { title:'Business Empire — Business Command Center', text:'Yahan se dekhein — Business Empire dashboard', url: window.location.href };
  if(navigator.share) navigator.share(shareData).catch(()=>{});
}
function esc2(s){ return (s||'').replace(/</g,'&lt;'); }
function esc(s){ return (s||'').replace(/"/g,'&quot;'); }

function openReminderModal(existingId){
  const r = existingId ? reminders.find(x=>x.id===existingId) : null;
  const bizOptions = (accessMode==='owner' ? `<option value="">General / Personal</option>` : '') + myBusinesses().map(b=>`<option value="${b.id}" ${r&&r.business===b.id?'selected':''}>${b.name}</option>`).join('');
  const repeat = r ? r.repeat : 'once';
  const html = `
    <h3>${r?'Edit':'New'} Reminder <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div class="modal-field"><label>Title</label><input type="text" id="rm_title" placeholder="e.g. DP team ka weekly report check" value="${r?esc(r.title):''}"></div>
    <div class="modal-field"><label>Note (optional)</label><input type="text" id="rm_note" placeholder="Extra detail" value="${r?esc(r.note||''):''}"></div>
    <div class="modal-field"><label>Related Business</label><select id="rm_biz">${bizOptions}</select></div>
    <div class="modal-field"><label>Repeat</label>
      <select id="rm_repeat" onchange="toggleRepeatFields()">
        <option value="once" ${repeat==='once'?'selected':''}>Once (specific date)</option>
        <option value="daily" ${repeat==='daily'?'selected':''}>Daily</option>
        <option value="weekly" ${repeat==='weekly'?'selected':''}>Weekly (choose days)</option>
      </select>
    </div>
    <div class="modal-field" id="rm_dateWrap" style="display:${repeat==='once'?'block':'none'}">
      <label>Date</label><input type="date" id="rm_date" value="${r&&r.date?r.date:todayStr()}">
    </div>
    <div class="modal-field" id="rm_daysWrap" style="display:${repeat==='weekly'?'block':'none'}">
      <label>Days</label>
      <div class="day-pills" id="rm_days">
        ${DAY_NAMES.map((d,i)=>`<div class="day-pill ${r&&(r.days||[]).includes(i)?'sel':''}" data-day="${i}" onclick="this.classList.toggle('sel')">${d}</div>`).join('')}
      </div>
    </div>
    <div class="modal-field"><label>Time</label><input type="time" id="rm_time" value="${r?r.time:'09:00'}"></div>
    <div class="modal-field" style="display:flex; align-items:center; gap:8px">
      <input type="checkbox" id="rm_email" style="width:auto" ${r&&r.email?'checked':''}>
      <label style="margin:0; text-transform:none; font-size:13px; color:var(--text)">Also email me when due</label>
    </div>
    <div class="email-note">📧 Security ki wajah se koi bhi browser app khud-ba-khud silently email nahi bhej sakta. Jab reminder due hoga, ek "Send Email" button popup mein aayega — ek click se ${EMAIL_TO} ko ready-made email khul jayegi. Agar aap chahen to poori tarhan automatic (background) email ke liye main aapke liye ek chhota Google script bhi bana sakta hoon — bas bata dein.</div>
    <div class="modal-actions">
      <button class="btn" onclick="saveReminder(${r?`'${r.id}'`:'null'})">${r?'Save Changes':'Create Reminder'}</button>
      ${r? `<button class="btn-ghost" onclick="deleteReminder('${r.id}')">Delete</button>`:''}
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
  openModal(html);
}
function toggleRepeatFields(){
  const v = document.getElementById('rm_repeat').value;
  document.getElementById('rm_dateWrap').style.display = v==='once'?'block':'none';
  document.getElementById('rm_daysWrap').style.display = v==='weekly'?'block':'none';
}
function saveReminder(id){
  const title = document.getElementById('rm_title').value.trim();
  const note = document.getElementById('rm_note').value.trim();
  const business = document.getElementById('rm_biz').value;
  const repeat = document.getElementById('rm_repeat').value;
  const time = document.getElementById('rm_time').value || '09:00';
  const email = document.getElementById('rm_email').checked;
  const date = repeat==='once' ? (document.getElementById('rm_date').value || todayStr()) : '';
  const days = repeat==='weekly' ? Array.from(document.querySelectorAll('#rm_days .day-pill.sel')).map(el=>Number(el.dataset.day)) : [];
  if(!title){ showToast('Enter a title'); return; }
  if(repeat==='weekly' && days.length===0){ showToast('Select at least one day'); return; }

  if(id){
    const r = reminders.find(x=>x.id===id);
    const newVals = {title, note, business, repeat, time, email, date, days};
    const changes = {};
    Object.keys(newVals).forEach(k=>{ if(JSON.stringify(r[k]) !== JSON.stringify(newVals[k])) changes[k] = {from:r[k], to:newVals[k]}; });
    if(Object.keys(changes).length===0){ showToast('No changes made'); closeModal(); return; }
    openConfirm('Ye reminder changes save kar dein?', async ()=>{
      r.history = r.history || [];
      r.history.push({editedAt: nowISO(), changes});
      Object.assign(r, newVals);
      await saveReminders();
      showToast('Reminder updated & logged');
      closeModal();
      renderReminders();
    }, {label:'Yes, Save Changes', danger:false});
  } else {
    (async ()=>{
      reminders.push({id:uid(), title, note, business, repeat, time, email, date, days, active:true, createdAt:nowISO(), history:[], lastFiredKey:'', dismissedKey:''});
      await saveReminders();
      showToast('Reminder created');
      closeModal();
      renderReminders();
    })();
  }
}
async function deleteReminder(id){
  openConfirm('Delete this reminder?', async ()=>{
    reminders = reminders.filter(r=>r.id!==id);
    await saveReminders();
    closeModal();
    renderReminders();
    showToast('Reminder deleted');
  });
}
async function markDoneToday(id){
  const r = reminders.find(x=>x.id===id);
  if(!r) return;
  r.dismissedKey = todayStr();
  await saveReminders();
  renderReminders();
}
async function toggleActive(id){
  const r = reminders.find(x=>x.id===id);
  if(!r) return;
  r.active = !r.active;
  await saveReminders();
  renderReminders();
  showToast(r.active? 'Reminder resumed' : 'Reminder paused');
}

/* ===================== REMINDERS: VIEW ===================== */
function openReminders(){
  currentView = 'reminders';
  currentBiz = null;
  renderReminders();
}
function renderReminders(){
  currentView = 'reminders';
  document.getElementById('pageHeading').style.display = 'block';
  document.getElementById('pageTitle').textContent = 'Reminders';
  document.getElementById('pageSub').textContent = 'Never forget a task — daily, weekly, or one-time';
  document.getElementById('backBtn').style.display = 'flex';

  const now = new Date();
  const todays = getTodayReminders(now);
  const overdue = todays.filter(r=>reminderStatusToday(r,now)==='overdue');
  const later = todays.filter(r=>reminderStatusToday(r,now)==='later');
  const done = todays.filter(r=>reminderStatusToday(r,now)==='done');
  const upcoming = getUpcomingReminders();
  const recurring = getRecurringReminders();

  function bizLabel(id){ const b = BUSINESSES.find(x=>x.id===id); return b? b.name : 'General / Personal'; }
  function renderItem(r){
    const status = reminderStatusToday(r, now);
    const statusText = status==='overdue'?'Overdue':status==='later'?'Later Today':'Done';
    return `<div class="rem-item ${status==='done'?'done':''}">
      <div class="rem-time">${r.time}</div>
      <div class="rem-body">
        <div class="rem-title">${esc2(r.title)}</div>
        <div class="rem-sub">${bizLabel(r.business)} · ${repeatLabel(r)}${r.note?' · '+esc2(r.note):''}${r.email?' · 📧':''} ${r.history&&r.history.length?`<span class="edited-tag" onclick="viewReminderHistory('${r.id}')">edited ×${r.history.length}</span>`:''}</div>
      </div>
      <span class="status-chip ${status}">${statusText}</span>
      <div class="row-actions">
        ${status!=='done' ? `<button class="btn-ghost" onclick="markDoneToday('${r.id}')">Done</button>` : ''}
        <button class="btn-ghost" onclick="openReminderModal('${r.id}')">Edit</button>
      </div>
    </div>`;
  }

  let html = `
  <div class="rem-toprow">
    <button class="btn" onclick="openReminderModal(null)">+ New Reminder</button>
    <button class="btn-ghost" id="notifPermBtn" onclick="requestNotifPermission()">🔔 Enable Browser Notifications</button>
  </div>
  <div class="rem-stats">
    <div class="rem-stat overdue"><div class="l">Overdue / Do Now</div><div class="v">${overdue.length}</div></div>
    <div class="rem-stat today"><div class="l">Due Later Today</div><div class="v">${later.length}</div></div>
    <div class="rem-stat upcoming"><div class="l">Upcoming (future dates)</div><div class="v">${upcoming.length}</div></div>
  </div>`;

  html += `<div class="rem-section-title">🔴 Overdue / Do Now (${overdue.length})</div>`;
  html += overdue.length? overdue.map(renderItem).join('') : `<div class="empty-state" style="padding:24px"><div class="big">✅</div>Nothing overdue right now</div>`;

  html += `<div class="rem-section-title">🟡 Later Today (${later.length})</div>`;
  html += later.length? later.map(renderItem).join('') : `<div class="empty-state" style="padding:24px; color:var(--sub)">Nothing else scheduled for today</div>`;

  if(done.length){
    html += `<div class="rem-section-title">✅ Completed Today (${done.length})</div>`;
    html += done.map(renderItem).join('');
  }

  html += `<div class="rem-section-title">🔵 Upcoming — One-time Reminders (${upcoming.length})</div>`;
  html += upcoming.length? upcoming.map(r=>`<div class="rem-item">
      <div class="rem-time">${r.date}<br><span style="font-size:10px;color:var(--sub)">${r.time}</span></div>
      <div class="rem-body"><div class="rem-title">${esc2(r.title)}</div><div class="rem-sub">${bizLabel(r.business)}${r.note?' · '+esc2(r.note):''}</div></div>
      <div class="row-actions"><button class="btn-ghost" onclick="openReminderModal('${r.id}')">Edit</button></div>
    </div>`).join('') : `<div class="empty-state" style="padding:24px; color:var(--sub)">No upcoming one-time reminders</div>`;

  html += `<div class="rem-section-title">🔁 Recurring Reminders (${recurring.length})</div>`;
  html += recurring.length? recurring.map(r=>`<div class="rem-item ${!r.active?'done':''}">
      <div class="rem-time">${r.time}</div>
      <div class="rem-body"><div class="rem-title">${esc2(r.title)}</div><div class="rem-sub">${bizLabel(r.business)} · ${repeatLabel(r)}${r.note?' · '+esc2(r.note):''}</div></div>
      <div class="row-actions">
        <button class="btn-ghost" onclick="toggleActive('${r.id}')">${r.active?'Pause':'Resume'}</button>
        <button class="btn-ghost" onclick="openReminderModal('${r.id}')">Edit</button>
      </div>
    </div>`).join('') : `<div class="empty-state" style="padding:24px; color:var(--sub)">No recurring reminders yet</div>`;

  html += `<div class="rem-section-title">🕓 Notification Log — jab jab alert baja</div>`;
  html += reminderLog.length? reminderLog.slice(0,20).map(l=>`<div class="rem-item" style="padding:12px 18px">
      <div class="rem-time" style="min-width:120px; font-size:11px">${fmtDateTime(l.firedAt)}</div>
      <div class="rem-body"><div class="rem-title" style="font-size:13px">${esc2(l.title)}</div><div class="rem-sub">${bizLabel(l.business)}</div></div>
    </div>`).join('') : `<div class="empty-state" style="padding:24px; color:var(--sub)">Koi notification abhi tak nahi baji</div>`;

  document.getElementById('app').innerHTML = html;
  updateReminderBadge();
  if(typeof Notification !== 'undefined'){
    const btn = document.getElementById('notifPermBtn');
    if(Notification.permission === 'granted' && btn) btn.style.display='none';
  }
}
function viewReminderHistory(id){
  const r = reminders.find(x=>x.id===id);
  if(!r) return;
  const hist = (r.history||[]).slice().reverse();
  let body = `<div class="meta-line" style="margin-bottom:12px">Created: <b style="color:var(--text)">${fmtDateTime(r.createdAt)}</b></div>`;
  if(hist.length===0) body += `<div style="color:var(--sub); font-size:13px">No edits made yet.</div>`;
  else hist.forEach(h=>{
    const chgLines = Object.keys(h.changes).map(f=>`<div class="chg">${f}: <b>${JSON.stringify(h.changes[f].from)}</b> → <b>${JSON.stringify(h.changes[f].to)}</b></div>`).join('');
    body += `<div class="history-item"><div class="ts">${fmtDateTime(h.editedAt)}</div>${chgLines}</div>`;
  });
  openModal(`<h3>Reminder — Edit History <span class="modal-close" onclick="closeModal()">✕</span></h3>${body}<div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
}

/* ===================== NOTIFICATION ENGINE ===================== */
let __audioCtx = null;
function unlockAudio(){
  try{
    if(!__audioCtx) __audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(__audioCtx.state === 'suspended') __audioCtx.resume();
  }catch(e){}
}
document.body.addEventListener('click', unlockAudio, {once:false});
document.body.addEventListener('touchstart', unlockAudio, {once:false});

function requestNotifPermission(){
  if(typeof Notification === 'undefined'){ showToast('Browser notifications not supported here'); return; }
  Notification.requestPermission().then(p=>{
    showToast(p==='granted' ? 'Notifications enabled ✅' : 'Notifications blocked — enable from browser settings');
    if(currentView==='reminders') renderReminders();
  });
}
function playAlarm(){
  try{
    unlockAudio();
    const ctx = __audioCtx;
    if(!ctx) return;
    // 6 louder beeps over ~3 seconds so it's noticeable even if phone is face-down
    for(let i=0;i<6;i++){
      const t = i*0.5;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type='square'; o.frequency.value = i%2===0 ? 1046 : 784;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime+t);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime+t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+t+0.35);
      o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.36);
    }
  }catch(e){}
  // Vibration fallback — works on most Android browsers even with sound off/silent
  try{ if(navigator.vibrate) navigator.vibrate([400,150,400,150,400,150,400]); }catch(e){}
}
function mailtoFor(r){
  const bizName = r.business ? (BUSINESSES.find(b=>b.id===r.business)?.name||'') : 'General';
  const subject = encodeURIComponent('Reminder: '+r.title);
  const body = encodeURIComponent(`Reminder due now:\n\nTitle: ${r.title}\nBusiness: ${bizName}\nNote: ${r.note||'-'}\nTime: ${r.time}\n\n— Sent from your Business Empire Dashboard`);
  return `mailto:${EMAIL_TO}?subject=${subject}&body=${body}`;
}
async function fireReminder(r){
  const bizName = r.business ? (BUSINESSES.find(b=>b.id===r.business)?.name||'') : 'General / Personal';
  playAlarm();
  if(typeof Notification !== 'undefined' && Notification.permission==='granted'){
    try{ new Notification('⏰ '+r.title, {body:(bizName+(r.note?' · '+r.note:'')), requireInteraction:true}); }catch(e){}
  }
  reminderLog.unshift({id:uid(), reminderId:r.id, title:r.title, business:r.business, firedAt: nowISO()});
  await saveLog();
  showAlarmBanner(r);
  r.lastFiredKey = todayStr()+':'+r.time;
  await saveReminders();
  if(currentView==='reminders') renderReminders();
  updateReminderBadge();
}
function showAlarmBanner(r){
  const bizName = r.business ? (BUSINESSES.find(b=>b.id===r.business)?.name||'') : 'General / Personal';
  openModal(`
    <h3>⏰ Reminder Due <span class="modal-close" onclick="closeModal()">✕</span></h3>
    <div style="font-size:16px; font-weight:800; margin-bottom:6px">${esc2(r.title)}</div>
    <div class="rem-sub" style="margin-bottom:14px">${bizName}${r.note?' · '+esc2(r.note):''} · ${r.time}</div>
    <div style="font-size:12px; color:var(--sub); margin-bottom:8px">Dubara yaad dilana hai?</div>
    <div class="modal-actions" style="flex-wrap:wrap">
      <button class="btn-ghost" onclick="snoozeReminder('${r.id}',15)">Snooze 15 min</button>
      <button class="btn-ghost" onclick="snoozeReminder('${r.id}',30)">Snooze 30 min</button>
      <button class="btn-ghost" onclick="snoozeReminder('${r.id}',45)">Snooze 45 min</button>
      <button class="btn-ghost" onclick="snoozeReminder('${r.id}',60)">Snooze 60 min</button>
    </div>
    <div class="modal-actions">
      ${r.email? `<a class="btn" href="${mailtoFor(r)}" style="text-decoration:none; display:inline-flex; align-items:center">📧 Send Email</a>` : ''}
      <button class="btn-ghost" onclick="markDoneToday('${r.id}'); closeModal();">Mark Done</button>
      <button class="btn-ghost" onclick="closeModal()">Dismiss</button>
    </div>`);
}
async function snoozeReminder(id, minutes){
  const r = reminders.find(x=>x.id===id);
  if(!r) return;
  const until = new Date(Date.now() + minutes*60000).toISOString();
  r.snoozeUntil = until;
  r.snoozeFiredFor = null;
  await saveReminders();
  closeModal();
  showToast('Snoozed — ' + minutes + ' minute mein dobara yaad dilaunga');
  if(currentView==='reminders') renderReminders();
}
function checkReminders(){
  if(!accessMode) return; // don't fire alarms before someone has signed in
  const now = new Date();
  const hhmm = now.toTimeString().slice(0,5);
  reminders.forEach(r=>{
    if(!r.active || !reminderVisibleToMe(r)) return;
    // Snoozed reminders: fire independently of the normal daily schedule
    if(r.snoozeUntil){
      if(new Date(r.snoozeUntil) <= now && r.snoozeFiredFor !== r.snoozeUntil){
        const firedFor = r.snoozeUntil;
        fireReminder(r).then(()=>{ r.snoozeFiredFor = firedFor; r.snoozeUntil = null; saveReminders(); });
      }
      return; // while a snooze is pending, skip the normal daily-time check
    }
    if(!isApplicableToday(r, now)) return;
    // "Catch up" instead of requiring an exact-minute match — if the scheduled time has
    // already passed today and it hasn't fired yet today, fire it now. This is what makes
    // reminders reliable even when the browser tab was backgrounded/throttled and missed
    // the exact minute.
    if(r.time > hhmm) return;
    if(r.lastFiredKey === todayStr()+':'+r.time) return;
    fireReminder(r);
  });
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){ unlockAudio(); checkReminders(); }
});

/* ===================== INIT ===================== */
window.__BUSINESS_EMPIRE_APP_VERSION = '3.0.0';
(async function init(){
  try {
    await loadBusinessesList();
    const results = await Promise.all([
      loadAll(),
      loadOrder(),
      loadReminders(),
      loadLog(),
      loadFx(),
      loadOwnerPasscode(),
      loadCollaborators(),
      loadOwnerProfile(),
      loadAvatar(),
      loadMySession()
    ]);
    ownerPasscode = results[5];
    collaborators = results[6];
    ownerProfile = results[7];
    myAvatar = results[8];
    const session = results[9];
    await applySavedTheme();
  if(session && session.role==='owner' && ownerPasscode){
    accessMode='owner'; allowedBizIds=null;
    proceedToApp();
  } else if(session && session.role==='collaborator' && session.email){
    const entry = collaborators.find(c=>c.email.toLowerCase()===session.email.toLowerCase());
    if(entry && entry.status==='approved'){
      accessMode='collaborator'; myEmail=session.email; allowedBizIds=entry.businessIds;
      proceedToApp();
    } else if(entry && entry.status==='pending'){
      renderPendingScreen(session.email);
    } else {
      renderGate();
    }
  } else {
    renderGate();
  }

    setInterval(checkReminders, 15000);
    setInterval(updateReminderBadge, 30000);
  } catch (err) {
    console.error('[Business Empire] Startup failed:', err);
    const appEl = document.getElementById('app');
    if(appEl){
      appEl.innerHTML = '<div class="gate-wrap"><div class="gate-card"><h2>App could not start</h2><p>Please refresh once. If this continues, check the browser console for the startup error.</p><button class="btn" onclick="location.reload()">Refresh App</button></div></div>';
    }
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js?v=3').then(reg => reg.update()).catch(err =>
      console.warn('[Business Empire] Service worker registration failed:', err)
    );
  });
}
