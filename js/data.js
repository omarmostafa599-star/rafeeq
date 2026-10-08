// رفيق — data layer: local cache + outbox, synced to Supabase when signed in.
// Every change is applied locally first (works offline), queued, then pushed.

/* An OAuth error comes back in the URL (query or hash). Capture it before anything else reads the URL. */
export const authError = (() => {
  try {
    const src = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const err = src.get('error') || h.get('error');
    if (!err) return null;
    const desc = src.get('error_description') || h.get('error_description') || '';
    history.replaceState(null, '', location.pathname);
    return { code: err, detail: decodeURIComponent(desc.replace(/\+/g, ' ')) };
  } catch { return null; }
})();

const CFG = window.RAFEEQ_CONFIG || {};
export const cloudReady = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
export const sb = cloudReady
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
export const nowISO = () => new Date().toISOString();

export const state = {
  mode: null,            // 'cloud' | 'local' | null (signed out)
  user: null,            // { id, email, name }
  profile: { display_name: '', job_title: '', lang: 'ar', settings: {} },
  tasks: [], people: [], files: [],
  sync: { status: 'idle', pending: 0, last: null, error: null },
  drive: { linked: null, justLinked: false },   // null = unknown yet
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = (why) => listeners.forEach(fn => { try { fn(why); } catch (e) { console.error(e); } });

/* ---------- local storage ---------- */
const scope = () => state.mode === 'cloud' ? state.user.id : 'local';
const K = { cache: () => `rafeeq2.cache.${scope()}`, outbox: () => `rafeeq2.outbox.${scope()}`, cursor: () => `rafeeq2.cursor.${scope()}` };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch { } };

const TABLES = ['people', 'tasks', 'files'];
const listOf = tbl => tbl === 'tasks' ? state.tasks : tbl === 'people' ? state.people : state.files;

let outbox = new Set();
function saveLocal() {
  const ok = lsSet(K.cache(), { tasks: state.tasks, people: state.people, files: state.files, profile: state.profile });
  lsSet(K.outbox(), [...outbox]);
  state.sync.pending = outbox.size;
  if (!ok) { state.sync.error = 'storage'; emit('sync'); }
  return ok;
}
function loadLocal() {
  const c = lsGet(K.cache(), null);
  state.tasks = c?.tasks || []; state.people = c?.people || []; state.files = c?.files || [];
  if (c?.profile) state.profile = Object.assign({ display_name: '', job_title: '', lang: 'ar', settings: {} }, c.profile);
  outbox = new Set(lsGet(K.outbox(), []));
  state.sync.pending = outbox.size;
}

/* ---------- session ---------- */
export async function boot() {
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname);
    if (data?.session) { await enterCloud(data.session); return; }
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN' && session && state.mode !== 'cloud') enterCloud(session);
    });
  }
  if (lsGet('rafeeq2.mode', null) === 'local') { enterLocal(); return; }
  state.mode = null; emit('auth');
}
export function enterLocal() {
  state.mode = 'local'; state.user = null; lsSet('rafeeq2.mode', 'local');
  loadLocal(); state.sync.status = 'local'; emit('auth');
}
async function enterCloud(session) {
  const u = session.user;
  state.mode = 'cloud';
  state.user = { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name || '' };
  lsDel('rafeeq2.mode');
  loadLocal();
  if (!state.profile.display_name && state.user.name) state.profile.display_name = state.user.name;
  state.drive.linked = lsGet('rafeeq2.drive.' + u.id, null);
  emit('auth');
  await captureDriveGrant(session);
  await syncNow();
  pullProfile();
  refreshDriveStatus();
}
export async function signInGoogle() {
  if (!sb) return { error: 'not-configured' };
  const redirectTo = location.origin + location.pathname;
  return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } });
}
export async function signOut({ wipe = true } = {}) {
  if (state.mode === 'cloud' && sb) { try { await sb.auth.signOut(); } catch { } }
  if (wipe) { lsDel(K.cache()); lsDel(K.outbox()); lsDel(K.cursor()); }
  lsDel('rafeeq2.mode');
  state.mode = null; state.user = null; state.tasks = []; state.people = []; state.files = []; outbox = new Set();
  state.drive = { linked: null, justLinked: false }; driveTok = null;
  emit('auth');
}
/** Local data that exists on this device from "use without account". */
export function localLeftovers() { const c = lsGet('rafeeq2.cache.local', null); return c && (c.tasks?.length || c.people?.length) ? c : null; }
export function adoptLocalLeftovers() {
  const c = localLeftovers(); if (!c) return 0;
  const haveT = new Set(state.tasks.map(t => t.id)), haveP = new Set(state.people.map(p => p.id));
  c.people.forEach(p => { if (!haveP.has(p.id)) { state.people.push(p); outbox.add('people:' + p.id); } });
  c.tasks.forEach(t => { if (!haveT.has(t.id)) { state.tasks.push(t); outbox.add('tasks:' + t.id); } });
  saveLocal(); lsDel('rafeeq2.cache.local'); lsDel('rafeeq2.outbox.local');
  emit('data'); scheduleFlush(50);
  return c.tasks.length;
}

