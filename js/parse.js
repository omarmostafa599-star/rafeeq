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
// normalized stop-words (built once); «على» the preposition is checked on the raw word because it normalizes to the name «علي»
const STOPN = new Set([...STOP, 'بعدين', 'بعدها', 'كمان', 'برضه', 'برضو', 'ثم', 'اني', 'ان', 'انه', 'لو', 'اذا', 'يعني', 'خلال', 'حتى', 'لحد', 'and', 'then'].map(x => normAr(x)).filter(x => x !== 'علي'));
const VERBISH = /^(?:أ|ا)(?:راجع|تابع|كلم|كلّم|رسل|بعت|جهز|جهّز|عمل|زور|طلب|دقق|فحص|سلم|سلّم|حدث|حدّث|كتب|طبع|خلص|خلّص|نهي|رفع|سأل|سال|تصل|بلغ|ذكر|حضر|حضّر|عد|جهّز)/;
const isStop = w => STOPN.has(normAr(w)) || /^(على|عل[ىي]ه|عليها|نفسي)$/.test(w) || VERBISH.test(w);
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
const PRIO_RE = /\s*(عاجل(?:ة)?(?:\s+جد(?:ًا|ا|اً))?|ضروري(?:\s+جد(?:ًا|ا|اً))?|مهم(?:ة)?\s+جد(?:ًا|ا|اً)|urgent|asap)(?=\s|$|[،,.])/g;
const FU_SPLIT = /\s+و\s*(?=أتابع|اتابع|أكلم|اكلم|أسأل|اسأل|اسال|أتصل|اتصل|أذكّر|اذكر|أبلغ|ابلغ)/;
const WHY_RE = /(?:عشان|علشان|بخصوص|لأجل|لاجل|حول|عن موضوع|عن|about|regarding)\s+(.+)$/;
const WHAT_MAP = [[/^(يبعت|يرسل|يبعتلي|يرسلي|تبعت|ترسل|تبعتلي)\s*/, 'إرسال '], [/^(يرد|يردّ|ترد|تردّ)\s*(علي|عليّ)?\s*/, 'الرد '], [/^(يعتمد|تعتمد)\s*/, 'اعتماد '], [/^(يوافق|توافق)\s*(على)?\s*/, 'الموافقة على '], [/^(يسلم|يسلّم|تسلم|تسلّم)\s*/, 'تسليم '], [/^(يراجع|تراجع)\s*/, 'مراجعة '], [/^(يجهز|يجهّز|تجهز|تجهّز)\s*/, 'تجهيز ']];

function clean(s) { return s.replace(/\s+/g, ' ').replace(/^[\s،,.\-–—]+|[\s،,.\-–—]+$/g, '').trim(); }

