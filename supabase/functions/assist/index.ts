// رفيق — assist: understands one chat message (Gemini). Returns tasks to capture (one or many), work already done
// (a log), or a structured query. It never receives the user's stored tasks — only the message and contact names.
// Secrets: GEMINI_API_KEY (optional GEMINI_MODEL)
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://omarmostafa599-star.github.io'];
const MODELS = [Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const DAILY_CAP = 400;

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
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['capture', 'log', 'query', 'other'] },
    logs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, date: N({ type: 'STRING' }), project: N({ type: 'STRING' }) },
        required: ['title'],
      },
    },
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          due: N({ type: 'STRING' }),
          no_due: { type: 'BOOLEAN' },
          priority: { type: 'STRING', enum: ['hi', 'mid', 'lo'] },
          role: { type: 'STRING', enum: ['exec', 'follow', 'both'] },
          source: N({ type: 'STRING' }),
          source_self: { type: 'BOOLEAN' },
          project: N({ type: 'STRING' }),
          waiting_what: N({ type: 'STRING', enum: ['reply', 'decision', 'approval'] }),
          people: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                desc: N({ type: 'STRING' }),
                generic: { type: 'BOOLEAN' },
                role: { type: 'STRING', enum: ['followup', 'waiting', 'related'] },
                what: N({ type: 'STRING' }),
                due: N({ type: 'STRING' }),
              },
              required: ['name', 'role'],
            },
          },
        },
        required: ['title', 'priority', 'role', 'people'],
      },
    },
    query: N({
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['due', 'late', 'nodue', 'waiting', 'followups', 'person', 'project', 'done', 'summary'] },
        from: N({ type: 'STRING' }),
        to: N({ type: 'STRING' }),
        person: N({ type: 'STRING' }),
        project: N({ type: 'STRING' }),
      },
      required: ['type'],
    }),
    reply: N({ type: 'STRING' }),
  },
  required: ['intent', 'tasks'],
};

function instructions(today: string, weekday: string, lang: string, known: string[], sources: string[]) {
  const ar = lang !== 'en';
  return `You are «رفيق», a work assistant for a quality-control specialist in Saudi Arabia. Read ONE message (typed or dictated; Egyptian/Gulf dialect, Modern Standard Arabic or English) and return JSON only, following the schema.

Today is ${today} (${weekday}). Work week Sunday–Thursday; Friday and Saturday are the weekend. "بكرة/بكره/غدًا" = tomorrow. "بعد بكرة" = in 2 days. "الأسبوع الجاي" = next Sunday. A weekday name = its next occurrence after today. "آخر الشهر" = last day of this month. Dates are YYYY-MM-DD.

intent:
- "capture" when the user states work to do / follow up / wait for. A message may contain SEVERAL tasks: split them into separate items (max 10). Do NOT split one task whose steps belong together (e.g. "أراجع التقرير وأبعته للمدير" is ONE task).
- "log" when the user reports work ALREADY DONE (past tense: عملت، خلصت، زرت، راجعت، حضرت، فحصت، قابلت، النهارده عملت كذا وكذا، امبارح خلصت…). Put each piece of work in logs (max 10), tasks = []. If the same message also contains future work, put that in tasks.
- "query" when the user asks about their tasks (e.g. مهامي النهارده، هات مهام بكرة، المتأخر، مين عنده متابعات واقفة، متابعاتي مع خالد، خلصت إيه الأسبوع ده). Fill query; tasks = [].
- "other" for anything else; put a one-line ${ar ? 'Arabic' : 'English'} answer in reply; tasks = [].

For each log item:
- title: short, clear, ${ar ? 'formal Modern Standard Arabic (فصحى), starting with a verbal noun (مصدر) e.g. زيارة، فحص، مراجعة، اجتماع مع، إنهاء، تسليم' : 'English, past-tense statement'}. Keep people's names, places, codes and numbers INSIDE the title (e.g. "اجتماع مع م. مأمون بشأن خطة الإخلاء"). Remove time words. Max 120 chars. Never invent.
- date: the day the work was done, YYYY-MM-DD: today unless stated ("امبارح" = yesterday, a weekday name = its most recent past occurrence). Never a future date.
- project: only if explicitly stated, else null.

For each task:
- title: short, clear, ${ar ? 'formal Modern Standard Arabic (فصحى), starting with a verbal noun (مصدر) e.g. مراجعة، إرسال، متابعة، إعداد، اعتماد، زيارة' : 'English'}. Keep codes, numbers, product and proper names. Remove dates, urgency words, filler and the people's names when they are captured in people. Max 90 chars. Never invent.
- due: the deadline if stated, else null. no_due = true ONLY if the user explicitly says there is no deadline.
- priority: "hi" only if urgency is stated (عاجل، ضروري، مهم جدًا، urgent); "lo" if explicitly not urgent; else "mid".
- role: "exec" if the user does the work; "follow" if the user only follows up others who execute; "both" if the user executes and also follows up others.
- source: who assigned the task, if stated (e.g. "طلب مني م. مأمون", "المدير كلفني"). source_self = true if the user says it is self-initiated ("من نفسي", "مبادرة مني"). Otherwise source = null and source_self = false.
- people: EVERY person mentioned (several are common: "خالد وسارة"). name = the person's name only, without titles (م. د. أ.) and without job descriptions. desc = job title/department if mentioned (e.g. "رئيس قسم العطور محمد عباس" → name "محمد عباس", desc "رئيس قسم العطور"). If only a role is given with no name (e.g. "المدير", "مسؤول المستودع"), set name to that role and generic = true. role "followup" if the user must contact/follow up with them, "waiting" if the user waits for something from them, else "related". what = what is needed from that person (short, formal) or null. due = follow-up date if stated, else null.
- If a person matches a known contact below, return the contact's name EXACTLY as written there.
- waiting_what: reply / decision / approval when waiting, else null.

query.type: due (tasks due between from and to), late, nodue, waiting (tasks waiting on others), followups (open follow-ups grouped by person), person (everything with query.person), project (query.project), done (completed between from and to), summary (general overview of today).
Known contacts: ${known.length ? known.join(' | ') : '(none)'}
Previous task sources: ${sources.length ? sources.join(' | ') : '(none)'}`;
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

    const { data: ok } = await admin.rpc('ai_take', { uid: user.id, cap: DAILY_CAP });
    if (ok === false) return json(req, { error: 'quota' });

    const payload = {
      systemInstruction: { parts: [{ text: instructions(today, weekday, lang, known, sources) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2500, responseMimeType: 'application/json', responseSchema: SCHEMA, thinkingConfig: { thinkingLevel: 'minimal' } },
    };
    let last = '';
    for (const model of [...new Set(MODELS)]) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(payload),
        });
        const g = await r.json();
        if (!r.ok) { last = g?.error?.status || String(r.status); if (r.status === 404 || r.status === 400) continue; return json(req, { error: 'gemini', detail: last }, 502); }
        const out = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        return json(req, { result: JSON.parse(out), model });
      } catch (e) { last = String(e); } finally { clearTimeout(timer); }
    }
    return json(req, { error: 'gemini', detail: last }, 502);
  } catch (e) {
    return json(req, { error: 'server', detail: String(e) }, 500);
  }
});
