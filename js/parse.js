// رفيق — instant local parser for quick capture (Arabic dialects + English).
// Runs on-device in a few milliseconds; the AI step (phase 3) only refines its output.

/* ---------- dates ---------- */
export const pad = n => String(n).padStart(2, '0');
export const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ds(new Date());
export const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
export const diffDays = (a, b) => Math.round((pd(a) - pd(b)) / 86400000);
export const isWeekend = s => { const w = pd(s).getDay(); return w === 5 || w === 6; }; // Fri, Sat (KSA)
export function addWorkdays(s, n) { let d = s; const step = n < 0 ? -1 : 1; let left = Math.abs(n); while (left > 0) { d = addDays(d, step); if (!isWeekend(d)) left--; } return d; }
export function nextWeekday(from, w) { let d = addDays(from, 1); while (pd(d).getDay() !== w) d = addDays(d, 1); return d; }
export const lastOfMonth = s => { const d = pd(s); return ds(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export function validDate(v) { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const d = pd(v); return isNaN(d) || ds(d) !== v ? null : v; }

/* ---------- names ---------- */
const MARKS = /[ً-ٰٟـ]/g;
export const normAr = s => String(s || '').normalize('NFKC').replace(MARKS, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase();
const TITLES = new Set(['م', 'د', 'ا', 'مهندس', 'المهندس', 'دكتور', 'الدكتور', 'استاذ', 'الاستاذ', 'مدام', 'الحاج', 'الشيخ', 'eng', 'dr', 'mr', 'mrs', 'ms']);
export const nameTokens = s => (normAr(s).match(/[\p{L}\p{N}]+/gu) || []).filter(x => !TITLES.has(x));

export function aliasMap(people) {
  const map = new Map();
  const add = (k, id) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(id); };
  people.forEach(p => {
    const tk = nameTokens(p.name); if (!tk.length) return;
    add(tk.join(' '), p.id);
    if (tk[0].length >= 3) add(tk[0], p.id);
    if (tk.length > 2) add(tk.slice(0, 2).join(' '), p.id);
  });
  return map;
}
/** Known people found in free text → [{s, e, ids}] spans on the original string. */
export function findPeople(text, people) {
  const map = aliasMap(people); if (!map.size) return [];
  const toks = []; const re = /[\p{L}\p{M}\p{N}]+/gu; let m;
  while ((m = re.exec(text))) toks.push({ s: m.index, e: m.index + m[0].length, raw: m[0], n: normAr(m[0]) });
  const hits = [];
  for (let i = 0; i < toks.length;) {
    let hit = null;
    for (let L = 3; L >= 1 && !hit; L--) {
      if (i + L > toks.length) continue;
      const seq = toks.slice(i, i + L).map(x => x.n);
      const tries = [{ seq, off: 0 }];
      if (/^[وفبلك]/.test(seq[0]) && seq[0].length > 3) tries.push({ seq: [seq[0].slice(1), ...seq.slice(1)], off: 1 });
      for (const tr of tries) { const ids = map.get(tr.seq.join(' ')); if (ids) { hit = { L, ids: [...ids], s: toks[i].s + tr.off, e: toks[i + L - 1].e }; break; } }
    }
    if (hit) { hits.push(hit); i += hit.L; } else i++;
  }
  return hits;
}

/* ---------- vocabulary ---------- */
const STOP = new Set(['عشان', 'علشان', 'بخصوص', 'عن', 'على', 'في', 'من', 'مع', 'الى', 'الي', 'قبل', 'بعد', 'بكره', 'بكرا', 'غدا', 'اليوم', 'النهارده', 'الاحد', 'الاثنين', 'الاتنين', 'الثلاثاء', 'التلات', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت', 'و', 'لما', 'يرد', 'يبعت', 'يعتمد', 'يرسل', 'يوافق', 'ضروري', 'عاجل', 'الاسبوع', 'الجاي', 'القادم', 'اخر', 'الشهر', 'رد', 'اعتماد', 'موافقه', 'قرار', 'حول', 'لأجل', 'لاجل', 'about', 'regarding', 'to', 'for', 'tomorrow', 'today']);
const WEEKDAYS = [['الاحد', 'الحد', 'sunday'], ['الاثنين', 'الاتنين', 'monday'], ['الثلاثاء', 'التلات', 'الثلاث', 'tuesday'], ['الاربعاء', 'الاربع', 'wednesday'], ['الخميس', 'thursday'], ['الجمعه', 'friday'], ['السبت', 'saturday']];
const FU_VERB = /(^|\s)(و?اتابع|متابعه|و?اكلم|و?اتصل|و?اسال|و?اذكر|و?اراسل|و?ابلغ|و?ارجع ل|follow\s*up|call|ask|remind|ping)(\s|$)/;
const WAIT_VERB = /(مستني|منتظر|بانتظار|في انتظار|waiting)/;

function dueFrom(n, td) {
  if (/(بعد\s*بكر[هةا]|بعد\s*غد|day after tomorrow)/.test(n)) return addDays(td, 2);
  if (/(النهارده|النهارده|اليوم|today)/.test(n)) return td;
  if (/(بكر[هةا]|غدا|tomorrow)/.test(n)) return addDays(td, 1);
  let m = n.match(/بعد\s+(\d+)\s*(يوم|ايام)|in\s+(\d+)\s+days?/); if (m) return addDays(td, +(m[1] || m[3]));
  if (/بعد\s+يومين/.test(n)) return addDays(td, 2);
  if (/بعد\s+(اسبوعين)/.test(n)) return addDays(td, 14);
  if (/بعد\s+(اسبوع)|in a week|next week/.test(n) && !/الاسبوع\s+(الجاي|القادم)/.test(n)) return addDays(td, 7);
  if (/(اخر|نهايه)\s+الشهر|end of (the )?month/.test(n)) return lastOfMonth(td);
  if (/(اخر|نهايه)\s+الاسبوع|end of (the )?week/.test(n)) return nextWeekday(td, 4);
  if (/الاسبوع\s+(الجاي|القادم|اللي\s+جاي)/.test(n)) return nextWeekday(td, 0);
  for (let i = 0; i < WEEKDAYS.length; i++) for (const w of WEEKDAYS[i]) if (new RegExp('(^|[^\\p{L}])(يوم\\s+)?' + w + '([^\\p{L}]|$)', 'u').test(n)) return nextWeekday(td, i);
  m = n.match(/(^|[^\d])(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?(?!\d)/);
  if (m) { let y = m[4] ? +m[4] : +td.slice(0, 4); if (y < 100) y += 2000; const v = validDate(`${y}-${pad(+m[3])}-${pad(+m[2])}`); if (v) return (!m[4] && v < td) ? validDate(`${y + 1}-${pad(+m[3])}-${pad(+m[2])}`) : v; }
  return null;
}

const FILLER = /^(لازم|عايز|عاوز|محتاج|ابغى|أبغى|ابغا|ودي|نفسي|المفروض|يجب أن|يجب|أريد أن|أريد|أحتاج إلى|احتاج|need to|i need to|have to|must)\s+/i;
const VERBS = [
  [/^(أخلص|اخلص|أخلّص|أنهي|انهي)\s+/, 'إنهاء '], [/^(أكلم|اكلم|أكلّم|اتصل ب|أتصل ب|أتصل على|اتصل على)\s*/, 'التواصل مع '],
  [/^(أتابع|اتابع)\s+(مع\s+)?/, 'متابعة '], [/^(أراجع|اراجع)\s+/, 'مراجعة '], [/^(أجهز|اجهز|أجهّز|أحضّر|احضر)\s+/, 'تجهيز '],
  [/^(أبعت|ابعت|أرسل|ارسل)\s+/, 'إرسال '], [/^(أسأل|اسأل|اسال)\s+/, 'سؤال '], [/^(أرفع|ارفع)\s+/, 'رفع '], [/^(أعمل|اعمل|أسوي|اسوي)\s+/, 'إعداد '],
  [/^(أزور|ازور)\s+/, 'زيارة '], [/^(أطلب|اطلب)\s+/, 'طلب '], [/^(أدقق|ادقق)\s+/, 'تدقيق '], [/^(أفحص|افحص)\s+/, 'فحص '], [/^(أسلم|اسلم|أسلّم)\s+/, 'تسليم '],
  [/^(أحدث|احدث|أحدّث)\s+/, 'تحديث '], [/^(أكتب|اكتب)\s+/, 'كتابة '], [/^(أحضر|احضر)\s+(اجتماع|الاجتماع)/, 'حضور $2'], [/^(أطبع|اطبع)\s+/, 'طباعة '],
];
const DATE_WORDS = '(?:النهارده|النهاردة|اليوم|بكرة|بكره|بكرا|غدًا|غدا|بعد بكرة|بعد بكره|بعد غد|الأحد|الاحد|الاثنين|الإثنين|الاتنين|الثلاثاء|التلات|الأربعاء|الاربعاء|الخميس|الجمعة|السبت|الأسبوع الجاي|الاسبوع الجاي|الأسبوع القادم|آخر الشهر|اخر الشهر|آخر الأسبوع|اخر الاسبوع|بعد أسبوع|بعد اسبوع|بعد يومين|today|tomorrow|next week)';
const DATE_RE = new RegExp('\\s*(?:قبل|يوم|في|بحلول|by|on)?\\s*' + DATE_WORDS + '(?=\\s|$|[،,.])', 'g');
const PRIO_RE = /\s*(عاجل(?:ة)?|ضروري|مهم جدًا|مهم جدا|urgent|asap)(?=\s|$|[،,.])/g;
const FU_SPLIT = /\s+و\s*(?=أتابع|اتابع|أكلم|اكلم|أسأل|اسأل|اسال|أتصل|اتصل|أذكّر|اذكر|أبلغ|ابلغ)/;
const WHY_RE = /(?:عشان|علشان|بخصوص|لأجل|لاجل|حول|عن موضوع|عن|about|regarding)\s+(.+)$/;
const WHAT_MAP = [[/^(يبعت|يرسل|يبعتلي|يرسلي|تبعت|ترسل|تبعتلي)\s*/, 'إرسال '], [/^(يرد|يردّ|ترد|تردّ)\s*(علي|عليّ)?\s*/, 'الرد '], [/^(يعتمد|تعتمد)\s*/, 'اعتماد '], [/^(يوافق|توافق)\s*(على)?\s*/, 'الموافقة على '], [/^(يسلم|يسلّم|تسلم|تسلّم)\s*/, 'تسليم '], [/^(يراجع|تراجع)\s*/, 'مراجعة '], [/^(يجهز|يجهّز|تجهز|تجهّز)\s*/, 'تجهيز ']];

function clean(s) { return s.replace(/\s+/g, ' ').replace(/^[\s،,.\-–—]+|[\s،,.\-–—]+$/g, '').trim(); }

function newNameCandidate(text, knownSpans) {
  // "مع خالد"، "من م. سارة"، "لفهد" → a name not yet registered
  const re = /(?:^|\s)(?:(?:مع|من|عند|with|from)\s+|لـ\s*|و?(?:أكلم|اكلم|أكلّم|أسأل|اسأل|اسال|أبلغ|ابلغ|أراسل|اراسل|أذكّر|اذكر|أتصل ب|اتصل ب|أتصل على|اتصل على)\s+)((?:(?:م|د|أ|ا)\.\s*)?[\p{L}]{2,}(?:\s+[\p{L}]{2,})?)/gu;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].indexOf(m[1]);
    if (knownSpans.some(h => start < h.e && start + m[1].length > h.s)) continue;
    const words = m[1].split(/\s+/);
    const keep = [];
    for (const w of words) { if (STOP.has(normAr(w)) || /^ال/.test(normAr(w)) && keep.length === 0 && !/^(?:م|د|أ|ا)\./.test(w)) break; keep.push(w); if (!/^(?:م|د|أ|ا)\.$/.test(w) && keep.length >= 2) break; }
    const name = clean(keep.join(' '));
    if (name && !STOP.has(normAr(name)) && normAr(name).length >= 2) return name;
  }
  return null;
}

/**
 * parseCapture(text, people, td) → draft
 * draft = { title, due, priority, person:{kind:'known',id}|{kind:'amb',ids,label}|{kind:'new',name}|null,
 *           fu:{what, due}|null, waiting:{what}|null, ask:bool }
 */
export function parseCapture(text, people, td = today()) {
  const raw = String(text || '').trim();
  const n = ' ' + normAr(raw) + ' ';
  const due = dueFrom(n, td);
  const priority = /(عاجل|ضروري|مهم\s+جدا|urgent|asap)/.test(n) ? 'hi' : /(مش\s+مستعجل|غير\s+مستعجل|لما\s+افضي|مش\s+ضروري|low priority)/.test(n) ? 'lo' : 'mid';

  const hits = findPeople(raw, people);
  let person = null;
  if (hits.length) {
    const h = hits[0];
    person = h.ids.length === 1 ? { kind: 'known', id: h.ids[0] } : { kind: 'amb', ids: h.ids, label: raw.slice(h.s, h.e) };
  } else {
    const nm = newNameCandidate(raw, hits);
    if (nm) person = { kind: 'new', name: nm };
  }

  const fuVerb = FU_VERB.test(n);
  const waitVerb = WAIT_VERB.test(n);

  // Title in clear standard Arabic
  let base = raw;
  if (person && person.kind === 'known' && hits.length) {
    const p = people.find(x => x.id === person.id);
    if (p) base = raw.slice(0, hits[0].s) + p.name + raw.slice(hits[0].e);
  }
  let s = base.replace(FILLER, '').replace(/\s*(?:و\s*)?(?:مستني|منتظر|بانتظار|في انتظار)\s+.*$/, '');
  const primaryFu = /^(أتابع|اتابع|أكلم|اكلم|أسأل|اسأل|اسال|أتصل|اتصل|أذكّر|اذكر|أبلغ|ابلغ)/.test(s);
  if (!primaryFu) s = s.split(FU_SPLIT)[0];
  s = s.replace(DATE_RE, ' ').replace(PRIO_RE, ' ');
  for (const [re, rep] of VERBS) { if (re.test(s)) { s = s.replace(re, rep); break; } }
  s = clean(s.replace(/\s+و$/, ''));
  if (!s) s = raw;

  // What we need from the person
  let what = '';
  const w = raw.match(WHY_RE);
  if (w) { what = clean(w[1].replace(DATE_RE, ' ').replace(PRIO_RE, ' ')); for (const [re, rep] of WHAT_MAP) if (re.test(what)) { what = clean(what.replace(re, rep)); break; } }

  let fu = null, waiting = null, ask = false;
  if (person && waitVerb) {
    const after = (n.split(WAIT_VERB)[2] || '');
    const ww = /^\s*(رد|الرد|reply)/.test(after) ? 'reply' : /(اعتماد|موافقه|approval|approve)/.test(after || n) ? 'approval' : /(قرار|decision)/.test(after || n) ? 'decision' : 'reply';
    waiting = { what: ww };
  }
  if (person && fuVerb) {
    let fdue = null;
    if (primaryFu) fdue = due;
    else if (due) fdue = diffDays(due, td) > 1 ? addWorkdays(due, -1) : due;
    fu = { what: what || (primaryFu ? '' : s), due: fdue };
    ask = !fdue;
  }
  return { title: s.slice(0, 300), due, priority, person, fu, waiting, ask };
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