// job descriptors that precede a name: «رئيس قسم العطور محمد عباس» → name «محمد عباس», desc «رئيس قسم العطور»
const ROLE_W = new Set(['رئيس', 'مدير', 'مديره', 'مشرف', 'مشرفه', 'مسؤول', 'مسئول', 'مسؤوله', 'منسق', 'منسقه', 'اخصائي', 'اخصائيه', 'موظف', 'موظفه', 'مندوب', 'نائب', 'محاسب', 'امين', 'قائد', 'كبير'].map(normAr));
const UNIT_W = new Set(['قسم', 'اداره', 'شعبه', 'وحده', 'فريق', 'مكتب', 'فرع', 'مصنع', 'مستودع', 'معرض'].map(normAr));
const isRoleWord = w => ROLE_W.has(normAr(w).replace(/^ال/, ''));
function descName(words) {
  // words start right after the preposition; returns { name, desc, generic } or null
  if (!words.length || !isRoleWord(words[0])) return null;
  const desc = [words[0]]; let i = 1;
  while (i < words.length && i < 6 && (/^ال/.test(normAr(words[i])) || UNIT_W.has(normAr(words[i])))) { if (isStop(words[i])) break; desc.push(words[i]); i++; }
  const name = [];
  while (i < words.length && name.length < 2 && !isStop(words[i]) && !/^ال/.test(normAr(words[i])) && /^[\p{L}.]{2,}$/u.test(words[i])) { name.push(words[i]); i++; }
  const d = clean(desc.join(' '));
  return name.length ? { name: clean(name.join(' ')), desc: d, generic: false } : { name: d, desc: d, generic: true };
}
function newNameCandidate(text, knownSpans) {
  // "مع خالد"، "من م. سارة"، "لفهد" → a name not yet registered
  const re = /(?:^|\s)(?:(?:مع|من|عند|with|from)\s+|لـ\s*|و?(?:أكلم|اكلم|أكلّم|أسأل|اسأل|اسال|أبلغ|ابلغ|أراسل|اراسل|أذكّر|اذكر|أتصل ب|اتصل ب|أتصل على|اتصل على)\s+)((?:(?:م|د|أ|ا)\.\s*)?[\p{L}]{2,}(?:\s+[\p{L}]{2,})?)/gu;
  let m;
  const roleRe = /(?:^|\s)(?:مع|من|عند|لـ?|with|from)\s*((?:ال)?(?:رئيس|مدير|مديرة|مشرف|مشرفة|مسؤول|مسئول|منسق|منسقة|أخصائي|اخصائي|موظف|مندوب|نائب|محاسب|أمين|امين)(?:\s+[\p{L}]+){0,6})/gu;
  let rm;
  while ((rm = roleRe.exec(text))) {
    const start = rm.index + rm[0].indexOf(rm[1]);
    if (knownSpans.some(h => start < h.e && start + rm[1].length > h.s)) continue;
    const dn = descName(rm[1].split(/\s+/)); if (dn) return dn;
  }
  while ((m = re.exec(text))) {
    const start = m.index + m[0].indexOf(m[1]);
    if (knownSpans.some(h => start < h.e && start + m[1].length > h.s)) continue;
    const words = m[1].split(/\s+/);
    const keep = [];
    for (const w of words) { if (isStop(w) || /^ال/.test(normAr(w)) && keep.length === 0 && !/^(?:م|د|أ|ا)\./.test(w) || (keep.length && /^و[\p{L}]{3,}/u.test(w))) break; keep.push(w); if (!/^(?:م|د|أ|ا)\.$/.test(w) && keep.length >= 2) break; }
    const name = clean(keep.join(' '));
    if (name && !isStop(name) && normAr(name).length >= 2) return { name, desc: '', generic: false };
  }
  return null;
}
/** Who assigned the task, if said: «طلب مني م. مأمون», «بتكليف من المدير», «من نفسي». */
export function sourceFrom(raw) {
  const n = normAr(raw);
  if (/(من نفسي|مبادره مني|مبادرة مني|تكليف ذاتي|self[- ]?initiated)/.test(n)) return { self: true };
  const m = raw.match(/(?:طلب(?:ها|ه)?\s+مني|طلبت\s+مني|كلفني|كلّفني|بتكليف\s+من|بطلب\s+من|بناء\s+على\s+طلب|assigned by|requested by)\s+((?:(?:م|د|أ|ا)\.\s*)?[\p{L}]{2,}(?:\s+[\p{L}]{2,})?)/u);
  if (!m) return null;
  const words = m[1].split(/\s+/); const keep = [];
  for (const w of words) { if (isStop(w)) break; keep.push(w); }
  const name = clean(keep.join(' '));
  return name ? { name, span: m[0].slice(0, m[0].indexOf(m[1])) + name } : null;
}
/** Offline split of several tasks: one per line, or numbered «1) … 2) …». */
export function splitTasks(text) {
  const t = String(text || '').trim(); if (!t) return [];
  let parts = t.split(/\n+/);
  if (parts.length === 1) parts = t.split(/(?:^|\s)(?:[1-9١-٩]|10|١٠)\s*[-.)\u066b:]\s+/).filter(Boolean);
  return parts.map(x => x.replace(/^\s*(?:[-•*]|[1-9١-٩][.)-])\s*/, '').trim()).filter(x => x.length > 2).slice(0, 10);
}

