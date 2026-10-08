// رفيق — assist: the chat brain (Gemini). Understands one message in the context of a short conversation and the
// unsaved drafts: replies naturally, captures tasks / work done, edits drafts, or turns a question into a structured query.
// It never receives the user's stored tasks — only the conversation, the unsaved drafts and contact names.
// Secrets: GEMINI_API_KEY (optional GEMINI_MODEL)
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://omarmostafa599-star.github.io'];
const MODELS = [Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const DAILY_CAP = 600;

function cors(req: Request) {
  const o = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const N = (o: Record<string, unknown>) => ({ ...o, nullable: true });
const RECUR = N({ type: 'OBJECT', properties: { freq: { type: 'STRING', enum: ['daily', 'weekly', 'monthly', 'quarterly'] }, days: { type: 'ARRAY', items: { type: 'INTEGER' } }, dom: N({ type: 'INTEGER' }), last: { type: 'BOOLEAN' } }, required: ['freq'] });
const PERSON = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' }, desc: N({ type: 'STRING' }), generic: { type: 'BOOLEAN' },
    role: { type: 'STRING', enum: ['followup', 'waiting', 'related'] }, what: N({ type: 'STRING' }), due: N({ type: 'STRING' }),
  },
  required: ['name', 'role'],
};
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['chat', 'capture', 'log', 'edit', 'save', 'cancel', 'query', 'other'] },
    reply: { type: 'STRING' },
    logs: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, date: N({ type: 'STRING' }), project: N({ type: 'STRING' }) }, required: ['title'] } },
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' }, due: N({ type: 'STRING' }), due_time: N({ type: 'STRING' }), no_due: { type: 'BOOLEAN' }, recur: RECUR,
          priority: { type: 'STRING', enum: ['hi', 'mid', 'lo'] }, role: { type: 'STRING', enum: ['exec', 'follow', 'both'] },
          source: N({ type: 'STRING' }), source_self: { type: 'BOOLEAN' }, project: N({ type: 'STRING' }),
          waiting_what: N({ type: 'STRING', enum: ['reply', 'decision', 'approval'] }), people: { type: 'ARRAY', items: PERSON },
        },
        required: ['title', 'priority', 'role', 'people'],
      },
    },
    edits: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'INTEGER' }, title: N({ type: 'STRING' }), due: N({ type: 'STRING' }), no_due: N({ type: 'BOOLEAN' }), due_time: N({ type: 'STRING' }), clear_time: N({ type: 'BOOLEAN' }),
          priority: N({ type: 'STRING', enum: ['hi', 'mid', 'lo'] }), role: N({ type: 'STRING', enum: ['exec', 'follow', 'both'] }),
          source: N({ type: 'STRING' }), source_self: N({ type: 'BOOLEAN' }), project: N({ type: 'STRING' }), date: N({ type: 'STRING' }),
          recur: RECUR, clear_recur: N({ type: 'BOOLEAN' }), add_people: { type: 'ARRAY', items: PERSON }, remove_people: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['n'],
      },
    },
    remove: { type: 'ARRAY', items: { type: 'INTEGER' } },
    query: N({
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['due', 'late', 'nodue', 'waiting', 'followups', 'person', 'project', 'done', 'summary'] },
        from: N({ type: 'STRING' }), to: N({ type: 'STRING' }), person: N({ type: 'STRING' }), project: N({ type: 'STRING' }),
      },
      required: ['type'],
    }),
  },
  required: ['intent', 'reply'],
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function instructions(o: { today: string; weekday: string; lang: string; known: string[]; sources: string[]; weekend: number[] }) {
  const ar = o.lang !== 'en';
  const wk = o.weekend.map(d => DAYS[d]).join(' and ');
  const start = DAYS[[0, 1, 2, 3, 4, 5, 6].map(i => (Math.max(...o.weekend) + 1 + i) % 7).find(d => !o.weekend.includes(d)) ?? 0];
  return `You are «رفيق» (Rafeeq), a friendly assistant inside a personal work organizer used by working professionals. You chat with the user, help them capture tasks, log work they already did, change the pending drafts, and answer questions about their work. Return JSON only, following the schema.

Today is ${o.today} (${o.weekday}). Weekend: ${wk}; every other day is a workday. "بكرة/بكره/غدًا" = tomorrow. "بعد بكرة" = in 2 days. "الأسبوع الجاي" = next ${start}. A weekday name = its next occurrence after today. "آخر الشهر" = last day of this month. Dates are YYYY-MM-DD.

reply (ALWAYS): one or two short, warm, natural sentences in the SAME language and dialect as the user's last message (Egyptian → Egyptian, Gulf → Gulf, Modern Standard Arabic → MSA, English → English). No emojis.
- Greetings / small talk: answer naturally and offer help (e.g. "ازيك" → "الحمد لله، أساعدك إزاي النهارده؟").
- When you capture or log items, say how many and of what kind (e.g. "تمام، دول ٣ مهام."). Do NOT list them (the app shows them as cards) and do NOT ask about a missing deadline, assigner or people — the app asks those itself.
- After an edit, confirm briefly what changed.
- Off-topic questions: answer in one short sentence, then offer to help with their work.

intent:
- "chat": greetings, thanks, small talk, help ("تقدر تعمل إيه؟"). tasks/logs/edits empty.
- "capture": new work to do → tasks (a message may hold SEVERAL tasks: split them, max 10; do NOT split one task whose steps belong together, e.g. "أراجع التقرير وأبعته للمدير" is ONE task).
- "log": work ALREADY DONE (past tense: عملت، خلصت، زرت، راجعت، حضرت، فحصت، قابلت…) → logs (max 10). If the same message also has future work, put that in tasks.
- "edit": the user changes the CURRENT drafts listed in the last message (e.g. "التانية خليها الأحد", "شيل الأخيرة", "ضيف سارة في الأولى", "المصدر م. مأمون", "خليها كل أسبوع", "الساعة 10"). Use edits (n = draft number, 1-based) and remove. Never create a new draft for a change to an existing one.
- "save": the user approves saving the drafts ("تمام", "ضيفهم", "احفظ", "ok", "كده تمام").
- "cancel": the user wants to discard the drafts.
- "query": a question about their stored tasks (مهامي النهارده، هات مهام بكرة، المتأخر، مين عنده متابعات واقفة، متابعاتي مع خالد، خلصت إيه الأسبوع ده) → fill query.
A message may combine new items and edits: then use "capture"/"log" and ALSO fill edits/remove.

Each task:
- title: short, clear, ${ar ? 'formal Modern Standard Arabic (فصحى), starting with a verbal noun (مصدر) e.g. مراجعة، إرسال، متابعة، إعداد، اعتماد، زيارة' : 'English'}. Keep codes, numbers, product and proper names. Remove dates, times, recurrence words, urgency words, filler and the people's names when they are captured in people. Max 90 chars. Never invent.
- due: the deadline if stated, else null. no_due = true ONLY if the user explicitly says there is no deadline. due_time: "HH:MM" (24h) if a time of day is stated ("الساعة 10" = 10:00, "3 العصر" = 15:00, "الساعة 2" in a work context = 14:00), else null.
- recur: only if the user says it repeats. freq daily (every workday) | weekly (days: 0=Sunday … 6=Saturday) | monthly (dom = day of month, or last = true for the last workday of the month) | quarterly (every 3 months, dom). Otherwise null. For a recurring task without an explicit date, set due to the first occurrence from today.
- priority: "hi" only if urgency is stated (عاجل، ضروري، مهم جدًا، urgent); "lo" if explicitly not urgent; else "mid".
- role: "exec" if the user does the work; "follow" if the user only follows up others who execute; "both" if the user executes and also follows up others.
- source: who assigned the task, ONLY if stated (e.g. "طلب مني م. مأمون", "المدير كلفني"). source_self = true ONLY if the user explicitly says it is self-initiated ("من نفسي", "مبادرة مني", "أنا المصدر"). Otherwise source = null and source_self = false.
- people: EVERY person mentioned (several are common). name = the person's name only, without titles (م. د. أ.) and without job descriptions. desc = job title/department only if mentioned (e.g. "رئيس قسم العطور محمد عباس" → name "محمد عباس", desc "رئيس قسم العطور"); never put a title like "مهندس" in desc. If only a role is given with no name ("المدير"), set name to that role and generic = true. role "followup" if the user must contact/follow up with them, "waiting" if the user waits for something from them, else "related". what = what is needed from that person (short, formal) or null. due = follow-up date if stated, else null.
- If a person matches a known contact below, return the contact's name EXACTLY as written there.
- waiting_what: reply / decision / approval when waiting, else null.

Each log item: title in ${ar ? 'formal MSA starting with a verbal noun (زيارة، فحص، مراجعة، اجتماع مع، إنهاء، تسليم)' : 'English'}, keeping people's names, places, codes and numbers inside the title; date = the day it was done (today unless stated: "امبارح" = yesterday, a weekday name = its most recent past occurrence; never a future date); project only if stated.

Edits: fill only the fields that change. To remove a time use clear_time = true; to stop repeating use clear_recur = true. For a log draft you may change title, date or project.

query.type: due (tasks due between from and to), late, nodue, waiting (tasks waiting on others), followups (open follow-ups grouped by person), person (everything with query.person), project (query.project), done (completed between from and to), summary (overview of today).
Known contacts: ${o.known.length ? o.known.join(' | ') : '(none)'}
Previous task assigners: ${o.sources.length ? o.sources.join(' | ') : '(none)'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json(req, { error: 'unauthorized' }, 401);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json(req, { error: 'missing_key' });

    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? '').slice(0, 2000).trim();
    if (!text) return json(req, { error: 'empty' }, 400);
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
    const weekday = String(body.weekday ?? '').slice(0, 20);
    const lang = body.lang === 'en' ? 'en' : 'ar';
    const list = (v: unknown, n: number) => Array.isArray(v) ? v.map((s) => String(s).slice(0, 80)).slice(0, n) : [];
    const known = list(body.people, 300), sources = list(body.sources, 30);
    const weekend = Array.isArray(body.weekend) && body.weekend.length && body.weekend.length <= 3 && body.weekend.every((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) ? body.weekend as number[] : [5, 6];
    // short conversation memory: alternating user/model turns, oldest first
    const turns: { role: string; parts: { text: string }[] }[] = [];
    for (const h of (Array.isArray(body.history) ? body.history : []).slice(-10)) {
      const role = h?.role === 'model' ? 'model' : 'user'; const t = String(h?.text ?? '').slice(0, 600).trim(); if (!t) continue;
      if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].parts[0].text += '\n' + t; else turns.push({ role, parts: [{ text: t }] });
    }
    while (turns.length && turns[0].role !== 'user') turns.shift();
    if (turns.length && turns[turns.length - 1].role === 'user') turns.pop();
    const drafts = JSON.stringify(Array.isArray(body.drafts) ? body.drafts.slice(0, 10) : []).slice(0, 6000);
    const pendingQ = typeof body.pending === 'string' ? body.pending.slice(0, 40) : '';
    const last = `Current drafts (numbered, not saved yet): ${drafts}${pendingQ ? `\nThe app is currently asking the user about: ${pendingQ}` : ''}\n\nUser message:\n${text}`;

    const { data: ok } = await admin.rpc('ai_take', { uid: user.id, cap: DAILY_CAP });
    if (ok === false) return json(req, { error: 'quota' });

    const payload = {
      systemInstruction: { parts: [{ text: instructions({ today, weekday, lang, known, sources, weekend }) }] },
      contents: [...turns, { role: 'user', parts: [{ text: last }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 3000, responseMimeType: 'application/json', responseSchema: SCHEMA, thinkingConfig: { thinkingLevel: 'minimal' } },
    };
    let lastErr = '';
    for (const model of [...new Set(MODELS)]) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(payload),
        });
        const g = await r.json();
        if (!r.ok) { lastErr = g?.error?.status || String(r.status); if (r.status === 404 || r.status === 400) continue; return json(req, { error: 'gemini', detail: lastErr }, 502); }
        const out = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        const res = JSON.parse(out);
        if (body.v !== 2 && ['chat', 'edit', 'save', 'cancel'].includes(res.intent)) res.intent = 'other'; // clients before 2.5
        return json(req, { result: res, model });
      } catch (e) { lastErr = String(e); } finally { clearTimeout(timer); }
    }
    return json(req, { error: 'gemini', detail: lastErr }, 502);
  } catch (e) {
    return json(req, { error: 'server', detail: String(e) }, 500);
  }
});
