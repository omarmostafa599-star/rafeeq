// رفيق — application UI (mobile-first, RTL/LTR, light by default)
import { state, onChange, boot, enterLocal, signInGoogle, signOut, cloudReady, putTask, putPerson, newTask, newPerson, saveProfile, syncNow, uuid, nowISO, bulkReplace, localLeftovers, adoptLocalLeftovers } from './data.js';
import { parseCapture, today, addDays, diffDays, pd, ds, nextWeekday, addWorkdays, isWeekend, validDate, findPeople, nameTokens, normAr } from './parse.js';
import { DICT } from './i18n.js';

/* ================= i18n & formatting ================= */
const L = () => state.profile.lang === 'en' ? 'en' : 'ar';
export function t(k, v) { let s = DICT[L()][k] ?? DICT.ar[k] ?? k; if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; }
const LOC = () => L() === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB';
const fmt = (s, o = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat(LOC(), o).format(pd(s));
const fmtShort = s => fmt(s, { day: 'numeric', month: 'short' });
const wd = s => new Intl.DateTimeFormat(LOC(), { weekday: 'long' }).format(pd(s));
const T = () => today();
function rel(s) { if (!s) return t('noDue'); const d = diffDays(s, T()); if (d === 0) return t('today'); if (d === 1) return t('tomorrow'); if (d === -1) return t('yesterday'); if (d > 1 && d < 7) return wd(s); return fmtShort(s); }
function plural(n, base) { // Arabic-aware counts
  if (L() === 'en') return t(base + (n === 1 ? '_1' : '_n'), { n });
  if (n === 1) return t(base + '_1'); if (n === 2) return t(base + '_2'); if (n >= 3 && n <= 10) return t(base + '_few', { n }); return t(base + '_n', { n });
}
const lateTxt = s => t('lateBy', { d: plural(diffDays(T(), s), 'days') });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);

