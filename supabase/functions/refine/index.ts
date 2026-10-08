// رفيق — refine: improves a quickly-captured task in the background with Google Gemini.
// Secrets (Supabase → Edge Functions → Secrets):  GEMINI_API_KEY   (optional: GEMINI_MODEL)
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://omarmostafa599-star.github.io'];
const MODELS = [Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const DAILY_CAP = 300;

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

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Concise task title' },
    due: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD or null' },
    priority: { type: 'STRING', enum: ['hi', 'mid', 'lo'] },
    waiting_what: { type: 'STRING', enum: ['reply', 'decision', 'approval'], nullable: true },
    people: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          role: { type: 'STRING', enum: ['followup', 'waiting', 'related'] },
          what: { type: 'STRING', description: 'What is needed from this person, short' },
          due: { type: 'STRING', nullable: true, description: 'Follow-up date YYYY-MM-DD or null' },
        },
        required: ['name', 'role'],
      },
    },
  },
  required: ['title', 'priority', 'people'],
};

function instructions(today: string, weekday: string, lang: string, known: string[]) {
  return `You organise work tasks for a quality-control specialist in Saudi Arabia. The user typed or dictated a quick note (Egyptian/Gulf dialect, Modern Standard Arabic, or English).
Return JSON only, following the schema.

Rules:
- title: rewrite as a short, clear task title. ${lang === 'en' ? 'Write in English.' : 'Write in formal Modern Standard Arabic (فصحى), starting with a verbal noun (مصدر) such as: مراجعة، إرسال، متابعة، تجهيز، اعتماد.'} Keep product names, codes, numbers and proper nouns exactly. Remove dates, urgency words and filler. Max 90 characters. Never invent details.
- due: the task deadline as YYYY-MM-DD, or null if none is stated. Today is ${today} (${weekday}). The work week is Sunday–Thursday; Friday and Saturday are the weekend. "بكرة/بكره" = tomorrow. "الأسبوع الجاي" = next Sunday. A weekday name means its next occurrence after today. "آخر الشهر" = last day of this month.
- priority: "hi" only if urgency is stated (عاجل، ضروري، مهم جدًا، urgent); "lo" if explicitly not urgent; otherwise "mid".
- people: EVERY person mentioned (there may be several, e.g. "خالد وسارة"). role "followup" if the user must contact/follow up with them; "waiting" if the user is waiting for something from them; otherwise "related". what = what is needed from that person (short, formal). due = the follow-up date if stated, else null.
- If a person matches one of the user's known contacts below, return the contact's name EXACTLY as written there. Otherwise return the name as written, without titles like م. or د.
- waiting_what: for waiting — reply, decision or approval; else null.
Known contacts: ${known.length ? known.join(' | ') : '(none)'}`;
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
    const text = String(body.text ?? '').slice(0, 800).trim();
    if (!text) return json(req, { error: 'empty' }, 400);
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
    const weekday = String(body.weekday ?? '').slice(0, 20);
    const lang = body.lang === 'en' ? 'en' : 'ar';
    const known: string[] = Array.isArray(body.people) ? body.people.map((s: unknown) => String(s).slice(0, 80)).slice(0, 300) : [];

    const { data: ok } = await admin.rpc('ai_take', { uid: user.id, cap: DAILY_CAP });
    if (ok === false) return json(req, { error: 'quota' });

    const payload = {
      systemInstruction: { parts: [{ text: instructions(today, weekday, lang, known) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: 'application/json', responseSchema: SCHEMA, thinkingConfig: { thinkingLevel: 'minimal' } },
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
        const parsed = JSON.parse(out);
        return json(req, { result: parsed, model });
      } catch (e) { last = String(e); } finally { clearTimeout(timer); }
    }
    return json(req, { error: 'gemini', detail: last }, 502);
  } catch (e) {
    return json(req, { error: 'server', detail: String(e) }, 500);
  }
});