/* ---------- Google Drive link ----------
   The user grants drive.file once (redirect, works in installed apps too). Google's long-lived
   refresh token is stored server-side; the browser gets short-lived access tokens from the
   `google-token` Edge Function. The browser never stores the refresh token. */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let driveTok = null; // { token, exp }

export async function connectDrive() {
  if (!sb || state.mode !== 'cloud') return { error: 'not-signed-in' };
  lsSet('rafeeq2.driveConnecting', Date.now());
  const redirectTo = location.origin + location.pathname;
  return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, scopes: DRIVE_SCOPE, queryParams: { access_type: 'offline', prompt: 'consent', login_hint: state.user?.email || '' } } });
}
async function captureDriveGrant(session) {
  const wanted = lsGet('rafeeq2.driveConnecting', null);
  if (!session.provider_refresh_token) {
    if (wanted && Date.now() - wanted > 10 * 60000) lsDel('rafeeq2.driveConnecting');
    return;
  }
  lsDel('rafeeq2.driveConnecting');
  if (session.provider_token) driveTok = { token: session.provider_token, exp: Date.now() + 50 * 60000 };
  const { error } = await sb.rpc('save_google_link', { rt: session.provider_refresh_token, sc: DRIVE_SCOPE });
  if (!error) { setDriveLinked(true); state.drive.justLinked = !!wanted; emit('drive'); }
}
function setDriveLinked(v) { state.drive.linked = v; if (state.user) lsSet('rafeeq2.drive.' + state.user.id, v); }
export async function refreshDriveStatus() {
  if (!sb || state.mode !== 'cloud' || !navigator.onLine) return;
  const { data, error } = await sb.rpc('google_link_status');
  if (!error && typeof data === 'boolean' && data !== state.drive.linked) { setDriveLinked(data); emit('drive'); }
}
export async function unlinkDrive() {
  if (!sb) return;
  await sb.rpc('unlink_google');
  driveTok = null; setDriveLinked(false); emit('drive');
}
/** A valid Google access token for Drive, or throws { code: 'not_linked' | 'offline' | 'server' }. */
export async function driveToken(force = false) {
  if (!force && driveTok && Date.now() < driveTok.exp - 60000) return driveTok.token;
  if (!navigator.onLine) throw { code: 'offline' };
  const { data, error } = await sb.functions.invoke('google-token', { body: {} });
  if (error) throw { code: 'server', detail: error.message };
  if (data?.error === 'not_linked') { driveTok = null; setDriveLinked(false); emit('drive'); throw { code: 'not_linked' }; }
  if (!data?.access_token) throw { code: 'server', detail: data?.error || '' };
  driveTok = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  if (!state.drive.linked) { setDriveLinked(true); emit('drive'); }
  return driveTok.token;
}

/* ---------- AI refine (Gemini, server-side) ---------- */
/** → { result } | throws { code: 'offline' | 'missing_key' | 'quota' | 'server' } */
export async function invokeRefine(payload) {
  if (!sb || state.mode !== 'cloud') throw { code: 'local' };
  if (!navigator.onLine) throw { code: 'offline' };
  const { data, error } = await sb.functions.invoke('refine', { body: payload });
  if (error) throw { code: 'server', detail: error.message };
  if (data?.error) throw { code: data.error, detail: data.detail };
  if (!data?.result) throw { code: 'server' };
  return data.result;
}

