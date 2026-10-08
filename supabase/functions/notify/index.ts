// رفيق — notify: Web Push reminders (morning brief, timed tasks and follow-ups).
// Called every 5 minutes by pg_cron (header x-cron-key, generated inside the database).
// VAPID keys are generated here on first use and kept in public.app_kv (service role only) — no manual secrets.
// Web Push encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292) use WebCrypto only.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://omarmostafa599-star.github.io'];
const CONTACT = 'https://omarmostafa599-star.github.io/rafeeq/';
const OPEN = ['todo', 'prog', 'wait', 'hold'];

function cors(req: Request) {
  const o = req.headers.get('Origin') ?? '';
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

/* ---------- bytes ---------- */
const enc = (s: string) => new TextEncoder().encode(s);
const concat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const b64e = (u: Uint8Array) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (s: string) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(t + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };

/* ---------- VAPID ---------- */
type Vapid = { pub: string; key: CryptoKey };
let VAPID: Vapid | null = null;
async function vapid(admin: ReturnType<typeof createClient>): Promise<Vapid> {
  if (VAPID) return VAPID;
  let { data } = await admin.from('app_kv').select('v').eq('k', 'vapid').maybeSingle();
  if (!data) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub = b64e(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
    await admin.from('app_kv').upsert({ k: 'vapid', v: { pub, jwk } }, { onConflict: 'k', ignoreDuplicates: true });
    ({ data } = await admin.from('app_kv').select('v').eq('k', 'vapid').maybeSingle());
  }
  const v = (data as { v: { pub: string; jwk: JsonWebKey } }).v;
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  VAPID = { pub: v.pub, key };
  return VAPID;
}
async function vapidHeader(endpoint: string, v: Vapid) {
  const h = b64e(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64e(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, enc(`${h}.${c}`)));
  return `vapid t=${h}.${c}.${b64e(sig)}, k=${v.pub}`;
}

/* ---------- RFC 8291 payload encryption ---------- */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
export async function encryptPayload(p256dh: string, authSecret: string, plaintext: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16)), asKeys?: CryptoKeyPair) {
  const uaPub = b64d(p256dh), auth = b64d(authSecret);
  const as = asKeys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const head = new Uint8Array(86); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65; head.set(asPub, 21);
  return concat(head, ct);
}
type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };
async function push(sub: Sub, msg: Record<string, unknown>, v: Vapid) {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc(JSON.stringify(msg)));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { 'TTL': '43200', 'Urgency': 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Authorization': await vapidHeader(sub.endpoint, v) }, body });
  await r.body?.cancel();
  return r.status;
}

/* ---------- time in the user's zone ---------- */
function localNow(tz: string) {
  let p: Record<string, string> = {};
  try { p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date()).map(x => [x.type, x.value])); }
  catch { return localNow('Asia/Riyadh'); }
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, wd };
}
const toMin = (t: string) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const TX = {
  ar: { morning: 'صباح الخير', brief: (a: number, b: number, c: number) => [a ? `${a} مستحقة اليوم` : '', b ? `${b} متابعات` : '', c ? `${c} متأخرة` : ''].filter(Boolean).join(' · '), now: 'الآن', inMin: (m: number) => `بعد ${m} دقيقة`, fu: 'متابعة مع', test: 'إشعار تجريبي', testBody: 'الإشعارات تعمل على هذا الجهاز.' },
  en: { morning: 'Good morning', brief: (a: number, b: number, c: number) => [a ? `${a} due today` : '', b ? `${b} follow-ups` : '', c ? `${c} overdue` : ''].filter(Boolean).join(' · '), now: 'Now', inMin: (m: number) => `In ${m} min`, fu: 'Follow up with', test: 'Test notification', testBody: 'Notifications work on this device.' },
};