/** Extra people joined with «و» right after a span: "مع خالد وسارة وم. فهد" → ['سارة', 'م. فهد'] (new names only). */
function andNames(text, from, knownSpans) {
  const out = []; let rest = text.slice(from);
  const re = /^\s*(?:،|,)?\s*و\s*((?:(?:م|د|أ|ا)\.\s*)?[\p{L}]{2,}(?:\s+[\p{L}]{2,})?)/u;
  for (let guard = 0; guard < 6; guard++) {
    const m = rest.match(re); if (!m) break;
    const words = m[1].split(/\s+/); const keep = [];
    for (const w of words) { if (isStop(w) || (keep.length && /^و[\p{L}]{3,}/u.test(w))) break; keep.push(w); if (!/^(?:م|د|أ|ا)\.$/.test(w) && keep.length >= 2) break; }
    const name = clean(keep.join(' '));
    const at = text.length - rest.length + m[0].indexOf(m[1]);
    if (!name || isStop(name) || /^(?:أ|ا)[\p{L}]+(?:ه|ها|هم)$/u.test(name) || knownSpans.some(h => at < h.e && at + name.length > h.s)) break;
    out.push(name); rest = rest.slice(m[0].indexOf(m[1]) + name.length);
  }
  return out;
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
  const refOf = h => h.ids.length === 1 ? { kind: 'known', id: h.ids[0] } : { kind: 'amb', ids: h.ids, label: raw.slice(h.s, h.e) };
  let person = null; const more = [];
  if (hits.length) {
    person = refOf(hits[0]);
    hits.slice(1).forEach(h => { const r = refOf(h); if (!(r.kind === 'known' && person.kind === 'known' && r.id === person.id) && !more.some(x => x.kind === 'known' && r.kind === 'known' && x.id === r.id)) more.push(r); });
    andNames(raw, hits[hits.length - 1].e, hits).forEach(n => more.push({ kind: 'new', name: n }));
  } else {
    const nm = newNameCandidate(raw, hits);
    if (nm) { person = { kind: 'new', name: nm.name, desc: nm.desc, generic: nm.generic }; const at = raw.indexOf(nm.name); if (at >= 0 && !nm.generic) andNames(raw, at + nm.name.length, hits).forEach(n => more.push({ kind: 'new', name: n })); }
  }
  const source = sourceFrom(raw);
  if (source && !source.self && person && person.kind === 'new' && normAr(person.name) === normAr(source.name)) { person = more.shift() || null; }

  const fuVerb = FU_VERB.test(n);
  const waitVerb = WAIT_VERB.test(n);

  // Title in clear standard Arabic
  let base = raw;
  if (person && person.kind === 'known' && hits.length) {
    const p = people.find(x => x.id === person.id);
    if (p) base = raw.slice(0, hits[0].s) + p.name + raw.slice(hits[0].e);
  }
  const src0 = sourceFrom(raw);
  if (src0?.span) base = base.replace(src0.span, ' ');
  base = base.replace(/\s*(?:من نفسي|مبادرة مني|مبادره مني|تكليف ذاتي)\s*/g, ' ').trim();
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
    fu = { what: what || '', due: fdue };
    ask = !fdue;
  }
  return { title: s.slice(0, 300), due, dueWeekend: !!(due && isWeekend(due)), priority, person, more: person ? more.slice(0, 5) : [], fu, waiting, ask, source };
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- work log: things already done ("النهارده عملت كذا وكذا") ---------- */
const PAST_RAW = {
  'عملت': '', 'عملنا': '', 'سويت': '', 'خلصت': 'إنهاء', 'خلصنا': 'إنهاء', 'انهيت': 'إنهاء', 'انجزت': 'إنجاز', 'زرت': 'زيارة', 'زرنا': 'زيارة',
  'راجعت': 'مراجعة', 'حضرت': 'حضور', 'سلمت': 'تسليم', 'بعت': 'إرسال', 'ارسلت': 'إرسال', 'قابلت': 'مقابلة', 'فحصت': 'فحص', 'اتصلت': 'اتصال',
  'كلمت': 'التواصل مع', 'جهزت': 'تجهيز', 'رفعت': 'رفع', 'دققت': 'تدقيق', 'اعتمدت': 'اعتماد', 'قفلت': 'إغلاق', 'اجتمعت': 'اجتماع', 'قعدت': 'اجتماع',
  'شاركت': 'المشاركة في', 'ساعدت': 'مساعدة', 'تابعت': 'متابعة', 'جمعت': 'جمع', 'صورت': 'تصوير', 'كتبت': 'كتابة', 'حدثت': 'تحديث', 'نظمت': 'تنظيم',
  'دربت': 'تدريب', 'استلمت': 'استلام', 'سحبت': 'سحب', 'طبعت': 'طباعة', 'عدلت': 'تعديل', 'اعدت': 'إعداد', 'اعددت': 'إعداد', 'ناقشت': 'مناقشة',
  'نسقت': 'تنسيق', 'حليت': 'حل', 'صلحت': 'إصلاح', 'وزعت': 'توزيع', 'لفيت': 'جولة على', 'عرضت': 'عرض', 'شرحت': 'شرح', 'رتبت': 'ترتيب', 'فتحت': 'فتح',
  'did': '', 'finished': 'Finished', 'completed': 'Completed', 'visited': 'Visited', 'reviewed': 'Reviewed', 'sent': 'Sent', 'met': 'Met', 'checked': 'Checked', 'inspected': 'Inspected',
};
const PAST = new Map(Object.entries(PAST_RAW).map(([k, v]) => [normAr(k), v]));
const LOG_FILL = new Set(['النهارده', 'النهاردة', 'النهاردا', 'اليوم', 'امبارح', 'امس', 'البارحه', 'الصبح', 'الصباح', 'انا', 'كمان', 'برضو', 'وكمان', 'today', 'yesterday', 'i', 'also', 'and', 'و', 'ثم', 'وبعدين', 'بعدين', 'اول']);
const pastVerb = w => { const n = normAr(w); if (PAST.has(n)) return n; if (n.length > 3 && n[0] === 'و' && PAST.has(n.slice(1))) return n.slice(1); return null; };
/** True when the message reports work already done rather than work to do. */
export function isLogText(text) {
  const n = normAr(text).replace(/[^\p{L}\p{N}\s\n]/gu, ' ');
  if (/(^|\s)(ايه|ايش|مين|كام|هات|اعرض|what|which|how many)(\s|$)|[?؟]/.test(normAr(text))) return false;
  if (/(اللي عملته|اللي انجزته|انجازاتي|سجل انجاز|سجل اني|i did today|today i did)/.test(n)) return true;
  const starts = p => { const w = normAr(p).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean); let i = 0; while (i < w.length && i < 4 && LOG_FILL.has(w[i])) i++; return !!(w[i] && pastVerb(w[i])); };
  const pieces = splitTasks(text);
  return pieces.length > 1 ? pieces.filter(starts).length * 2 >= pieces.length : starts(text);
}
/** Date a log message refers to: today, yesterday, or the latest past weekday named. */
export function logDate(text, td = today()) {
  const n = ' ' + normAr(text) + ' ';
  if (/\sاول (امبارح|امس)\s/.test(n)) return addDays(td, -2);
  if (/\s(امبارح|امس|البارحه|yesterday)\s/.test(n)) return addDays(td, -1);
  const days = [['الاحد', 0], ['الاتنين', 1], ['الاثنين', 1], ['التلات', 2], ['الثلاثاء', 2], ['الاربع', 3], ['الاربعاء', 3], ['الخميس', 4], ['الجمعه', 5], ['السبت', 6]];
  for (const [nm, w] of days) if (n.includes(' ' + nm) || n.includes(' يوم ' + nm)) { let d = td; if (/(اللي فات|الماضي|last)/.test(n) || pd(d).getDay() === w) d = addDays(d, -1); while (pd(d).getDay() !== w) d = addDays(d, -1); return d; }
  return td;
}
/** "النهارده زرت معرض الملقا وفحصت شحنة العود" → [{title:'زيارة معرض الملقا'}, {title:'فحص شحنة العود'}] */
export function splitLogs(text) {
  const pieces = splitTasks(text);
  const out = [];
  for (const piece of (pieces.length ? pieces : [text])) {
    for (const part of piece.split(/\s*[،,؛;]\s*/)) {
      const words = part.trim().split(/\s+/).filter(Boolean); let cur = [];
      const flush = () => { const t = logTitle(cur); if (t) out.push({ title: t }); cur = []; };
      words.forEach((w, i) => { if (i > 0 && pastVerb(w) && cur.some(x => !LOG_FILL.has(normAr(x)))) flush(); cur.push(w); });
      flush();
    }
  }
  return out.slice(0, 10);
}
function logTitle(words) {
  let w = words.filter(x => !/^(النهارده|النهاردة|اليوم|امبارح|أمس|امس|الصبح|today|yesterday)$/.test(normAr(x)));
  while (w.length && LOG_FILL.has(normAr(w[0]))) w.shift();
  if (w[0] && /^(اول)$/.test(normAr(w[0]))) w.shift();
  if (!w.length) return '';
  const v = pastVerb(w[0]);
  if (v != null) { const m = PAST.get(v); w = m ? [m, ...w.slice(1)] : w.slice(1); }
  while (w.length && LOG_FILL.has(normAr(w[w.length - 1]))) w.pop();
  while (w.length && /^(ب?يوم|ال(احد|اتنين|اثنين|تلات|ثلاثاء|اربع|اربعاء|خميس|جمعه|سبت)|اللي|فات)$/.test(normAr(w[w.length - 1]))) w.pop();
  const s = w.join(' ').replace(/\s+/g, ' ').trim();
  return s.length > 2 ? s.slice(0, 300) : '';
}