/** Chat understanding (Gemini). Times out so a stalled request never blocks the chat. */
/* ---------- push notifications ---------- */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(t + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
export async function pushCurrent() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null;
}
/** Ask permission, subscribe this device and register it with the server. Returns 'ok' | 'denied' | 'unsupported' | 'error'. */
export async function pushEnable() {
  if (!pushSupported() || !sb || state.mode !== 'cloud') return 'unsupported';
  const perm = await Notification.requestPermission(); if (perm !== 'granted') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const { data } = await sb.functions.invoke('notify', { body: { op: 'vapid' } }); if (!data?.key) return 'error';
    let sub = await reg.pushManager.getSubscription();
    const want = b64ToBytes(data.key);
    if (sub && sub.options?.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).join() !== want.join()) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
    const j = sub.toJSON();
    const { error } = await sb.rpc('save_push_sub', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
    return error ? 'error' : 'ok';
  } catch (e) { console.warn('push', e); return 'error'; }
}
export async function pushDisable() {
  const sub = await pushCurrent(); if (!sub) return;
  try { if (sb) await sb.rpc('delete_push_sub', { p_endpoint: sub.endpoint }); } catch { }
  try { await sub.unsubscribe(); } catch { }
}
export async function pushTest() {
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('notify', { body: { op: 'test' } });
  return error ? null : data;
}
export async function invokeAssist(payload, ms = 15000) {
  if (!sb || state.mode !== 'cloud') throw { code: 'local' };
  if (!navigator.onLine) throw { code: 'offline' };
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej({ code: 'timeout' }), ms); });
  try {
    const { data, error } = await Promise.race([sb.functions.invoke('assist', { body: payload }), timeout]);
    if (error) throw { code: 'server', detail: error.message };
    if (data?.error) throw { code: data.error, detail: data.detail };
    if (!data?.result) throw { code: 'server' };
    return data.result;
  } finally { clearTimeout(timer); }
}