/* ---------- what each user should hear now ---------- */
// deno-lint-ignore no-explicit-any
async function eventsFor(admin: any, uid: string) {
  const { data: prof } = await admin.from('profiles').select('lang, display_name, settings').eq('id', uid).maybeSingle();
  const st = prof?.settings || {}, nt = st.notif || {};
  if (nt.on === false) return [];
  const L = prof?.lang === 'en' ? TX.en : TX.ar;
  const now = localNow(nt.tz || 'Asia/Riyadh');
  const wk: number[] = Array.isArray(st.wk) && st.wk.length ? st.wk : [5, 6];
  const { data: tasks } = await admin.from('tasks').select('id,title,status,due,due_time,remind_min,followups,kind,archived').eq('user_id', uid).eq('deleted', false).in('status', OPEN);
  const { data: ppl } = await admin.from('people').select('id,name').eq('user_id', uid);
  const pname = new Map((ppl || []).map((p: { id: string; name: string }) => [p.id, p.name]));
  const open = (tasks || []).filter((x: { kind?: string; archived?: boolean }) => x.kind !== 'log' && !x.archived);
  const ev: { key: string; msg: Record<string, unknown> }[] = [];
  const defRm = Number.isInteger(nt.remind) ? nt.remind : 0;
  // morning brief
  const bt = nt.brief === false ? null : toMin(nt.brief || '07:30');
  if (bt != null && now.min >= bt && now.min < bt + 60 && (nt.weekend || !wk.includes(now.wd))) {
    const due = open.filter((x: { due: string }) => x.due === now.date).length;
    const late = open.filter((x: { due: string }) => x.due && x.due < now.date).length;
    let fus = 0; open.forEach((x: { followups?: { status: string; due?: string }[] }) => (x.followups || []).forEach(f => { if (f.status === 'open' && f.due && f.due <= now.date) fus++; }));
    if (due + late + fus > 0) {
      const first = String(prof?.display_name || '').split(' ')[0];
      ev.push({ key: `brief:${now.date}`, msg: { title: first ? `${L.morning} ${first}` : L.morning, body: L.brief(due, fus, late), url: './', tag: 'brief' } });
    }
  }
  const timed = (title: string, body: string, time: string, rm: number, key: string, url: string, tag: string) => {
    const tm = toMin(time); if (tm == null || rm < 0) return;
    const trig = tm - rm;
    if (now.min >= trig && now.min < trig + 30) ev.push({ key, msg: { title, body: `${rm > 0 ? L.inMin(rm) : L.now} · ${time}${body ? ' · ' + body : ''}`, url, tag } });
  };
  for (const x of open) {
    if (x.due === now.date && x.due_time) timed(x.title, '', x.due_time, Number.isInteger(x.remind_min) ? x.remind_min : defRm, `t:${x.id}:${x.due}:${x.due_time}`, `./#t=${x.id}`, `t-${x.id}`);
    for (const f of (x.followups || [])) if (f.status === 'open' && f.due === now.date && f.time) timed(`${L.fu} ${pname.get(f.person_id) || ''}`.trim(), f.what || x.title, f.time, Number.isInteger(f.remind) ? f.remind : defRm, `f:${f.id}:${f.due}:${f.time}`, `./#t=${x.id}`, `f-${f.id}`);
  }
  return ev;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (url.searchParams.has('vapid') || body.op === 'vapid') return json(req, { key: (await vapid(admin)).pub });
    const v = await vapid(admin);

    if (body.op === 'test') {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: { user } } = await admin.auth.getUser(jwt);
      if (!user) return json(req, { error: 'unauthorized' }, 401);
      const { data: prof } = await admin.from('profiles').select('lang').eq('id', user.id).maybeSingle();
      const L = prof?.lang === 'en' ? TX.en : TX.ar;
      const { data: subs } = await admin.from('push_subs').select('*').eq('user_id', user.id);
      const out: number[] = [];
      for (const s of subs || []) { const st = await push(s, { title: L.test, body: L.testBody, url: './', tag: 'test' }, v); out.push(st); if (st === 404 || st === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint); }
      return json(req, { devices: out.length, statuses: out });
    }

    const { data: kv } = await admin.from('app_kv').select('v').eq('k', 'cron_key').maybeSingle();
    if (!kv || req.headers.get('x-cron-key') !== kv.v) return json(req, { error: 'forbidden' }, 403);
    const { data: subs } = await admin.from('push_subs').select('*');
    const byUser = new Map<string, Sub[]>(); (subs || []).forEach((s: Sub) => { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id)!.push(s); });
    let sent = 0, dropped = 0;
    for (const [uid, list] of byUser) {
      const ev = await eventsFor(admin, uid); if (!ev.length) continue;
      const { data: done } = await admin.from('notif_sent').select('key').eq('user_id', uid).in('key', ev.map(e => e.key));
      const seen = new Set((done || []).map((d: { key: string }) => d.key));
      const fresh = ev.filter(e => !seen.has(e.key)).slice(0, 6); if (!fresh.length) continue;
      await admin.from('notif_sent').upsert(fresh.map(e => ({ user_id: uid, key: e.key })), { onConflict: 'user_id,key', ignoreDuplicates: true });
      for (const e of fresh) for (const s of list) {
        const st = await push(s, e.msg, v).catch(() => 0);
        if (st >= 200 && st < 300) { sent++; await admin.from('push_subs').update({ last_ok: new Date().toISOString() }).eq('endpoint', s.endpoint); }
        else if (st === 404 || st === 410) { dropped++; await admin.from('push_subs').delete().eq('endpoint', s.endpoint); }
      }
    }
    return json(req, { users: byUser.size, sent, dropped });
  } catch (e) {
    return json(req, { error: 'server', detail: String(e) }, 500);
  }
});