/* ================= icons ================= */
const I = (p, a = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${a}>${p}</svg>`;
const ic = {
  today: I('<path d="M3 10h18M8 3v4M16 3v4"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 14h3v3H8z"/>'),
  list: I('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.4"'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>'),
  more: I('<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  cal: I('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  back: I('<path d="M9 6l6 6-6 6"/>'),
  x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  flag: I('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'),
  later: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  archive: I('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10h14V9M10 13h4"/>'),
  reopen: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  moon: I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  cloud: I('<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z"/>'),
  download: I('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: I('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  logout: I('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  minus: I('<path d="M5 12h14"/>', 'stroke-width="2.4"'),
  note: I('<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  spark: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
};
const sic = (k, s = 14) => ic[k].replace('<svg', `<svg width="${s}" height="${s}"`);
const gLogo = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';

/* ================= model helpers ================= */
const live = () => state.tasks.filter(x => !x.deleted);
const people = () => state.people.filter(p => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
const taskById = id => state.tasks.find(x => x.id === id);
const personById = id => state.people.find(p => p.id === id);
const pname = id => { const p = personById(id); return p && !p.deleted ? p.name : t('deletedPerson'); };
const initials = n => { const s = String(n || '').replace(/^(?:م|د|أ|ا|Eng|Dr|Mr|Mrs|Ms)\.?\s+/i, '').trim(); const m = s.match(/[\p{L}\p{N}]/u); return m ? m[0].toUpperCase() : '?'; };
const isOpen = x => ['todo', 'prog', 'wait', 'hold'].includes(x.status);
const isLate = x => isOpen(x) && x.due && x.due < T();
const openFus = x => (x.followups || []).filter(f => f.status === 'open');
const fuLate = f => f.status === 'open' && f.due && f.due < T();
function addLog(x, kind, text = '', data = {}) { x.log = x.log || []; x.log.push({ id: uuid(), at: nowISO(), kind, text, data }); }
function getOrCreatePerson(name) {
  const n = (name || '').trim().replace(/\s+/g, ' '); if (!n) return null;
  const key = nameTokens(n).join(' ');
  const ex = people().find(p => nameTokens(p.name).join(' ') === key);
  if (ex) return ex.id;
  const p = newPerson(n); putPerson(p); return p.id;
}
function sortTasks(list) {
  return list.slice().sort((a, b) => (isLate(b) - isLate(a)) || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0) || ({ hi: 0, mid: 1, lo: 2 }[a.priority] - { hi: 0, mid: 1, lo: 2 }[b.priority]) || (a.created_at < b.created_at ? -1 : 1));
}
const nextWorkday = () => addWorkdays(T(), 1);

/* ================= UI state ================= */
const UI = { tab: 'today', seg: 'active', personF: null, q: '', layers: [], theme: null, booting: true };

/* ================= toast ================= */
let toastTimer;
function toast(msg, undo, kind) {
  const el = $('#toast');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" id="undoBtn">${t('undo')}</button>` : ''}`;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(toastTimer);
  if (undo) $('#undoBtn').onclick = () => { undo(); el.classList.remove('on'); };
  toastTimer = setTimeout(() => el.classList.remove('on'), undo ? 4500 : 2600);
}

/* ================= shell ================= */
function applyLangTheme() {
  const shell = $('#shell');
  const lang = L();
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  shell.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const dark = (state.profile.settings || {}).theme === 'dark';
  if (dark) shell.setAttribute('data-mode', 'dark'); else shell.removeAttribute('data-mode');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0F1522' : '#EEF1F5');
  document.title = lang === 'ar' ? 'رفيق' : 'Rafeeq';
}
function renderAll() {
  applyLangTheme();
  const signedIn = !!state.mode;
  $('#splash').hidden = !(UI.booting && !signedIn);
  if (UI.booting && !signedIn) { $('#login').hidden = true; $('#app').hidden = true; return; }
  $('#login').hidden = signedIn;
  $('#app').hidden = !signedIn;
  if (!signedIn) { renderLogin(); return; }
  if (!state.profile.display_name && !UI.onboarded) { renderOnboarding(); return; }
  renderNav(); renderMain(); UI.layers.forEach(Lr => Lr.rerender());
}

function renderLogin() {
  $('#login').innerHTML = `
    <div class="login-in">
      <div class="brand-mark">${L() === 'ar' ? 'ر' : 'R'}</div>
      <h1>${t('appName')}</h1>
      <p class="lead">${t('tagline')}</p>
      <ul class="feat">
        <li><span class="fi">${ic.mic}</span><span><b>${t('feat1t')}</b>${t('feat1d')}</span></li>
        <li><span class="fi">${ic.users}</span><span><b>${t('feat2t')}</b>${t('feat2d')}</span></li>
        <li><span class="fi">${ic.cloud}</span><span><b>${t('feat3t')}</b>${t('feat3d')}</span></li>
      </ul>
      <div class="login-actions">
        ${cloudReady ? `<button type="button" class="gbtn" data-act="google">${gLogo}${t('continueGoogle')}</button>` : `<div class="notice">${t('cloudNotReady')}</div>`}
        <button type="button" class="btn ghost block" data-act="local">${t('useLocal')}</button>
        <button type="button" class="linkbtn" data-act="lang">${L() === 'ar' ? 'English' : 'العربية'}</button>
      </div>
      <p class="legal">${t('loginLegal')}</p>
    </div>`;
}
function renderOnboarding() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#nav').hidden = true; $('#app').classList.add('bare'); closeAllLayers();
  $('#main').innerHTML = `<div class="onb">
      <div class="brand-mark">${L() === 'ar' ? 'ر' : 'R'}</div>
      <h1>${t('onbTitle')}</h1><p class="lead">${t('onbLead')}</p>
      <form id="onbForm" class="form" autocomplete="off">
        <label class="fld"><span>${t('yourName')}</span><input id="onbName" name="name" required maxlength="80" value="${esc(state.user?.name || '')}" dir="auto"></label>
        <label class="fld"><span>${t('jobTitle')} <em>${t('optional')}</em></span><input id="onbJob" name="job" maxlength="80" placeholder="${esc(t('jobTitlePh'))}" dir="auto"></label>
        <div class="fld"><span>${t('language')}</span><div class="seg2"><button type="button" class="${L() === 'ar' ? 'on' : ''}" data-act="setlang" data-v="ar">العربية</button><button type="button" class="${L() === 'en' ? 'on' : ''}" data-act="setlang" data-v="en">English</button></div></div>
        <button class="btn primary block lg" type="submit">${t('start')}</button>
      </form></div>`;
}
function renderNav() {
  $('#nav').hidden = false; $('#app').classList.remove('bare');
  const tab = (k, icon, label) => `<button type="button" class="tab ${UI.tab === k ? 'on' : ''}" data-tab="${k}" ${UI.tab === k ? 'aria-current="page"' : ''}>${icon}<span>${label}</span>${k === 'today' && badgeCount() ? `<i class="dot num">${badgeCount()}</i>` : ''}</button>`;
  $('#nav').innerHTML = `<div class="nav-brand"><span class="brand-mark sm">${L() === 'ar' ? 'ر' : 'R'}</span><b>${t('appName')}</b></div>
    ${tab('today', ic.today, t('navToday'))}${tab('tasks', ic.list, t('navTasks'))}
    <button type="button" class="addbtn" data-act="capture" aria-label="${esc(t('add'))}">${ic.plus}<span class="lbl">${t('addTask')}</span></button>
    ${tab('people', ic.users, t('navPeople'))}${tab('more', ic.more, t('navMore'))}
    <div class="nav-foot">${syncChip()}</div>`;
}
const badgeCount = () => live().filter(isLate).length + live().filter(isOpen).reduce((n, x) => n + openFus(x).filter(fuLate).length, 0);
function syncChip() {
  const s = state.sync;
  if (state.mode === 'local') return `<button type="button" class="sync local" data-tab="more">${sic('info')}${t('syncLocal')}</button>`;
  if (s.status === 'offline') return `<span class="sync warn">${sic('cloud')}${t('syncOffline')}${s.pending ? ` · <b class="num">${s.pending}</b>` : ''}</span>`;
  if (s.status === 'error') return `<button type="button" class="sync err" data-act="sync">${sic('cloud')}${t('syncError')}</button>`;
  if (s.status === 'syncing' || s.pending) return `<span class="sync">${sic('cloud')}${t('syncing')}</span>`;
  return `<span class="sync ok">${sic('check')}${t('synced')}</span>`;
}
function renderMain() {
  const m = $('#main');
  const y = window.scrollY;
  m.innerHTML = VIEWS[UI.tab]();
  bindSwipes(m);
  if (UI.keepScroll) window.scrollTo(0, y);
  UI.keepScroll = false;
}
function go(tab) { UI.tab = tab; closeAllLayers(); renderNav(); renderMain(); window.scrollTo(0, 0); }

/* ================= components ================= */
function statusPill(x) {
  const m = { todo: ['', 'stTodo'], prog: ['prog', 'stProg'], wait: ['wait', 'stWait'], hold: ['', 'stHold'], done: ['done', 'stDone'], cancelled: ['', 'stCancelled'] }[x.status];
  return `<span class="pill ${m[0]}">${x.status === 'wait' ? sic('clock', 13) : ''}${t(m[1])}</span>`;
}
function duePill(x) {
  if (!x.due) return isOpen(x) ? '' : '';
  if (isLate(x)) return `<span class="pill late">${lateTxt(x.due)}</span>`;
  if (x.due === T() && isOpen(x)) return `<span class="pill wait">${t('dueToday')}</span>`;
  return `<span class="num">${sic('cal', 13)} ${rel(x.due)}</span>`;
}
function taskCard(x, opts = {}) {
  const nf = openFus(x).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1)[0];
  const stripe = isLate(x) ? 'late' : x.status === 'wait' ? 'wait' : '';
  const done = !isOpen(x);
  const meta = [
    opts.status ? statusPill(x) : '',
    duePill(x),
    x.priority === 'hi' && isOpen(x) ? `<span class="pill hi">${t('prioHi')}</span>` : '',
    x.status === 'wait' && x.waiting_on ? `<span>${t('waitingFrom', { w: t('w_' + x.waiting_what), p: esc(pname(x.waiting_on)) })}</span>` : '',
    nf && x.status !== 'wait' ? `<span>${sic('users', 13)} ${esc(pname(nf.person_id).split(' ').slice(0, 2).join(' '))} · ${rel(nf.due)}</span>` : '',
    x.project ? `<span dir="auto">${esc(x.project)}</span>` : '',
    done && x.completed_on ? `<span>${t('doneOn', { d: fmtShort(x.completed_on) })}</span>` : '',
  ].filter(Boolean).join('');
  const card = `<div class="tcard ${done ? 'is-done' : ''}" data-open="${x.id}" role="button" tabindex="0">
      ${stripe ? `<span class="stripe ${stripe}"></span>` : ''}
      ${x.status === 'cancelled' ? '<span class="chk" aria-hidden="true"></span>' : `<button type="button" class="chk ${x.status === 'done' ? 'on' : ''}" ${isOpen(x) ? `data-act="quickdone" data-id="${x.id}" aria-label="${esc(t('complete'))}"` : 'tabindex="-1" aria-hidden="true"'}>${x.status === 'done' ? ic.check : ''}</button>`}
      <div class="body"><div class="t" dir="auto">${esc(x.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div></div>`;
  if (!isOpen(x) || opts.noSwipe) return card;
  return `<div class="swipe" data-id="${x.id}"><span class="lbl done">${sic('check', 18)}${t('swDone')}</span><span class="lbl later">${sic('later', 18)}${t('swLater')}</span>${card}</div>`;
}
function fuRow(x, f) {
  return `<div class="fu-row ${fuLate(f) ? 'late' : ''}"><span class="av">${esc(initials(pname(f.person_id)))}</span>
    <div class="body" data-open="${x.id}" role="button" tabindex="0"><div class="t" dir="auto">${esc(pname(f.person_id))}</div>
      <div class="meta"><span dir="auto">${esc(f.what || x.title)}</span>${fuLate(f) ? `<span class="pill late">${lateTxt(f.due)}</span>` : ''}</div></div>
    <button type="button" class="btn sm" data-act="furesult" data-id="${x.id}" data-fu="${f.id}">${t('logResult')}</button></div>`;
}
const sec = (title, n, body, cls = '') => `<section class="sec"><div class="sec-h"><h3>${title}</h3>${n != null ? `<span class="cnt ${cls}">${n}</span>` : ''}</div><div class="stack">${body}</div></section>`;
const emptyBox = (title, text, btn = '') => `<div class="empty"><div class="empty-ic">${ic.note}</div><h3>${title}</h3><p>${text}</p>${btn}</div>`;

/* ================= views ================= */
const VIEWS = {
  today() {
    const td = T();
    const act = live().filter(isOpen).filter(x => !x.archived);
    const late = sortTasks(act.filter(isLate));
    const dueToday = sortTasks(act.filter(x => x.due === td && x.status !== 'wait'));
    const fus = []; act.forEach(x => openFus(x).forEach(f => { if (f.due && f.due <= td) fus.push([x, f]); }));
    fus.sort((a, b) => a[1].due < b[1].due ? -1 : 1);
    const waiting = sortTasks(act.filter(x => x.status === 'wait' && !(x.due && x.due <= td)));
    const soon = sortTasks(act.filter(x => x.due && x.due > td && x.due <= addDays(td, 7) && x.status !== 'wait'));
    const nodue = sortTasks(act.filter(x => !x.due && x.status === 'prog'));
    const actionable = act.filter(x => x.status === 'todo' || x.status === 'prog');
    const pick = sortTasks(actionable.filter(isLate))[0] || sortTasks(actionable.filter(x => x.due === td))[0] || sortTasks(actionable.filter(x => x.priority === 'hi'))[0] || sortTasks(actionable.filter(x => x.status === 'prog'))[0] || sortTasks(actionable)[0];
    const why = !pick ? '' : isLate(pick) ? lateTxt(pick.due) : pick.due === td ? t('dueToday') : pick.priority === 'hi' ? t('prioHi') : pick.status === 'prog' ? t('stProg') : pick.due ? t('nearestDue') : '';
    let hijri = ''; try { hijri = new Intl.DateTimeFormat((L() === 'ar' ? 'ar-SA' : 'en') + '-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { }
    const name = (state.profile.display_name || '').split(' ')[0];
    let h = `<header class="hdr"><div class="grow"><div class="sub">${esc(hijri)}</div><h1>${wd(td)}${L() === 'ar' ? '،' : ','} ${fmt(td)}</h1>${name ? `<div class="hello">${t('hello', { n: esc(name) })}</div>` : ''}</div><div class="hdr-side">${syncChip()}</div></header>`;
    if (!live().length) {
      return h + emptyBox(t('emptyTitle'), t('emptyText'), `<button type="button" class="btn primary lg" data-act="capture">${ic.plus}${t('addFirst')}</button>`) + leftoversBanner();
    }
    h += leftoversBanner();
    h += `<div class="counters num"><button type="button" class="counter late" data-jump="s-late"><b>${late.length}</b><span>${t('cLate')}</span></button><button type="button" class="counter" data-jump="s-today"><b>${dueToday.length}</b><span>${t('cToday')}</span></button><button type="button" class="counter fu" data-jump="s-fu"><b>${fus.length}</b><span>${t('cFu')}</span></button></div>`;
    if (pick) h += `<div class="start"><div class="eyebrow">${sic('flag', 15)}${t('startWith')}</div><h2 dir="auto">${esc(pick.title)}</h2>${why ? `<div class="why ${isLate(pick) ? 'late' : ''}">${why}</div>` : ''}<div class="row"><button type="button" class="btn primary" data-act="quickdone" data-id="${pick.id}">${ic.check}${t('complete')}</button><button type="button" class="btn" data-open="${pick.id}">${t('openDetails')}</button></div></div>`;
    if (late.length || dueToday.length || soon.length) h += `<p class="hint-swipe">${t('swipeHint')}</p>`;
    if (late.length) h += `<div id="s-late">${sec(t('secLate'), late.length, late.map(x => taskCard(x)).join(''), 'late')}</div>`;
    if (dueToday.length) h += `<div id="s-today">${sec(t('secToday'), dueToday.length, dueToday.map(x => taskCard(x)).join(''))}</div>`;
    if (fus.length) h += `<div id="s-fu">${sec(t('secFu'), fus.length, fus.map(([x, f]) => fuRow(x, f)).join(''))}</div>`;
    if (waiting.length) h += sec(t('secWaiting'), waiting.length, waiting.map(x => taskCard(x)).join(''));
    if (soon.length) h += sec(t('secSoon'), soon.length, soon.map(x => taskCard(x)).join(''));
    if (nodue.length) h += sec(t('secNoDue'), nodue.length, nodue.map(x => taskCard(x)).join(''));
    if (!late.length && !dueToday.length && !fus.length) h += `<div class="allclear">${sic('check', 18)}${t('allClear')}</div>`;
    return h;
  },
  tasks() {
    let list = live();
    if (UI.seg === 'active') list = list.filter(x => isOpen(x) && x.status !== 'wait' && !x.archived);
    if (UI.seg === 'wait') list = list.filter(x => isOpen(x) && !x.archived && (x.status === 'wait' || openFus(x).length));
    if (UI.seg === 'done') list = list.filter(x => !isOpen(x) && !x.archived);
    if (UI.seg === 'archived') list = list.filter(x => x.archived);
    if (UI.personF) list = list.filter(x => x.waiting_on === UI.personF || (x.followups || []).some(f => f.person_id === UI.personF));
    if (UI.q) { const q = normAr(UI.q); list = list.filter(x => normAr([x.title, x.details, x.project, x.source, x.notes, x.result, ...(x.followups || []).map(f => f.what + ' ' + pname(f.person_id)), ...(x.log || []).map(l => l.text)].join(' ')).includes(q)); }
    list = UI.seg === 'done' ? list.sort((a, b) => (b.completed_on || '') > (a.completed_on || '') ? 1 : -1) : sortTasks(list);
    const pc = id => live().filter(x => isOpen(x) && (x.waiting_on === id || openFus(x).some(f => f.person_id === id))).length;
    const ppl = people().filter(p => pc(p.id)).slice(0, 12);
    const openN = live().filter(isOpen).length;
    return `<header class="hdr"><div class="grow"><h1>${t('navTasks')}</h1><div class="sub">${plural(openN, 'openTasks')}</div></div><button type="button" class="btn primary sm desk" data-act="newtask">${ic.plus}${t('newTask')}</button></header>
      <label class="search">${ic.search}<input type="search" id="taskQ" value="${esc(UI.q)}" placeholder="${esc(t('searchTasks'))}" aria-label="${esc(t('searchTasks'))}" dir="auto"></label>
      ${ppl.length ? `<div class="people-row">${ppl.map(p => `<button type="button" class="pchip ${UI.personF === p.id ? 'on' : ''}" data-pf="${p.id}"><span class="av">${esc(initials(p.name))}</span><span class="nm" dir="auto">${esc(p.name.replace(/^(?:م|د|أ|ا)\.\s*/, '').split(' ')[0])}</span><i class="num">${pc(p.id)}</i></button>`).join('')}</div>` : ''}
      <div class="seg" role="tablist">${[['active', 'segActive'], ['wait', 'segWait'], ['done', 'segDone']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${UI.seg === k}" class="${UI.seg === k ? 'on' : ''}" data-seg="${k}">${t(l)}</button>`).join('')}</div>
      ${UI.personF ? `<div class="chips filter"><button type="button" class="chip on" data-pf="${UI.personF}" dir="auto">${esc(pname(UI.personF))} ${sic('x', 14)}</button></div>` : ''}
      <div class="stack">${list.length ? list.map(x => taskCard(x, { status: UI.seg !== 'active' })).join('') : `<div class="empty small"><p>${UI.q || UI.personF ? t('noMatch') : t('noTasksHere')}</p></div>`}</div>
      ${UI.seg === 'done' || UI.seg === 'archived' ? `<button type="button" class="linkbtn center" data-seg="${UI.seg === 'archived' ? 'done' : 'archived'}">${UI.seg === 'archived' ? t('backToDone') : t('showArchived')}</button>` : ''}`;
  },
  people() {
    const ppl = people();
    const stats = id => { let open = 0, late = 0, last = null; live().forEach(x => { (x.followups || []).forEach(f => { if (f.person_id !== id) return; if (f.status === 'open' && isOpen(x)) { open++; if (fuLate(f)) late++; } (f.log || []).forEach(l => { if (!last || l.date > last) last = l.date; }); }); if (x.waiting_on === id && x.status === 'wait') open++; }); return { open, late, last }; };
    return `<header class="hdr"><div class="grow"><h1>${t('navPeople')}</h1><div class="sub">${t('peopleSub')}</div></div><button type="button" class="btn primary sm" data-act="newperson">${ic.plus}${t('add')}</button></header>
      ${ppl.length ? `<div class="stack">${ppl.map(p => { const s = stats(p.id); return `<button type="button" class="prow" data-person="${p.id}"><span class="av lg">${esc(initials(p.name))}</span><span class="body"><span class="t" dir="auto">${esc(p.name)}</span>${p.org ? `<span class="sub" dir="auto">${esc(p.org)}</span>` : ''}<span class="meta">${s.open ? `<span class="pill ${s.late ? 'late' : 'prog'}">${plural(s.open, 'openFu')}</span>` : ''}<span>${s.last ? t('lastContact', { d: rel(s.last) }) : t('noContact')}</span></span></span>${sic('back', 18).replace('<svg', '<svg class="chev"')}</button>`; }).join('')}</div>` : emptyBox(t('noPeople'), t('noPeopleText'), `<button type="button" class="btn primary" data-act="newperson">${ic.plus}${t('addPerson')}</button>`)}`;
  },
  more() {
    const p = state.profile, u = state.user;
    return `<header class="hdr"><div class="grow"><h1>${t('navMore')}</h1></div></header>
      <button type="button" class="profile" data-act="profile"><span class="av xl">${esc(initials(p.display_name || '?'))}</span><span class="body"><b dir="auto">${esc(p.display_name || t('yourName'))}</b><span class="sub" dir="auto">${esc(p.job_title || t('addJobTitle'))}</span>${u ? `<span class="sub mail">${esc(u.email || '')}</span>` : `<span class="sub">${t('localAccount')}</span>`}</span>${sic('edit', 18)}</button>
      <div class="card sync-card">${state.mode === 'cloud' ? `<div class="row-between"><span>${syncChip()}</span><button type="button" class="btn sm" data-act="sync">${t('syncNow')}</button></div><p class="note">${state.sync.last ? t('lastSync', { d: new Intl.DateTimeFormat(LOC(), { hour: 'numeric', minute: '2-digit' }).format(new Date(state.sync.last)) }) : ''}${state.sync.error ? ` · <span class="err-txt">${esc(state.sync.error)}</span>` : ''}</p>` : `<p class="note" style="margin-top:0">${t('localExplain')}</p>${cloudReady ? `<button type="button" class="gbtn sm" data-act="google">${gLogo}${t('continueGoogle')}</button>` : ''}`}</div>
      <div class="menu">
        <button type="button" data-act="lang"><span class="mi">${ic.globe}</span><span class="grow">${t('language')}<small>${L() === 'ar' ? 'العربية' : 'English'}</small></span><span class="val">${L() === 'ar' ? 'English' : 'العربية'}</span></button>
        <button type="button" data-act="theme"><span class="mi">${ic.moon}</span><span class="grow">${t('appearance')}<small>${(p.settings || {}).theme === 'dark' ? t('themeDark') : t('themeLight')}</small></span></button>
        <button type="button" data-act="ask-date"><span class="mi">${ic.cal}</span><span class="grow">${t('askDueSetting')}<small>${(p.settings || {}).askDue ? t('on') : t('off')}</small></span><span class="switch ${(p.settings || {}).askDue ? 'on' : ''}" aria-hidden="true"></span></button>
      </div>
      <div class="sec-h"><h3>${t('backupTitle')}</h3></div>
      <div class="menu">
        <button type="button" data-act="export"><span class="mi">${ic.download}</span><span class="grow">${t('exportBackup')}<small>${t('exportHint')}</small></span></button>
        <button type="button" data-act="import"><span class="mi">${ic.upload}</span><span class="grow">${t('importBackup')}<small>${t('importHint')}</small></span></button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <div class="menu">
        <button type="button" data-act="signout" class="danger"><span class="mi">${ic.logout}</span><span class="grow">${state.mode === 'cloud' ? t('signOut') : t('leaveLocal')}</span></button>
      </div>
      <p class="about">${t('about', { v: window.RAFEEQ_VERSION || '' })}</p>`;
  },
};
function v1Data() {
  try { if (localStorage.getItem('rafeeq2.v1imported')) return null; const d = JSON.parse(localStorage.getItem('rafeeq.v1') || 'null'); return d && Array.isArray(d.tasks) && d.tasks.length ? d : null; } catch { return null; }
}
function leftoversBanner() {
  const v1 = v1Data();
  if (v1) return `<div class="banner"><span>${t('v1Found', { n: v1.tasks.length })}</span><button type="button" class="btn sm primary" data-act="importv1">${t('importNow')}</button><button type="button" class="btn sm ghost" data-act="skipv1">${t('notNow')}</button></div>`;
  if (state.mode !== 'cloud') return '';
  const c = localLeftovers(); if (!c) return '';
  return `<div class="banner"><span>${t('leftovers', { n: c.tasks.length })}</span><button type="button" class="btn sm primary" data-act="adopt">${t('uploadThem')}</button></div>`;
}

/* ================= swipe ================= */
function bindSwipes(root) {
  root.querySelectorAll('.swipe').forEach(sw => {
    const card = sw.querySelector('.tcard'); const id = sw.dataset.id;
    const rtl = $('#shell').dir === 'rtl';
    let x0 = null, y0 = 0, dx = 0, moved = false, locked = false;
    card.addEventListener('pointerdown', e => { if (e.button > 0 || e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; moved = false; locked = false; card.style.transition = 'none'; });
    card.addEventListener('pointermove', e => {
      if (x0 === null) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!locked) {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.3) { locked = true; try { card.setPointerCapture(e.pointerId); } catch { } }
        else if (Math.abs(my) > 10) { x0 = null; card.style.transition = ''; return; } else return;
      }
      dx = mx; moved = true;
      card.style.transform = `translateX(${dx}px)`;
      const fwd = rtl ? dx > 0 : dx > 0; // right = done, left = later (both directions, consistent with the hint)
      sw.classList.toggle('to-done', fwd && Math.abs(dx) > 40); sw.classList.toggle('to-later', !fwd && Math.abs(dx) > 40);
    });
    const end = () => {
      if (x0 === null) return;
      card.style.transition = '';
      if (dx > 90) quickDone(id); else if (dx < -90) postpone(id);
      card.style.transform = ''; sw.classList.remove('to-done', 'to-later'); x0 = null;
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    card.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  });
}

/* ================= task actions ================= */
function quickDone(id) {
  const x = taskById(id); if (!x || !isOpen(x)) return;
  const prev = structuredClone(x);
  x.status = 'done'; x.completed_on = T(); x.waiting_on = x.waiting_on || null; addLog(x, 'completed');
  putTask(x); UI.keepScroll = true;
  toast(t('completedToast'), () => { putTask(prev); });
}
function postpone(id) {
  const x = taskById(id); if (!x) return;
  const prev = structuredClone(x);
  const nd = nextWorkday(); addLog(x, 'due', '', { from: x.due, to: nd }); x.due = nd;
  putTask(x); UI.keepScroll = true;
  toast(t('postponedTo', { d: rel(nd) }), () => putTask(prev));
}
function setStatus(x, s) {
  if (x.status === s) return;
  addLog(x, 'status', '', { from: x.status, to: s });
  x.status = s; if (s !== 'wait') x.waiting_on = null;
  putTask(x);
}
function logText(e) {
  const d = e.data || {};
  switch (e.kind) {
    case 'created': return t('logCreated');
    case 'status': return t('logStatus', { a: t(stKey(d.from)), b: t(stKey(d.to)) });
    case 'due': return t('logDue', { d: d.to ? fmtShort(d.to) : t('noDue') });
    case 'completed': return t('logCompleted');
    case 'reopened': return t('logReopened');
    case 'fu_added': return t('logFuAdded', { p: esc(pname(d.person_id)) });
    case 'fu_done': return t('logFuDone', { p: esc(pname(d.person_id)) });
    case 'fu_again': return t('logFuAgain', { p: esc(pname(d.person_id)), d: d.due ? rel(d.due) : '' });
    case 'archived': return t('logArchived');
    case 'unarchived': return t('logUnarchived');
    case 'steps': return t('logSteps', { a: d.done, b: d.total });
    case 'edited': return t('logEdited');
    default: return '';
  }
}
const stKey = s => ({ todo: 'stTodo', prog: 'stProg', wait: 'stWait', hold: 'stHold', done: 'stDone', cancelled: 'stCancelled' }[s] || 'stTodo');

/* ================= sheets ================= */
let sheetState = null;
function openSheet(title, body, { onMount, wide } = {}) {
  const sh = $('#sheet');
  sh.className = 'sheet' + (wide ? ' wide' : '');
  sh.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="sheet-h"><h3>${title}</h3><button type="button" class="iconbtn" data-act="closesheet" aria-label="${esc(t('close'))}">${ic.x}</button></div><div class="sheet-b">${body}</div>`;
  $('#backdrop').classList.add('on');
  requestAnimationFrame(() => sh.classList.add('on'));
  sheetState = { dirty: false };
  sh.addEventListener('input', () => sheetState && (sheetState.dirty = true), { once: true });
  onMount && onMount(sh);
  setTimeout(() => sh.querySelector('[autofocus]')?.focus(), 250);
}
function closeSheet(force) {
  if (!force && sheetState?.dirty && sheetState.guard) { confirmSheet(t('discardQ'), t('discard'), () => closeSheet(true)); return; }
  $('#sheet').classList.remove('on'); $('#backdrop').classList.remove('on'); stopMic(); sheetState = null;
}
$('#backdrop').addEventListener('click', () => closeSheet());
function confirmSheet(msg, okLabel, onOk, danger = true) {
  const sh = $('#confirm');
  sh.innerHTML = `<div class="confirm-in"><p>${msg}</p><div class="row"><button type="button" class="btn block" id="cNo">${t('cancel')}</button><button type="button" class="btn block ${danger ? 'danger-btn' : 'primary'}" id="cOk">${okLabel}</button></div></div>`;
  sh.hidden = false;
  sh.querySelector('#cNo').onclick = () => { sh.hidden = true; };
  sh.querySelector('#cOk').onclick = () => { sh.hidden = true; onOk(); };
  sh.querySelector('#cOk').focus();
}

/* ---------- quick capture ---------- */
let D = null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function openCapture(prefill = '') {
  D = null;
  openSheet(t('quickAdd'), `
    <div class="composer"><textarea id="cap" rows="2" placeholder="${esc(t('capPh'))}" aria-label="${esc(t('capPh'))}" dir="auto" autofocus></textarea>
      <div class="tools"><span id="recState" class="rec-state"></span>${SR ? `<button type="button" class="mic" id="micBtn" data-act="mic" aria-label="${esc(t('speak'))}">${ic.mic}</button>` : ''}</div></div>
    <div id="draftBox"></div>
    <div id="capTips" class="tips">${t('capTips')}</div>`, {
    onMount: sh => { const ta = sh.querySelector('#cap'); ta.addEventListener('input', () => { autoGrow(ta); onCapText(ta.value); }); if (prefill) { ta.value = prefill; onCapText(prefill); } }
  });
  sheetState.guard = true;
}
function onCapText(v) {
  const tips = $('#capTips'); if (tips) tips.hidden = !!v.trim();
  if (!v.trim()) { D = null; $('#draftBox').innerHTML = ''; return; }
  const keep = D ? { fuAnswered: D.fuAnswered, fuDue: D.fuAnswered ? D.fu?.due : undefined, dueTouched: D.dueTouched, due: D.dueTouched ? D.due : undefined, prioTouched: D.prioTouched, priority: D.prioTouched ? D.priority : undefined, personTouched: D.personTouched, person: D.personTouched ? D.person : undefined } : {};
  const p = parseCapture(v, people(), T());
  D = Object.assign(p, Object.fromEntries(Object.entries(keep).filter(([, x]) => x !== undefined)));
  if (D.fu && keep.fuAnswered) D.fu.due = keep.fuDue;
  const askDue = (state.profile.settings || {}).askDue;
  D.askDue = askDue && !D.due && !D.dueTouched;
  drawDraft();
}
function personLabel(ref) {
  if (!ref) return '';
  if (ref.kind === 'known') return pname(ref.id);
  if (ref.kind === 'new') return ref.name;
  return ref.label || '?';
}
function personSelect(ref, id) {
  const ppl = people();
  let o = '';
  if (ref.kind === 'amb') { o += `<option value="" selected disabled>${t('whoExactly', { n: esc(ref.label) })}</option>`; ref.ids.forEach(pid => o += `<option value="${pid}">${esc(pname(pid))}</option>`); o += '<option disabled>──────</option>'; }
  if (ref.kind === 'new' || ref.newName) { const nm = ref.kind === 'new' ? ref.name : ref.newName; o += `<option value="new" ${ref.kind === 'new' ? 'selected' : ''}>${esc(nm)} · ${t('newBadge')}</option>`; }
  ppl.forEach(p => { if (ref.kind === 'amb' && ref.ids.includes(p.id)) return; o += `<option value="${p.id}" ${ref.kind === 'known' && ref.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`; });
  o += `<option value="none">${t('noPerson')}</option>`;
  return `<select class="psel ${ref.kind === 'amb' ? 'need' : ''}" id="${id}" aria-label="${esc(t('person'))}">${o}</select>`;
}
function drawDraft() {
  const box = $('#draftBox'); if (!box || !D) return;
  const datePick = `<div class="opts" id="datePick" hidden>${[[t('today'), T()], [t('tomorrow'), addDays(T(), 1)], [t('afterTomorrow'), addDays(T(), 2)], [wd(nextWeekday(T(), 0)), nextWeekday(T(), 0)], [wd(nextWeekday(T(), 4)), nextWeekday(T(), 4)], [t('inAWeek'), addDays(T(), 7)]].map(([l, v]) => `<button type="button" class="chip" data-act="setdue" data-v="${v}">${l}</button>`).join('')}<label class="chip datein">${sic('cal', 15)}<input type="date" id="dueIn" aria-label="${esc(t('pickDate'))}"></label><button type="button" class="chip" data-act="setdue" data-v="">${t('noDue')}</button></div>`;
  const dueChip = D.due ? `<button type="button" class="chip" data-act="pickdue">${sic('cal', 15)}${wd(D.due)} ${fmtShort(D.due)}${isWeekend(D.due) ? ` <em class="wk">${t('weekend')}</em>` : ''}</button>` : `<button type="button" class="chip missing" data-act="pickdue">${sic('cal', 15)}${t('noDueTap')}</button>`;
  const prioChip = `<button type="button" class="chip ${D.priority === 'hi' ? 'hi' : ''}" data-act="cycleprio">${t(D.priority === 'hi' ? 'prioHi' : D.priority === 'lo' ? 'prioLo' : 'prioMid')}</button>`;
  let personRow = '';
  if (D.person) {
    personRow = `<div class="drow">${sic(D.fu ? 'users' : D.waiting ? 'clock' : 'user', 16)}<span>${D.fu ? t('fuWith') : D.waiting ? t('waitingFor', { w: t('w_' + D.waiting.what) }) : t('related')}</span>${personSelect(D.person, 'capPerson')}${D.fu && D.fu.due ? `<span class="pill">${rel(D.fu.due)}</span>` : ''}</div>`;
    if (D.fu && D.fu.what) personRow += `<div class="drow sub" dir="auto">${esc(D.fu.what)}</div>`;
  }
  const needAsk = D.fu && D.ask && !D.fuAnswered && !D.fu.due;
  const askFu = needAsk ? `<div class="ask"><p>${t('askFuWhen', { p: esc(personLabel(D.person)) })}</p><div class="opts">${[[t('today'), T()], [t('tomorrow'), addDays(T(), 1)], [wd(nextWeekday(T(), 0)), nextWeekday(T(), 0)], [t('inAWeek'), addDays(T(), 7)]].map(([l, v]) => `<button type="button" class="chip" data-act="ansfu" data-v="${v}">${l}</button>`).join('')}${SR ? `<button type="button" class="chip" data-act="mic">${sic('mic', 15)}${t('answerVoice')}</button>` : ''}</div></div>` : '';
  const askDue = !needAsk && D.askDue ? `<div class="ask"><p>${t('askDue')}</p><div class="opts">${[[t('today'), T()], [t('tomorrow'), addDays(T(), 1)], [wd(nextWeekday(T(), 0)), nextWeekday(T(), 0)], [t('inAWeek'), addDays(T(), 7)]].map(([l, v]) => `<button type="button" class="chip" data-act="setdue" data-v="${v}">${l}</button>`).join('')}<button type="button" class="chip" data-act="setdue" data-v="">${t('noDue')}</button></div></div>` : '';
  const blocked = needAsk || (D.person && D.person.kind === 'amb');
  box.innerHTML = `<div class="preview">
      <div class="ttl" dir="auto">${esc(D.title)}</div>
      <div class="chips">${dueChip}${prioChip}${D.person && !D.fu && !D.waiting ? `<button type="button" class="chip" data-act="makefu">${sic('users', 15)}${t('makeFu')}</button>` : ''}</div>
      ${datePick}${personRow}${askFu}${askDue}
      <div class="save-row"><button type="button" class="btn primary block" data-act="savecap" ${blocked ? 'disabled' : ''}>${ic.check}${t('save')}</button><button type="button" class="btn block" data-act="savecapopen" ${blocked ? 'disabled' : ''}>${t('saveAndOpen')}</button></div>
      ${D.person && D.person.kind === 'amb' ? `<p class="note warn-txt">${t('chooseFirst')}</p>` : ''}
    </div>`;
  const sel = $('#capPerson');
  if (sel) sel.onchange = () => {
    const v = sel.value; D.personTouched = true;
    if (v === 'none') { D.person = null; D.fu = null; D.waiting = null; }
    else if (v === 'new') { /* keep */ }
    else { const nn = D.person.kind === 'new' ? D.person.name : D.person.newName; D.person = { kind: 'known', id: v, newName: nn }; }
    drawDraft();
  };
  const di = $('#dueIn'); if (di) di.onchange = () => { if (validDate(di.value)) { D.due = di.value; D.dueTouched = true; D.askDue = false; if (D.fu && !D.fuAnswered && !D.fu.due) { /* keep ask */ } drawDraft(); } };
}
function saveCapture(openAfter) {
  if (!D) return;
  const x = newTask({ title: D.title, due: D.due || null, priority: D.priority || 'mid' });
  let pid = null;
  if (D.person) pid = D.person.kind === 'known' ? D.person.id : D.person.kind === 'new' ? getOrCreatePerson(D.person.name) : null;
  addLog(x, 'created');
  if (pid && D.waiting) { x.status = 'wait'; x.waiting_on = pid; x.waiting_what = D.waiting.what; }
  if (pid && D.fu) {
    const f = { id: uuid(), person_id: pid, what: D.fu.what || '', due: D.fu.due || nextWorkday(), status: 'open', created_at: nowISO(), closed_on: null, log: [] };
    x.followups.push(f); addLog(x, 'fu_added', '', { person_id: pid });
    if (!x.due && /^(التواصل|متابعة|سؤال)/.test(x.title)) x.due = f.due;
  }
  putTask(x); closeSheet(true);
  if (openAfter) openTask(x.id); else { if (UI.tab !== 'today' && UI.tab !== 'tasks') go('today'); }
  toast(t('savedTask'), openAfter ? null : () => { x.deleted = true; putTask(x); });
}

/* ---------- voice ---------- */
let rec = null;
function toggleMic() {
  if (!SR) return;
  if (rec) { rec.stop(); return; }
  const ta = $('#cap'); if (!ta) return;
  rec = new SR(); rec.lang = L() === 'ar' ? 'ar-SA' : 'en-US'; rec.interimResults = true; rec.continuous = false;
  const base = ta.value ? ta.value.trimEnd() + ' ' : ''; let fin = '';
  rec.onresult = e => { let interim = ''; for (let k = e.resultIndex; k < e.results.length; k++) { const r = e.results[k]; if (r.isFinal) fin += r[0].transcript + ' '; else interim += r[0].transcript; } ta.value = base + fin + interim; autoGrow(ta); onCapText(ta.value); };
  rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast(t('micDenied'), null, 'err'); };
  rec.onend = () => { rec = null; micUI(); };
  try { rec.start(); } catch { rec = null; }
  micUI();
}
function stopMic() { if (rec) { try { rec.stop(); } catch { } } }
function micUI() {
  const b = $('#micBtn'); if (b) b.classList.toggle('rec', !!rec);
  const s = $('#recState'); if (s) s.innerHTML = rec ? `<span class="wave">${'<i></i>'.repeat(7)}</span>${t('listening')}` : '';
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'; }

/* ---------- full task form ---------- */
function openTaskForm(x) {
  const isNew = !x; const v = x || newTask();
  const projects = [...new Set(live().map(y => (y.project || '').trim()).filter(Boolean))];
  const stOpts = ['todo', 'prog', 'wait', 'hold'].concat(isNew ? [] : ['cancelled']);
  openSheet(isNew ? t('newTask') : t('editTask'), `<form id="taskForm" class="form" autocomplete="off">
      <label class="fld"><span>${t('fTitle')}</span><textarea name="title" rows="2" required maxlength="500" dir="auto" autofocus>${esc(v.title)}</textarea></label>
      <label class="fld"><span>${t('fDetails')}</span><textarea name="details" rows="3" dir="auto">${esc(v.details)}</textarea></label>
      <div class="grid2">
        <label class="fld"><span>${t('fDue')}</span><input type="date" name="due" value="${esc(v.due || '')}"></label>
        <label class="fld"><span>${t('fPriority')}</span><select name="priority">${['hi', 'mid', 'lo'].map(p => `<option value="${p}" ${v.priority === p ? 'selected' : ''}>${t(p === 'hi' ? 'prioHi' : p === 'lo' ? 'prioLo' : 'prioMid')}</option>`).join('')}</select></label>
      </div>
      ${v.status === 'done' ? '' : `<label class="fld"><span>${t('fStatus')}</span><select name="status" id="fStatus">${stOpts.map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${t(stKey(s))}</option>`).join('')}</select></label>`}
      <div class="grid2" id="waitBox" ${v.status === 'wait' ? '' : 'hidden'}>
        <label class="fld"><span>${t('fWaitingOn')}</span><input name="waiting_on" list="pplList" value="${esc(v.waiting_on ? pname(v.waiting_on) : '')}" dir="auto"></label>
        <label class="fld"><span>${t('fWaitingWhat')}</span><select name="waiting_what">${['reply', 'decision', 'approval'].map(w => `<option value="${w}" ${v.waiting_what === w ? 'selected' : ''}>${t('w_' + w)}</option>`).join('')}</select></label>
      </div>
      <div class="fld"><span>${t('fRole')}</span><div class="seg2" id="roleSeg">${['exec', 'follow', 'both'].map(r => `<button type="button" class="${v.role === r ? 'on' : ''}" data-role="${r}">${t('role_' + r)}</button>`).join('')}</div><input type="hidden" name="role" value="${v.role}"></div>
      <div class="grid2">
        <label class="fld"><span>${t('fProject')} <em>${t('optional')}</em></span><input name="project" list="projList" value="${esc(v.project)}" dir="auto"></label>
        <label class="fld"><span>${t('fSource')} <em>${t('optional')}</em></span><input name="source" value="${esc(v.source)}" placeholder="${esc(t('fSourcePh'))}" dir="auto"></label>
      </div>
      <label class="fld"><span>${t('fSteps')} <em>${t('fStepsHint')}</em></span><input type="number" name="steps_total" min="0" max="50" inputmode="numeric" value="${v.steps_total || ''}"></label>
      <label class="fld"><span>${t('fNotes')} <em>${t('fNotesHint')}</em></span><textarea name="notes" rows="2" dir="auto">${esc(v.notes)}</textarea></label>
      <datalist id="pplList">${people().map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
      <datalist id="projList">${projects.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>
      <div class="save-row sticky"><button type="submit" class="btn primary block">${ic.check}${t('save')}</button></div>
    </form>`, {
    onMount: sh => {
      const f = sh.querySelector('#taskForm');
      const st = sh.querySelector('#fStatus'); if (st) st.onchange = () => sh.querySelector('#waitBox').hidden = st.value !== 'wait';
      sh.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { sh.querySelectorAll('[data-role]').forEach(y => y.classList.remove('on')); b.classList.add('on'); f.elements.role.value = b.dataset.role; });
      f.onsubmit = e => {
        e.preventDefault();
        const fd = new FormData(f); const title = (fd.get('title') || '').trim(); if (!title) { f.elements.title.focus(); return; }
        const tgt = x ? taskById(x.id) : v;
        const prevDue = tgt.due || null, prevSt = tgt.status;
        tgt.title = title; tgt.details = (fd.get('details') || '').trim();
        tgt.due = validDate(fd.get('due')) || null; tgt.priority = fd.get('priority');
        if (fd.get('status')) tgt.status = fd.get('status');
        tgt.role = fd.get('role') || 'exec'; tgt.project = (fd.get('project') || '').trim(); tgt.source = (fd.get('source') || '').trim();
        tgt.steps_total = Math.max(0, Math.min(50, parseInt(fd.get('steps_total') || '0', 10) || 0)); tgt.steps_done = Math.min(tgt.steps_done || 0, tgt.steps_total);
        tgt.notes = (fd.get('notes') || '').trim();
        if (tgt.status === 'wait') { tgt.waiting_on = getOrCreatePerson(fd.get('waiting_on')); tgt.waiting_what = fd.get('waiting_what') || 'reply'; } else tgt.waiting_on = null;
        if (isNew) addLog(tgt, 'created'); else { if (prevSt !== tgt.status) addLog(tgt, 'status', '', { from: prevSt, to: tgt.status }); if (prevDue !== tgt.due) addLog(tgt, 'due', '', { from: prevDue, to: tgt.due }); }
        putTask(tgt); closeSheet(true); toast(t('saved'));
        if (isNew) openTask(tgt.id);
      };
    }
  });
  sheetState.guard = true;
}

/* ---------- complete ---------- */
function openComplete(x) {
  openSheet(t('completeTask'), `<form id="cForm" class="form"><p class="ctx" dir="auto">${esc(x.title)}</p>
      <label class="fld"><span>${t('completedOn')}</span><input type="date" name="d" value="${T()}" max="${T()}" required></label>
      <label class="fld"><span>${t('result')} <em>${t('optional')}</em></span><textarea name="r" rows="3" dir="auto" placeholder="${esc(t('resultPh'))}" autofocus></textarea></label>
      <div class="save-row"><button class="btn primary block" type="submit">${ic.check}${t('complete')}</button></div></form>`, {
    onMount: sh => sh.querySelector('#cForm').onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target);
      x.status = 'done'; x.completed_on = validDate(fd.get('d')) || T(); x.result = (fd.get('r') || '').trim(); addLog(x, 'completed', x.result);
      putTask(x); closeSheet(true); toast(t('completedToast'));
    }
  });
}

/* ---------- follow-ups ---------- */
function openFuAdd(x, f) {
  const isNew = !f;
  openSheet(isNew ? t('addFu') : t('editFu'), `<form id="fuForm" class="form" autocomplete="off"><p class="ctx" dir="auto">${esc(x.title)}</p>
      <label class="fld"><span>${t('person')}</span><input name="p" list="pplList2" required dir="auto" value="${esc(f ? pname(f.person_id) : '')}" placeholder="${esc(t('personPh'))}" autofocus></label>
      <label class="fld"><span>${t('fuWhat')}</span><input name="w" dir="auto" value="${esc(f?.what || '')}" placeholder="${esc(t('fuWhatPh'))}"></label>
      <div class="fld"><span>${t('fuDue')}</span><div class="opts">${[[t('today'), T()], [t('tomorrow'), addDays(T(), 1)], [wd(nextWeekday(T(), 0)), nextWeekday(T(), 0)], [t('inAWeek'), addDays(T(), 7)]].map(([l, v]) => `<button type="button" class="chip" data-quick="${v}">${l}</button>`).join('')}</div><input type="date" name="d" value="${esc(f?.due || nextWorkday())}" required></div>
      <datalist id="pplList2">${people().map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
      <div class="save-row"><button class="btn primary block" type="submit">${ic.check}${t('save')}</button></div></form>`, {
    onMount: sh => {
      const fm = sh.querySelector('#fuForm');
      sh.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => { fm.elements.d.value = b.dataset.quick; sh.querySelectorAll('[data-quick]').forEach(y => y.classList.remove('on')); b.classList.add('on'); });
      fm.onsubmit = e => {
        e.preventDefault(); const fd = new FormData(fm);
        const pid = getOrCreatePerson(fd.get('p')); if (!pid) return;
        if (isNew) { const nf = { id: uuid(), person_id: pid, what: (fd.get('w') || '').trim(), due: validDate(fd.get('d')) || nextWorkday(), status: 'open', created_at: nowISO(), closed_on: null, log: [] }; x.followups.push(nf); addLog(x, 'fu_added', '', { person_id: pid }); }
        else { f.person_id = pid; f.what = (fd.get('w') || '').trim(); f.due = validDate(fd.get('d')) || f.due; }
        putTask(x); closeSheet(true); toast(t('saved'));
      };
    }
  });
  sheetState.guard = true;
}
function openFuResult(x, f) {
  openSheet(t('fuResult'), `<div class="fu-head"><span class="av">${esc(initials(pname(f.person_id)))}</span><div><b dir="auto">${esc(pname(f.person_id))}</b><div class="sub" dir="auto">${esc(f.what || x.title)}</div></div></div>
      <label class="fld"><span>${t('whatHappened')} <em>${t('optional')}</em></span><textarea id="fuNote" rows="2" dir="auto" placeholder="${esc(t('whatHappenedPh'))}"></textarea></label>
      <div class="save-row"><button type="button" class="btn ok block" data-act="fudone">${ic.check}${t('fuDone')}</button><button type="button" class="btn block" data-act="funotyet">${t('fuNotYet')}</button></div>
      <div id="fuNext" hidden><div class="lab">${t('nextFu')}</div><div class="opts">${[[t('tomorrow'), addDays(T(), 1)], [wd(nextWeekday(T(), 0)), nextWeekday(T(), 0)], [t('in3days'), addDays(T(), 3)], [t('inAWeek'), addDays(T(), 7)]].map(([l, v]) => `<button type="button" class="chip" data-act="funext" data-v="${v}">${l}</button>`).join('')}<label class="chip datein">${sic('cal', 15)}<input type="date" id="fuNextIn" aria-label="${esc(t('pickDate'))}"></label></div></div>`, {
    onMount: sh => { const di = sh.querySelector('#fuNextIn'); di.onchange = () => validDate(di.value) && fuAgain(x, f, di.value); }
  });
  UI.fuCtx = { x, f };
}
function fuDone(x, f) {
  const note = ($('#fuNote')?.value || '').trim();
  f.log = f.log || []; f.log.push({ id: uuid(), at: nowISO(), date: T(), text: note, outcome: 'done' });
  f.status = 'done'; f.closed_on = T(); addLog(x, 'fu_done', note, { person_id: f.person_id });
  putTask(x); closeSheet(true); toast(t('fuLogged'));
}
function fuAgain(x, f, d) {
  const note = ($('#fuNote')?.value || '').trim();
  f.log = f.log || []; f.log.push({ id: uuid(), at: nowISO(), date: T(), text: note, outcome: 'again', next: d });
  f.due = d; addLog(x, 'fu_again', note, { person_id: f.person_id, due: d });
  putTask(x); closeSheet(true); toast(t('remindOn', { d: rel(d) }));
}

/* ---------- people ---------- */
function openPersonForm(p) {
  const isNew = !p;
  openSheet(isNew ? t('addPerson') : t('editPerson'), `<form id="pForm" class="form" autocomplete="off">
      <label class="fld"><span>${t('pName')}</span><input name="name" required maxlength="120" dir="auto" value="${esc(p?.name || '')}" autofocus></label>
      <label class="fld"><span>${t('pOrg')} <em>${t('optional')}</em></span><input name="org" dir="auto" value="${esc(p?.org || '')}" placeholder="${esc(t('pOrgPh'))}"></label>
      <label class="fld"><span>${t('pContact')} <em>${t('optional')}</em></span><input name="contact" dir="auto" value="${esc(p?.contact || '')}" placeholder="${esc(t('pContactPh'))}"></label>
      <label class="fld"><span>${t('pNotes')} <em>${t('optional')}</em></span><textarea name="notes" rows="2" dir="auto">${esc(p?.notes || '')}</textarea></label>
      <p class="note warn-txt" id="pErr" hidden>${t('nameExists')}</p>
      <div class="save-row"><button class="btn primary block" type="submit">${ic.check}${t('save')}</button></div></form>`, {
    onMount: sh => sh.querySelector('#pForm').onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target); const name = (fd.get('name') || '').trim().replace(/\s+/g, ' '); if (!name) return;
      const key = nameTokens(name).join(' ');
      if (people().some(q => q !== p && nameTokens(q.name).join(' ') === key)) { sh.querySelector('#pErr').hidden = false; return; }
      const tg = p || newPerson(name);
      tg.name = name; tg.org = (fd.get('org') || '').trim(); tg.contact = (fd.get('contact') || '').trim(); tg.notes = (fd.get('notes') || '').trim();
      putPerson(tg); closeSheet(true); toast(t('saved')); if (isNew) openPerson(tg.id);
    }
  });
  sheetState.guard = true;
}
function openProfile() {
  const p = state.profile;
  openSheet(t('profile'), `<form id="prForm" class="form" autocomplete="off">
      <label class="fld"><span>${t('yourName')}</span><input name="n" required maxlength="80" dir="auto" value="${esc(p.display_name)}" autofocus></label>
      <label class="fld"><span>${t('jobTitle')} <em>${t('optional')}</em></span><input name="j" maxlength="80" dir="auto" value="${esc(p.job_title)}" placeholder="${esc(t('jobTitlePh'))}"></label>
      <div class="save-row"><button class="btn primary block" type="submit">${ic.check}${t('save')}</button></div></form>`, {
    onMount: sh => sh.querySelector('#prForm').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); saveProfile({ display_name: (fd.get('n') || '').trim(), job_title: (fd.get('j') || '').trim() }); closeSheet(true); toast(t('saved')); }
  });
}

/* ================= layers ================= */
function pushLayer(build) {
  const el = document.createElement('div');
  el.className = 'layer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  const Lr = { el, rerender: () => { const sc = el.querySelector('.layer-b')?.scrollTop || 0; el.innerHTML = build(); const b = el.querySelector('.layer-b'); if (b) b.scrollTop = sc; } };
  Lr.rerender();
  $('#layers').appendChild(el); UI.layers.push(Lr);
  $('#layerBackdrop').classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  return Lr;
}
function popLayer() {
  const Lr = UI.layers.pop(); if (!Lr) return;
  Lr.el.classList.remove('on'); setTimeout(() => Lr.el.remove(), 280);
  if (!UI.layers.length) $('#layerBackdrop').classList.remove('on');
}
function closeAllLayers() { while (UI.layers.length) { const Lr = UI.layers.pop(); Lr.el.remove(); } $('#layerBackdrop')?.classList.remove('on'); }
$('#layerBackdrop').addEventListener('click', () => popLayer());
const topBar = (title, right = '') => `<div class="layer-top"><button type="button" class="iconbtn flipx" data-act="pop" aria-label="${esc(t('back'))}">${ic.back}</button><div class="t">${title}</div>${right}</div>`;

function openTask(id) {
  pushLayer(() => {
    const x = taskById(id);
    if (!x || x.deleted) return topBar('') + `<div class="layer-b"><div class="empty small"><p>${t('notFound')}</p></div></div>`;
    const open = isOpen(x);
    const pct = x.steps_total ? Math.round((x.steps_done / x.steps_total) * 100) : 0;
    const fus = (x.followups || []).slice().sort((a, b) => a.status === b.status ? ((a.due || '') < (b.due || '') ? -1 : 1) : a.status === 'open' ? -1 : 1);
    const logs = (x.log || []).slice().reverse();
    return topBar(t('taskDetails'), `<button type="button" class="iconbtn" data-act="edittask" data-id="${x.id}" aria-label="${esc(t('edit'))}">${ic.edit}</button>`) + `<div class="layer-b">
      <div class="chips top">${statusPill(x)}${x.priority === 'hi' ? `<span class="pill hi">${t('prioHi')}</span>` : ''}${x.project ? `<span class="pill" dir="auto">${esc(x.project)}</span>` : ''}${x.archived ? `<span class="pill">${t('archived')}</span>` : ''}</div>
      <h2 class="d-title" dir="auto">${esc(x.title)}</h2>
      ${x.details ? `<p class="d-text" dir="auto">${esc(x.details)}</p>` : ''}
      ${x.status === 'wait' && x.waiting_on ? `<div class="waitbox">${sic('clock', 16)}<span>${t('waitingFrom', { w: t('w_' + x.waiting_what), p: `<b dir="auto">${esc(pname(x.waiting_on))}</b>` })}</span></div>` : ''}
      ${x.status === 'done' ? `<div class="donebox"><b>${t('doneOn', { d: fmt(x.completed_on || T()) })}</b>${x.result ? `<p dir="auto">${esc(x.result)}</p>` : ''}</div>` : ''}
      <div class="kv num">
        <div><small>${t('fDue')}</small><b>${x.due ? `${wd(x.due)} ${fmtShort(x.due)}` : t('noDue')}</b>${isLate(x) ? `<span class="pill late">${lateTxt(x.due)}</span>` : ''}</div>
        <div><small>${t('fRole')}</small><b>${t('role_' + x.role)}</b></div>
        ${x.steps_total ? `<div class="wide"><small>${t('stepsDone')}</small><div class="stepper"><button type="button" class="iconbtn sm" data-act="stepminus" data-id="${x.id}" aria-label="−">${ic.minus}</button><b>${t('stepsOf', { a: x.steps_done, b: x.steps_total })}</b><button type="button" class="iconbtn sm" data-act="stepplus" data-id="${x.id}" aria-label="+">${ic.plus}</button></div><div class="progress"><i style="width:${pct}%"></i></div></div>` : ''}
        ${x.source ? `<div><small>${t('fSource')}</small><b dir="auto">${esc(x.source)}</b></div>` : ''}
      </div>
      ${open ? `<div class="save-row"><button type="button" class="btn primary block" data-act="complete" data-id="${x.id}">${ic.check}${t('complete')}</button><button type="button" class="btn block" data-act="postpone" data-id="${x.id}">${sic('later', 18)}${t('postpone')}</button></div>
        <div class="st-row">${['todo', 'prog', 'wait', 'hold'].map(s => `<button type="button" class="chip ${x.status === s ? 'on' : ''}" data-act="setst" data-id="${x.id}" data-v="${s}">${t(stKey(s))}</button>`).join('')}</div>` : `<div class="save-row"><button type="button" class="btn block" data-act="reopen" data-id="${x.id}">${sic('reopen', 18)}${t('reopen')}</button></div>`}
      <div class="sec-h"><h3>${t('followups')}</h3><span class="cnt">${openFus(x).length}</span><span class="grow"></span><button type="button" class="btn sm ghost" data-act="addfu" data-id="${x.id}">${sic('plus', 16)}${t('add')}</button></div>
      <div class="box">${fus.length ? fus.map(f => `<div class="fu ${f.status !== 'open' ? 'closed' : ''}"><div class="fu-top"><span class="av">${esc(initials(pname(f.person_id)))}</span><div class="body"><div class="t" dir="auto">${esc(pname(f.person_id))}</div><div class="meta">${f.what ? `<span dir="auto">${esc(f.what)}</span>` : ''}${f.status === 'open' ? `<span class="pill ${fuLate(f) ? 'late' : f.due <= T() ? 'wait' : ''}">${fuLate(f) ? lateTxt(f.due) : rel(f.due)}</span>` : `<span class="pill done">${t('fuClosed', { d: fmtShort(f.closed_on || T()) })}</span>`}</div></div>
          ${f.status === 'open' && open ? `<button type="button" class="btn sm" data-act="furesult" data-id="${x.id}" data-fu="${f.id}">${t('logResult')}</button>` : ''}<button type="button" class="iconbtn sm" data-act="fumenu" data-id="${x.id}" data-fu="${f.id}" aria-label="${esc(t('edit'))}">${sic('edit', 16)}</button></div>
          ${(f.log || []).length ? `<div class="fu-log">${f.log.map(l => `<div><span class="when num">${fmtShort(l.date)}</span> <span dir="auto">${esc(l.text || (l.outcome === 'done' ? t('fuDone') : t('fuNotYet')))}</span></div>`).join('')}</div>` : ''}</div>`).join('') : `<div class="fu muted">${t('noFollowups')}</div>`}</div>
      <div class="sec-h"><h3>${t('progressLog')}</h3></div>
      <div class="box"><form class="upd" data-form="upd" data-id="${x.id}"><input name="u" placeholder="${esc(t('updatePh'))}" aria-label="${esc(t('addUpdate'))}" dir="auto"><button type="submit" class="btn primary sm">${t('add')}</button></form>
        <ul class="tl">${logs.map(l => `<li class="${l.kind === 'note' || l.text ? 'k' : ''}"><small class="num">${fmtShort(l.at.slice(0, 10))} · ${new Intl.DateTimeFormat(LOC(), { hour: 'numeric', minute: '2-digit' }).format(new Date(l.at))}</small>${l.kind === 'note' ? `<span dir="auto">${esc(l.text)}</span>` : `<span>${logText(l)}</span>${l.text ? `<span class="lt" dir="auto">${esc(l.text)}</span>` : ''}`}</li>`).join('') || `<li class="muted">${t('noLog')}</li>`}</ul></div>
      ${x.notes ? `<div class="sec-h"><h3>${t('fNotes')}</h3></div><div class="box"><p class="d-text" dir="auto" style="padding:12px 0;margin:0">${esc(x.notes)}</p></div>` : ''}
      <div class="danger-row"><button type="button" class="btn sm ghost" data-act="archive" data-id="${x.id}">${sic('archive', 16)}${x.archived ? t('unarchive') : t('archive')}</button><button type="button" class="btn sm ghost danger" data-act="deltask" data-id="${x.id}">${sic('trash', 16)}${t('delete')}</button></div>
    </div>`;
  });
}
function openPerson(id) {
  pushLayer(() => {
    const p = personById(id);
    if (!p || p.deleted) return topBar('') + `<div class="layer-b"><div class="empty small"><p>${t('notFound')}</p></div></div>`;
    const openF = [], waits = [], hist = [], related = new Set();
    live().forEach(x => {
      (x.followups || []).forEach(f => { if (f.person_id !== id) return; related.add(x.id); if (f.status === 'open' && isOpen(x)) openF.push([x, f]); (f.log || []).forEach(l => hist.push({ x, f, l })); });
      if (x.waiting_on === id) { related.add(x.id); if (x.status === 'wait') waits.push(x); }
    });
    hist.sort((a, b) => (b.l.at || '') > (a.l.at || '') ? 1 : -1);
    const rel2 = sortTasks([...related].map(taskById).filter(x => x && isOpen(x)));
    return topBar(t('person'), `<button type="button" class="iconbtn" data-act="editperson" data-id="${p.id}" aria-label="${esc(t('edit'))}">${ic.edit}</button>`) + `<div class="layer-b">
      <div class="p-head"><span class="av xl">${esc(initials(p.name))}</span><div><h2 class="d-title" dir="auto" style="margin:0">${esc(p.name)}</h2>${p.org ? `<div class="sub" dir="auto">${esc(p.org)}</div>` : ''}${p.contact ? `<div class="sub" dir="auto">${esc(p.contact)}</div>` : ''}</div></div>
      ${p.notes ? `<p class="d-text" dir="auto">${esc(p.notes)}</p>` : ''}
      ${openF.length ? sec(t('openFollowups'), openF.length, openF.map(([x, f]) => fuRow(x, f)).join('')) : ''}
      ${waits.length ? sec(t('waitingOnThem'), waits.length, waits.map(x => taskCard(x, { noSwipe: true })).join('')) : ''}
      ${rel2.filter(x => !waits.includes(x)).length ? sec(t('relatedWork'), null, rel2.filter(x => !waits.includes(x)).map(x => taskCard(x, { noSwipe: true })).join('')) : ''}
      <div class="sec-h"><h3>${t('contactHistory')}</h3></div>
      <div class="box">${hist.length ? `<ul class="tl">${hist.map(({ x, l, f }) => `<li class="k"><small class="num">${fmtShort(l.date)}</small><span dir="auto">${esc(l.text || (l.outcome === 'done' ? t('fuDone') : t('fuNotYet')))}</span><button type="button" class="linkbtn" data-open="${x.id}" dir="auto">${esc(x.title)}</button></li>`).join('')}</ul>` : `<div class="fu muted">${t('noContact')}</div>`}</div>
      <div class="danger-row"><button type="button" class="btn sm ghost danger" data-act="delperson" data-id="${p.id}">${sic('trash', 16)}${t('delete')}</button></div>
    </div>`;
  });
}

/* ================= backup ================= */
function exportBackup() {
  const data = { app: 'rafeeq', version: 2, exported_at: nowISO(), profile: state.profile, people: state.people.filter(p => !p.deleted), tasks: state.tasks.filter(x => !x.deleted) };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `rafeeq-backup-${T()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast(t('exported'));
}
function convertV1(d) {
  const pid = new Map(), tid = new Map();
  const ppl = (d.people || []).map(p => { const id = uuid(); pid.set(p.id, id); return { id, name: p.name || '?', org: p.org || '', contact: p.contact || '', notes: p.notes || '', deleted: false, client_ts: nowISO(), created_at: p.createdAt || nowISO() }; });
  const stMap = { not_started: 'todo', in_progress: 'prog', waiting: 'wait', paused: 'hold', done: 'done', cancelled: 'cancelled' };
  const prMap = { high: 'hi', medium: 'mid', low: 'lo' };
  const tasks = (d.tasks || []).map(x => {
    const id = uuid(); tid.set(x.id, id);
    return newTask({ id, title: x.title || '?', details: [x.desc, x.links].filter(Boolean).join('\n\n'), status: stMap[x.status] || 'todo', priority: prMap[x.priority] || 'mid', role: ['exec', 'follow', 'both'].includes(x.role) ? x.role : 'exec', due: validDate(x.due) || null, project: x.project || '', source: x.source || '', waiting_on: x.waitingOn ? pid.get(x.waitingOn) || null : null, waiting_what: x.waitingWhat || 'reply', notes: x.notes || '', completed_on: validDate(x.completedAt) || null, result: x.result || '', archived: !!x.archived, created_at: x.createdAt || nowISO(),
      followups: (x.followups || []).map(f => ({ id: uuid(), person_id: pid.get(f.personId) || null, what: f.what || '', due: validDate(f.due) || T(), status: f.status === 'closed' ? 'done' : 'open', created_at: f.createdAt || nowISO(), closed_on: validDate(f.closedOn) || null, log: (f.log || []).map(l => ({ id: uuid(), at: l.at || nowISO(), date: validDate(l.date) || T(), text: l.text || '' })) })).filter(f => f.person_id),
      log: (x.log || []).map(l => ({ id: uuid(), at: l.at || nowISO(), kind: l.kind === 'note' ? 'note' : l.kind === 'completed' ? 'completed' : l.kind === 'created' ? 'created' : 'note', text: l.kind === 'note' ? (l.text || '') : (l.text || ''), data: {} })).filter(l => l.kind !== 'note' || l.text) });
  });
  return { people: ppl, tasks };
}
async function importBackup(file) {
  let d; try { d = JSON.parse(await file.text()); } catch { toast(t('importBad'), null, 'err'); return; }
  if (!d || d.app !== 'rafeeq' || !Array.isArray(d.tasks)) { toast(t('importBad'), null, 'err'); return; }
  const conv = d.version === 2 ? { people: d.people || [], tasks: d.tasks || [] } : convertV1(d);
  confirmSheet(t('importQ', { t: conv.tasks.length, p: conv.people.length }), t('importAdd'), () => {
    const haveT = new Set(state.tasks.map(x => x.id)), haveP = new Set(state.people.map(p => p.id));
    const tasks = state.tasks.concat(conv.tasks.filter(x => !haveT.has(x.id)));
    const ppl = state.people.concat(conv.people.filter(p => !haveP.has(p.id)));
    bulkReplace({ tasks, people: ppl }); toast(t('imported'));
  }, false);
}

/* ================= events ================= */
document.addEventListener('click', async e => {
  const q = s => e.target.closest(s); let el;
  if ((el = q('[data-tab]'))) { e.preventDefault(); return go(el.dataset.tab); }
  if ((el = q('[data-jump]'))) { document.getElementById(el.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if ((el = q('[data-seg]'))) { UI.seg = el.dataset.seg; return renderMain(); }
  if ((el = q('[data-pf]'))) { UI.personF = UI.personF === el.dataset.pf ? null : el.dataset.pf; return renderMain(); }
  if ((el = q('[data-person]'))) return openPerson(el.dataset.person);
  el = q('[data-act]');
  if (el) {
    const a = el.dataset.act, id = el.dataset.id, x = id ? taskById(id) : null;
    const f = x && el.dataset.fu ? x.followups.find(y => y.id === el.dataset.fu) : null;
    e.stopPropagation();
    switch (a) {
      case 'google': { const r = await signInGoogle(); if (r?.error) toast(t('loginFailed'), null, 'err'); return; }
      case 'local': return enterLocal();
      case 'lang': { const nl = L() === 'ar' ? 'en' : 'ar'; state.profile.lang = nl; if (state.mode) saveProfile({ lang: nl }); else applyLangTheme(); return renderAll(); }
      case 'setlang': { const nm = $('#onbName')?.value, jb = $('#onbJob')?.value; state.profile.lang = el.dataset.v; renderOnboarding(); applyLangTheme(); if (nm != null) $('#onbName').value = nm; if (jb != null) $('#onbJob').value = jb; return; }
      case 'theme': { const s = Object.assign({}, state.profile.settings); s.theme = s.theme === 'dark' ? 'light' : 'dark'; saveProfile({ settings: s }); return renderAll(); }
      case 'ask-date': { const s = Object.assign({}, state.profile.settings); s.askDue = !s.askDue; saveProfile({ settings: s }); return renderMain(); }
      case 'capture': return openCapture();
      case 'newtask': return openTaskForm();
      case 'newperson': return openPersonForm();
      case 'profile': return openProfile();
      case 'closesheet': return closeSheet();
      case 'pop': return popLayer();
      case 'quickdone': return quickDone(id);
      case 'postpone': return postpone(id);
      case 'complete': return x && openComplete(x);
      case 'reopen': if (x) { addLog(x, 'reopened', '', { prev: x.completed_on }); x.status = 'prog'; x.completed_on = null; putTask(x); toast(t('reopened')); } return;
      case 'setst': if (x) { const needWho = el.dataset.v === 'wait' && !x.waiting_on; setStatus(x, el.dataset.v); if (needWho) openTaskForm(x); } return;
      case 'edittask': return x && openTaskForm(x);
      case 'archive': if (x) { x.archived = !x.archived; addLog(x, x.archived ? 'archived' : 'unarchived'); putTask(x); toast(x.archived ? t('archivedToast') : t('unarchivedToast')); } return;
      case 'deltask': return x && confirmSheet(t('delTaskQ'), t('delete'), () => { const prev = structuredClone(x); x.deleted = true; putTask(x); popLayer(); toast(t('deleted'), () => putTask(prev)); });
      case 'stepplus': if (x && x.steps_done < x.steps_total) { x.steps_done++; addLog(x, 'steps', '', { done: x.steps_done, total: x.steps_total }); if (x.status === 'todo') x.status = 'prog'; putTask(x); } return;
      case 'stepminus': if (x && x.steps_done > 0) { x.steps_done--; putTask(x); } return;
      case 'addfu': return x && openFuAdd(x);
      case 'fumenu': return x && f && openFuAdd(x, f);
      case 'furesult': return x && f && openFuResult(x, f);
      case 'fudone': return UI.fuCtx && fuDone(UI.fuCtx.x, UI.fuCtx.f);
      case 'funotyet': { const b = $('#fuNext'); if (b) b.hidden = false; return; }
      case 'funext': return UI.fuCtx && fuAgain(UI.fuCtx.x, UI.fuCtx.f, el.dataset.v);
      case 'editperson': { const p = personById(id); return p && openPersonForm(p); }
      case 'delperson': { const p = personById(id); return p && confirmSheet(t('delPersonQ'), t('delete'), () => { p.deleted = true; putPerson(p); popLayer(); toast(t('deleted')); }); }
      case 'mic': return toggleMic();
      case 'pickdue': { const b = $('#datePick'); if (b) b.hidden = !b.hidden; return; }
      case 'setdue': if (D) { D.due = el.dataset.v || null; D.dueTouched = true; D.askDue = false; if (D.fu && !D.fuAnswered && D.due && D.ask) { /* follow-up timing still asked separately */ } drawDraft(); } return;
      case 'cycleprio': if (D) { D.priority = D.priority === 'mid' ? 'hi' : D.priority === 'hi' ? 'lo' : 'mid'; D.prioTouched = true; drawDraft(); } return;
      case 'makefu': if (D) { D.fu = { what: '', due: D.due || null }; D.ask = !D.due; drawDraft(); } return;
      case 'ansfu': if (D && D.fu) { D.fu.due = el.dataset.v; D.fuAnswered = true; drawDraft(); } return;
      case 'savecap': return saveCapture(false);
      case 'savecapopen': return saveCapture(true);
      case 'sync': return syncNow();
      case 'importv1': { const d = v1Data(); if (!d) return; const conv = convertV1(d); bulkReplace({ tasks: state.tasks.concat(conv.tasks), people: state.people.concat(conv.people) }); try { localStorage.setItem('rafeeq2.v1imported', '1'); } catch { } toast(t('imported')); return renderMain(); }
      case 'skipv1': { try { localStorage.setItem('rafeeq2.v1imported', 'skip'); } catch { } return renderMain(); }
      case 'adopt': { const n = adoptLocalLeftovers(); toast(t('adopted', { n })); return renderMain(); }
      case 'export': return exportBackup();
      case 'import': return $('#importFile').click();
      case 'signout': {
        const pend = state.sync.pending;
        const msg = state.mode === 'cloud' ? (pend ? t('signOutPendingQ', { n: pend }) : t('signOutQ')) : t('leaveLocalQ');
        return confirmSheet(msg, state.mode === 'cloud' ? t('signOut') : t('leaveLocal'), () => signOut({ wipe: state.mode === 'cloud' }));
      }
    }
    return;
  }
  if ((el = q('[data-open]'))) return openTask(el.dataset.open);
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'onbForm') {
    e.preventDefault();
    const n = $('#onbName').value.trim(); if (!n) return $('#onbName').focus();
    UI.onboarded = true; saveProfile({ display_name: n, job_title: $('#onbJob').value.trim(), lang: L() });
    return renderAll();
  }
  if (f.dataset.form === 'upd') {
    e.preventDefault(); const x = taskById(f.dataset.id); const v = (f.elements.u.value || '').trim(); if (!x || !v) return;
    addLog(x, 'note', v); if (x.status === 'todo') { addLog(x, 'status', '', { from: 'todo', to: 'prog' }); x.status = 'prog'; }
    putTask(x); toast(t('added'));
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'taskQ') { UI.q = e.target.value.trim(); clearTimeout(UI.qt); UI.qt = setTimeout(() => { const pos = e.target.selectionStart; renderMain(); const i = $('#taskQ'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { } } }, 150); }
});
document.addEventListener('change', e => { if (e.target.id === 'importFile' && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; } });
document.addEventListener('keydown', e => {
  const tgt = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && tgt.matches?.('[role="button"][data-open]')) { e.preventDefault(); openTask(tgt.dataset.open); return; }
  if (e.key === 'Enter' && tgt.id === 'cap' && !e.shiftKey && !e.isComposing) { e.preventDefault(); const b = document.querySelector('[data-act="savecap"]:not([disabled])'); if (b) b.click(); return; }
  if (e.key === 'Escape') { if (!$('#confirm').hidden) { $('#confirm').hidden = true; return; } if ($('#sheet').classList.contains('on')) { closeSheet(); return; } if (UI.layers.length) { popLayer(); return; } }
  if (state.mode && !tgt.closest?.('input,textarea,select,[contenteditable]') && !$('#sheet').classList.contains('on') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === '/' || e.key === 'n' || e.key === 'N' || e.key === 'ى') { e.preventDefault(); openCapture(); }
  }
});

/* ================= live updates ================= */
onChange(why => {
  if (why === 'auth' || why === 'profile') return renderAll();
  if (!state.mode) return;
  if (why === 'sync') { document.querySelectorAll('.nav-foot, .hdr-side').forEach(n => n.innerHTML = syncChip()); const sc = document.querySelector('.sync-card'); if (sc && UI.tab === 'more') renderMain(); return; }
  if (why === 'data') { if ($('#onbForm')) return; renderNav(); UI.keepScroll = true; renderMain(); UI.layers.forEach(Lr => Lr.rerender()); }
});

/* ================= boot ================= */
renderAll();
boot().catch(err => console.error(err)).finally(() => { UI.booting = false; renderAll(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