/* ---------- profile ---------- */
async function pullProfile() {
  if (!sb || state.mode !== 'cloud') return;
  const { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  if (data) {
    const localDirty = lsGet('rafeeq2.profileDirty.' + state.user.id, false);
    if (!localDirty) { state.profile = { display_name: data.display_name || state.profile.display_name, job_title: data.job_title || '', lang: data.lang || 'ar', settings: data.settings || {} }; saveLocal(); emit('profile'); }
    else pushProfile();
  }
}
export function saveProfile(patch, { quiet = false } = {}) {
  Object.assign(state.profile, patch); saveLocal(); if (!quiet) emit('profile');
  if (state.mode === 'cloud') { lsSet('rafeeq2.profileDirty.' + state.user.id, true); pushProfile(); }
}
async function pushProfile() {
  if (!sb || state.mode !== 'cloud' || !navigator.onLine) return;
  const { error } = await sb.from('profiles').upsert({ id: state.user.id, ...state.profile });
  if (!error) lsDel('rafeeq2.profileDirty.' + state.user.id);
}

/* ---------- mutations ---------- */
const COLS = {
  tasks: ['id', 'kind', 'title', 'details', 'status', 'priority', 'role', 'due', 'due_time', 'remind_min', 'recur', 'project', 'source', 'waiting_on', 'waiting_what', 'notes', 'steps_done', 'steps_total', 'completed_on', 'result', 'archived', 'followups', 'log', 'ai', 'deleted', 'client_ts', 'created_at'],
  people: ['id', 'name', 'org', 'contact', 'notes', 'deleted', 'client_ts', 'created_at'],
  files: ['id', 'drive_id', 'name', 'mime', 'size', 'task_id', 'person_id', 'note', 'deleted', 'client_ts', 'created_at'],
};
export function newTask(fields = {}) {
  return Object.assign({ id: uuid(), kind: 'task', title: '', details: '', status: 'todo', priority: 'mid', role: 'exec', due: null, due_time: null, remind_min: null, recur: null, project: '', source: '', waiting_on: null, waiting_what: 'reply', notes: '', steps_done: 0, steps_total: 0, completed_on: null, result: '', archived: false, followups: [], log: [], ai: {}, deleted: false, client_ts: nowISO(), created_at: nowISO() }, fields);
}
export function newPerson(name) { return { id: uuid(), name: name.trim().replace(/\s+/g, ' '), org: '', contact: '', notes: '', deleted: false, client_ts: nowISO(), created_at: nowISO() }; }
export function newFile(fields = {}) { return Object.assign({ id: uuid(), drive_id: '', name: '', mime: '', size: 0, task_id: null, person_id: null, note: '', deleted: false, client_ts: nowISO(), created_at: nowISO() }, fields); }

function put(tbl, obj) {
  obj.client_ts = nowISO();
  const list = listOf(tbl);
  const i = list.findIndex(x => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  outbox.add(tbl + ':' + obj.id); saveLocal(); emit('data'); scheduleFlush();
}
export const putTask = t => put('tasks', t);
export const putPerson = p => put('people', p);
export const putFile = f => put('files', f);
export function bulkReplace({ tasks, people, files }) {
  // used by import: everything becomes pending upload
  state.tasks = tasks; state.people = people; if (files) state.files = files;
  tasks.forEach(t => outbox.add('tasks:' + t.id)); people.forEach(p => outbox.add('people:' + p.id)); (files || []).forEach(f => outbox.add('files:' + f.id));
  saveLocal(); emit('data'); scheduleFlush(50);
}

/* ---------- sync ---------- */
let flushTimer = null, flushing = false, backoff = 2000;
function scheduleFlush(ms = 600) { if (state.mode !== 'cloud') return; clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms); }
function setSync(status, error = null) { state.sync.status = status; state.sync.error = error; state.sync.pending = outbox.size; emit('sync'); }

async function flush() {
  if (state.mode !== 'cloud' || !sb || flushing) return;
  if (!navigator.onLine) { setSync('offline'); return; }
  if (!outbox.size) { setSync('ok'); return; }
  flushing = true; setSync('syncing');
  const keys = [...outbox];
  const snap = new Map();
  const rows = { tasks: [], people: [], files: [] };
  for (const k of keys) {
    const [tbl, id] = k.split(':');
    if (!COLS[tbl]) { outbox.delete(k); continue; }
    const obj = listOf(tbl).find(x => x.id === id);
    if (!obj) { outbox.delete(k); continue; }
    const row = {}; COLS[tbl].forEach(c => { if (obj[c] !== undefined) row[c] = obj[c]; }); if (tbl === 'tasks') row.kind = obj.kind === 'log' ? 'log' : 'task';
    rows[tbl].push(row); snap.set(k, obj.client_ts);
  }
  try {
    for (const tbl of TABLES) {
      for (let i = 0; i < rows[tbl].length; i += 200) {
        const { error } = await sb.from(tbl).upsert(rows[tbl].slice(i, i + 200), { onConflict: 'id' });
        if (error) throw error;
      }
    }
    for (const [k, ts] of snap) {
      const [tbl, id] = k.split(':');
      const obj = listOf(tbl).find(x => x.id === id);
      if (!obj || obj.client_ts === ts) outbox.delete(k); // changed again while in flight → keep queued
    }
    saveLocal(); backoff = 2000; state.sync.last = nowISO();
    setSync(outbox.size ? 'syncing' : 'ok');
    if (outbox.size) scheduleFlush(300);
  } catch (e) {
    const msg = e?.message || String(e);
    if (/JWT|auth|401|403/i.test(msg)) { try { await sb.auth.refreshSession(); } catch { } }
    setSync('error', msg); clearTimeout(flushTimer); flushTimer = setTimeout(flush, backoff); backoff = Math.min(backoff * 2, 60000);
  } finally { flushing = false; }
}

async function pull() {
  if (state.mode !== 'cloud' || !sb || !navigator.onLine) return;
  const since = lsGet(K.cursor(), '1970-01-01T00:00:00Z');
  let maxTs = since, changed = false;
  for (const tbl of TABLES) {
    let from = 0;
    for (;;) {
      const { data, error } = await sb.from(tbl).select('*').gt('updated_at', since).order('updated_at', { ascending: true }).range(from, from + 499);
      if (error) throw error;
      for (const r of data) {
        if (r.updated_at > maxTs) maxTs = r.updated_at;
        if (outbox.has(tbl + ':' + r.id)) continue; // local edit pending → local wins, it will be pushed
        const list = listOf(tbl);
        const i = list.findIndex(x => x.id === r.id);
        delete r.user_id; delete r.updated_at;
        if (i >= 0) list[i] = r; else list.push(r);
        changed = true;
      }
      if (data.length < 500) break; from += 500;
    }
  }
  lsSet(K.cursor(), maxTs);
  if (changed) { saveLocal(); emit('data'); }
}

export async function syncNow() {
  if (state.mode !== 'cloud') return;
  if (!navigator.onLine) { setSync('offline'); return; }
  try { setSync('syncing'); await flush(); await pull(); setSync(outbox.size ? 'syncing' : 'ok'); state.sync.last = nowISO(); emit('sync'); }
  catch (e) { setSync('error', e?.message || String(e)); }
}
window.addEventListener('online', () => syncNow());
window.addEventListener('offline', () => { if (state.mode === 'cloud') setSync('offline'); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 90000);
