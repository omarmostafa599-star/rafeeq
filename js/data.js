// رفيق — data layer: local cache + outbox, synced to Supabase when signed in.
// Every change is applied locally first (works offline), queued, then pushed.

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
  tasks: [], people: [],
  sync: { status: 'idle', pending: 0, last: null, error: null },
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

let outbox = new Set();
function saveLocal() {
  const ok = lsSet(K.cache(), { tasks: state.tasks, people: state.people, profile: state.profile });
  lsSet(K.outbox(), [...outbox]);
  state.sync.pending = outbox.size;
  if (!ok) { state.sync.error = 'storage'; emit('sync'); }
  return ok;
}
function loadLocal() {
  const c = lsGet(K.cache(), null);
  state.tasks = c?.tasks || []; state.people = c?.people || [];
  if (c?.profile) state.profile = Object.assign({ display_name: '', job_title: '', lang: 'ar', settings: {} }, c.profile);
  outbox = new Set(lsGet(K.outbox(), []));
  state.sync.pending = outbox.size;
}

/* ---------- session ---------- */
export async function boot() {
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
    if (data?.session) { await enterCloud(data.session.user); return; }
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN' && session && state.mode !== 'cloud') enterCloud(session.user);
    });
  }
  if (lsGet('rafeeq2.mode', null) === 'local') { enterLocal(); return; }
  state.mode = null; emit('auth');
}
export function enterLocal() {
  state.mode = 'local'; state.user = null; lsSet('rafeeq2.mode', 'local');
  loadLocal(); state.sync.status = 'local'; emit('auth');
}
async function enterCloud(u) {
  state.mode = 'cloud';
  state.user = { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name || '' };
  lsDel('rafeeq2.mode');
  loadLocal();
  if (!state.profile.display_name && state.user.name) state.profile.display_name = state.user.name;
  emit('auth');
  await syncNow();
  pullProfile();
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
  state.mode = null; state.user = null; state.tasks = []; state.people = []; outbox = new Set();
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
export function saveProfile(patch) {
  Object.assign(state.profile, patch); saveLocal(); emit('profile');
  if (state.mode === 'cloud') { lsSet('rafeeq2.profileDirty.' + state.user.id, true); pushProfile(); }
}
async function pushProfile() {
  if (!sb || state.mode !== 'cloud' || !navigator.onLine) return;
  const { error } = await sb.from('profiles').upsert({ id: state.user.id, ...state.profile });
  if (!error) lsDel('rafeeq2.profileDirty.' + state.user.id);
}

/* ---------- mutations ---------- */
const TASK_COLS = ['id', 'title', 'details', 'status', 'priority', 'role', 'due', 'project', 'source', 'waiting_on', 'waiting_what', 'notes', 'steps_done', 'steps_total', 'completed_on', 'result', 'archived', 'followups', 'log', 'deleted', 'client_ts', 'created_at'];
const PEOPLE_COLS = ['id', 'name', 'org', 'contact', 'notes', 'deleted', 'client_ts', 'created_at'];
export function newTask(fields = {}) {
  return Object.assign({ id: uuid(), title: '', details: '', status: 'todo', priority: 'mid', role: 'exec', due: null, project: '', source: '', waiting_on: null, waiting_what: 'reply', notes: '', steps_done: 0, steps_total: 0, completed_on: null, result: '', archived: false, followups: [], log: [], deleted: false, client_ts: nowISO(), created_at: nowISO() }, fields);
}
export function newPerson(name) { return { id: uuid(), name: name.trim().replace(/\s+/g, ' '), org: '', contact: '', notes: '', deleted: false, client_ts: nowISO(), created_at: nowISO() }; }

export function putTask(t) {
  t.client_ts = nowISO();
  const i = state.tasks.findIndex(x => x.id === t.id);
  if (i >= 0) state.tasks[i] = t; else state.tasks.push(t);
  outbox.add('tasks:' + t.id); saveLocal(); emit('data'); scheduleFlush();
}
export function putPerson(p) {
  p.client_ts = nowISO();
  const i = state.people.findIndex(x => x.id === p.id);
  if (i >= 0) state.people[i] = p; else state.people.push(p);
  outbox.add('people:' + p.id); saveLocal(); emit('data'); scheduleFlush();
}
export function bulkReplace({ tasks, people }) {
  // used by import: everything becomes pending upload
  state.tasks = tasks; state.people = people;
  tasks.forEach(t => outbox.add('tasks:' + t.id)); people.forEach(p => outbox.add('people:' + p.id));
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
  const rows = { tasks: [], people: [] };
  for (const k of keys) {
    const [tbl, id] = k.split(':');
    const obj = (tbl === 'tasks' ? state.tasks : state.people).find(x => x.id === id);
    if (!obj) { outbox.delete(k); continue; }
    const cols = tbl === 'tasks' ? TASK_COLS : PEOPLE_COLS;
    const row = {}; cols.forEach(c => { if (obj[c] !== undefined) row[c] = obj[c]; });
    rows[tbl].push(row); snap.set(k, obj.client_ts);
  }
  try {
    for (const tbl of ['people', 'tasks']) {
      for (let i = 0; i < rows[tbl].length; i += 200) {
        const { error } = await sb.from(tbl).upsert(rows[tbl].slice(i, i + 200), { onConflict: 'id' });
        if (error) throw error;
      }
    }
    for (const [k, ts] of snap) {
      const [tbl, id] = k.split(':');
      const obj = (tbl === 'tasks' ? state.tasks : state.people).find(x => x.id === id);
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
  for (const tbl of ['people', 'tasks']) {
    let from = 0;
    for (;;) {
      const { data, error } = await sb.from(tbl).select('*').gt('updated_at', since).order('updated_at', { ascending: true }).range(from, from + 499);
      if (error) throw error;
      for (const r of data) {
        if (r.updated_at > maxTs) maxTs = r.updated_at;
        if (outbox.has(tbl + ':' + r.id)) continue; // local edit pending → local wins, it will be pushed
        const list = tbl === 'tasks' ? state.tasks : state.people;
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
