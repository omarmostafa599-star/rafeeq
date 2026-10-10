// رفيق — instant local parser for quick capture (Arabic dialects + English).
// Runs on-device in a few milliseconds; the AI step (phase 3) only refines its output.

/* ---------- dates ---------- */
export const pad = n => String(n).padStart(2, '0');
export const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ds(new Date());
export const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
export const diffDays = (a, b) => Math.round((pd(a) - pd(b)) / 86400000);
/* weekend days are a per-user setting (default Friday + Saturday) */
let WK = [5, 6];
export function setWeekend(days) { if (Array.isArray(days) && days.length && days.length <= 3 && days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) WK = [...new Set(days)].sort(); }
export const weekendDays = () => WK.slice();
/** First workday of the week (Sunday for Fri/Sat, Monday for Sat/Sun). */
export const weekStartDay = () => { for (let i = 1; i <= 7; i++) { const d = (Math.max(...WK) + i) % 7; if (!WK.includes(d)) return d; } return 0; };
/** Last workday of the week (Thursday for Fri/Sat, Friday for Sat/Sun). */
export const weekEndDay = () => { for (let i = 1; i <= 7; i++) { const d = (Math.min(...WK) - i + 7) % 7; if (!WK.includes(d)) return d; } return 4; };
export const isWeekend = s => WK.includes(pd(s).getDay());
export function addWorkdays(s, n) { let d = s; const step = n < 0 ? -1 : 1; let left = Math.abs(n); while (left > 0) { d = addDays(d, step); if (!isWeekend(d)) left--; } return d; }
export function nextWeekday(from, w) { let d = addDays(from, 1); while (pd(d).getDay() !== w) d = addDays(d, 1); return d; }
export const lastOfMonth = s => { const d = pd(s); return ds(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export function validDate(v) { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const d = pd(v); return isNaN(d) || ds(d) !== v ? null : v; }

/* ---------- names ---------- */
const MARKS = /[ً-ٰٟـ\u200B-\u200F]/g;
/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII; same length, so text spans stay valid. */
export const asciiDigits = s => String(s || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
export const normAr = s => asciiDigits(String(s || '').normalize('NFKC').replace(MARKS, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')).toLowerCase();
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
const PREP_RAW = /^(على|عل[ىي]ه|عليها|عليهم|عليك|عليكم)$/;
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
      if (L === 1 && PREP_RAW.test(toks[i].raw)) continue; // «على/عليه» normalise to the name «علي»
      if (/^[وفبلك]/.test(seq[0]) && seq[0].length > (L === 1 ? 4 : 3)) tries.push({ seq: [seq[0].slice(1), ...seq.slice(1)], off: 1 });
      for (const tr of tries) { const ids = map.get(tr.seq.join(' ')); if (ids) { hit = { L, ids: [...ids], s: toks[i].s + tr.off, e: toks[i + L - 1].e }; break; } }
    }
    if (hit) { hits.push(hit); i += hit.L; } else i++;
  }
  return hits;
}

/* ---------- vocabulary ---------- */
const STOP = new Set(['عشان', 'علشان', 'بخصوص', 'عن', 'على', 'في', 'من', 'مع', 'الى', 'الي', 'قبل', 'بعد', 'بكره', 'بكرا', 'غدا', 'اليوم', 'النهارده', 'الاحد', 'الاثنين', 'الاتنين', 'الثلاثاء', 'التلات', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت', 'و', 'لما', 'يرد', 'يبعت', 'يعتمد', 'يرسل', 'يوافق', 'ضروري', 'عاجل', 'الاسبوع', 'الجاي', 'القادم', 'اخر', 'الشهر', 'رد', 'اعتماد', 'موافقه', 'قرار', 'حول', 'لأجل', 'لاجل', 'about', 'regarding', 'to', 'for', 'tomorrow', 'today']);
// normalized stop-words (built once); «على» the preposition is checked on the raw word because it normalizes to the name «علي»
const STOPN = new Set([...STOP, 'بعدين', 'بعدها', 'كمان', 'برضه', 'برضو', 'ثم', 'اني', 'ان', 'انه', 'لو', 'اذا', 'يعني', 'خلال', 'حتى', 'لحد', 'غير', 'اول', 'فضلك', 'هنا', 'هناك', 'بعض', 'جديد', 'كل', 'نفس', 'and', 'then', 'the', 'a', 'an', 'my', 'our', 'no', 'all'].map(x => normAr(x)).filter(x => x !== 'علي'));
const VERBISH = /^(?:أ|ا)(?:راجع|تابع|كلم|كلّم|رسل|بعت|جهز|جهّز|عمل|زور|طلب|دقق|فحص|سلم|سلّم|حدث|حدّث|كتب|طبع|خلص|خلّص|نهي|رفع|سأل|سال|تصل|بلغ|ذكر|حضر|حضّر|عد|جهّز)/;
const isStop = w => STOPN.has(normAr(w)) || /^(على|عل[ىي]ه|عليها|نفسي)$/.test(w) || VERBISH.test(w);
const WEEKDAYS = [['الاحد', 'sunday'], ['الاثنين', 'الاتنين', 'monday'], ['الثلاثاء', 'التلات', 'tuesday'], ['الاربعاء', 'الاربع', 'wednesday'], ['الخميس', 'thursday'], ['الجمعه', 'friday'], ['السبت', 'saturday']];
const FU_VERB = /(^|\s)(و?اتابع|متابعه|و?اكلم|و?اتصل|و?اسال|و?اذكر|و?اراسل|و?ابلغ|و?ارجع ل|follow\s*up|call|ask|remind|ping)(\s|$)/;
const WAIT_VERB = /(مستني|منتظر|بانتظار|في انتظار|waiting)/;

const WB = (w) => new RegExp('(^|[^\\p{L}])(?:' + w + ')([^\\p{L}]|$)', 'u');
const RE_TODAY = WB('النهارده|اليوم|today'), RE_TOMORROW = WB('بكر[هةا]|غدا|tomorrow'), RE_AFTER_TOMORROW = /بعد\s*بكر[هةا]|بعد\s*غد|day after tomorrow/;
const MONTHS = [['يناير', 'jan'], ['فبراير', 'feb'], ['مارس', 'mar'], ['ابريل', 'apr'], ['مايو', 'may'], ['يونيو', 'يونيه', 'jun'], ['يوليو', 'يوليه', 'jul'], ['اغسطس', 'aug'], ['سبتمبر', 'sep'], ['اكتوبر', 'oct'], ['نوفمبر', 'nov'], ['ديسمبر', 'dec']];
const MONTH_RE = new RegExp('(?:^|[^\\d])(\\d{1,2})\\s*(?:من\\s+)?(?:شهر\\s+)?(' + MONTHS.flat().join('|') + ')[a-z]*(?:\\s+(\\d{4}))?(?![\\p{L}])', 'u');
/** The next date (today or later) whose day of month is `dom`, optionally in a given month. */
function dayOfMonth(td, dom, mon = null, year = null) {
  let y = year || +td.slice(0, 4), m = mon != null ? mon : +td.slice(5, 7) - 1;
  for (let k = 0; k < 13; k++) {
    const v = validDate(`${y}-${pad(m + 1)}-${pad(dom)}`);
    if (v && (v >= td || year)) return v;
    if (mon != null && !year) { y++; continue; } // «5 يناير» said in October → next January
    m++; if (m > 11) { m = 0; y++; }
  }
  return null;
}
function dueFrom(n, td) {
  // explicit dates first: «29 أكتوبر», «الأحد 18», «يوم 15» — a weekday name next to a number is just a label
  let mm = n.match(MONTH_RE);
  if (mm) { const mon = MONTHS.findIndex(a => a.includes(mm[2])); const v = dayOfMonth(td, +mm[1], mon, mm[3] ? +mm[3] : null); if (v) return v; }
  mm = n.match(/(?:^|[^\p{L}])(?:يوم\s+)?(?:ال)?(?:احد|اثنين|اتنين|ثلاثاء|تلات|اربعاء|اربع|خميس|جمعه|سبت)\s+(\d{1,2})(?![\d\/\-:])/u) || n.match(/(?:^|[^\p{L}])(?:يوم|بتاريخ)\s+(\d{1,2})(?![\d\/\-:]|\s*(?:يوم|ايام|ساع|دقيق))/u);
  if (mm && +mm[1] >= 1 && +mm[1] <= 31) { const v = dayOfMonth(td, +mm[1]); if (v) return v; }
  if (RE_AFTER_TOMORROW.test(n)) return addDays(td, 2);
  if (RE_TODAY.test(n)) return td;
  if (RE_TOMORROW.test(n)) return addDays(td, 1);
  let m = n.match(/بعد\s+(\d+)\s*(يوم|ايام)|in\s+(\d+)\s+days?/); if (m) return addDays(td, +(m[1] || m[3]));
  if (/بعد\s+يومين/.test(n)) return addDays(td, 2);
  if (/بعد\s+(اسبوعين)/.test(n)) return addDays(td, 14);
  if (/بعد\s+(اسبوع)|in a week/.test(n) && !/الاسبوع\s+(الجاي|القادم)/.test(n)) return addDays(td, 7);
  if (/(اخر|نهايه)\s+(?:يوم\s+)?(?:في\s+|من\s+)?الشهر|end of (the )?month/.test(n)) { const d = pd(td), lw = lastWorkdayOf(d.getFullYear(), d.getMonth()); return lw >= td ? lw : lastOfMonth(td); } // the last WORKDAY
  if (/(اخر|نهايه)\s+الاسبوع|end of (the )?week/.test(n)) return pd(td).getDay() === weekEndDay() ? td : nextWeekday(td, weekEndDay());
  const nextWeek = /الاسبوع\s+(الجاي|القادم|اللي\s+جاي)|next week/.test(n);
  let wd = -1;
  for (let i = 0; i < WEEKDAYS.length && wd < 0; i++) for (const w of WEEKDAYS[i]) if (new RegExp('(^|[^\\p{L}])(يوم\\s+)?' + w + '([^\\p{L}]|$)', 'u').test(n)) { wd = i; break; }
  if (nextWeek) { const start = nextWeekday(td, weekStartDay()); if (wd < 0) return start; let d = start; for (let i = 0; i < 7 && pd(d).getDay() !== wd; i++) d = addDays(d, 1); return d; }
  if (wd >= 0) return nextWeekday(td, wd);
  m = n.match(/(^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/) || n.match(/(^|[^\d])(\d{1,2})-(\d{1,2})-(\d{2,4})(?!\d)/);
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
const MONTH_WORDS = '(?:\\d{1,2}\\s*(?:من\\s+)?(?:يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يونيه|يوليو|يوليه|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)(?:\\s+\\d{4})?)';
const DATE_RE = new RegExp('(^|[^\\p{L}])(?:(?:قبل|يوم|في|بحلول|by|on)\\s+)?' + DATE_WORDS + '(?=\\s|$|[،,.])', 'gu');
const DATE_RE2 = new RegExp('(^|[^\\p{L}])(?:(?:قبل|يوم|في|بحلول)\\s+)?' + MONTH_WORDS + '(?=\\s|$|[،,.])', 'gu');
const PRIO_RE = /\s*(?:(?:مش|غير|مو)\s+)?(عاجل(?:ة)?(?:\s+جد(?:ًا|ا|اً))?|ضروري(?:ة)?(?:\s+جد(?:ًا|ا|اً))?|مستعجل(?:ة)?|مهم(?:ة)?\s+جد(?:ًا|ا|اً)|urgent|asap|not urgent|low priority)(?=\s|$|[،,.])/g;
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
  const re = /(?:^|\s)(?:(?:مع|من|عند|with|from)\s+|لـ\s*|و?(?:أتصل|اتصل)\s+ب(?=[\p{L}])|و?(?:أكلم|اكلم|أكلّم|أسأل|اسأل|اسال|أبلغ|ابلغ|أراسل|اراسل|أذكّر|اذكر|أتصل ب|اتصل ب|أتصل على|اتصل على)\s+)((?:(?:م|د|أ|ا)\.\s*)?[\p{L}]{2,}(?:\s+[\p{L}]{2,})?)/gu;
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
    for (const w of words) { if (isStop(w) || (!keep.length && /^ال/.test(normAr(w)) && !/^(?:م|د|أ|ا)\./.test(w)) || (keep.length && /^و/.test(w))) break; keep.push(w); if (!/^(?:م|د|أ|ا)\.$/.test(w) && keep.length >= 2) break; }
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
  const raw = asciiDigits(String(text || '').trim());
  const n = ' ' + normAr(raw) + ' ';
  const due = dueFrom(n, td);
  const priority = /((مش|غير|مو)\s+(مستعجل|عاجل|ضروري)|لما\s+افضي|low priority|not urgent)/.test(n) ? 'lo' : /(عاجل|ضروري|مهم\s+جدا|urgent|asap)/.test(n) ? 'hi' : 'mid';

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
  const tm = timeFrom(raw), rc = recurFrom(raw, due || td);
  if (tm?.span) base = base.replace(tm.span, ' ');
  if (rc?.span) base = base.replace(rc.span, ' ');
  base = base.replace(/\s*(?:من نفسي|مبادرة مني|مبادره مني|تكليف ذاتي)\s*/g, ' ').trim();
  let s = base.replace(FILLER, '').replace(/\s*(?:و\s*)?(?:مستني|منتظر|بانتظار|في انتظار)\s+.*$/, '');
  const primaryFu = /^(أتابع|اتابع|أكلم|اكلم|أسأل|اسأل|اسال|أتصل|اتصل|أذكّر|اذكر|أبلغ|ابلغ)/.test(s);
  if (!primaryFu) s = s.split(FU_SPLIT)[0];
  s = s.replace(DATE_RE2, '$1 ').replace(DATE_RE, '$1 ').replace(PRIO_RE, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of VERBS) { if (re.test(s)) { s = s.replace(re, rep); break; } }
  s = clean(s.replace(/\s+و$/, ''));
  if (!s) s = raw;

  // What we need from the person
  let what = '';
  const w = raw.match(WHY_RE);
  if (w) { what = clean(w[1].replace(DATE_RE, '$1 ').replace(PRIO_RE, ' ')); for (const [re, rep] of WHAT_MAP) if (re.test(what)) { what = clean(what.replace(re, rep)); break; } }

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
  const due2 = rc ? (due && rc.recur.f !== 'weekly' ? due : recurNext(rc.recur, addDays(td, -1))) : due;
  return { title: s.slice(0, 300), due: due2, dueWeekend: !!(due2 && isWeekend(due2)), priority, person, more: person ? more.slice(0, 5) : [], fu, waiting, ask, source, time: tm?.time || null, recur: rc?.recur || null };
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
  for (const [nm, w] of days) if (n.includes(' ' + nm) || n.includes(' يوم ' + nm)) { let d = td; if (/(اللي فات|الماضي|last)/.test(n)) d = addDays(d, -1); while (pd(d).getDay() !== w) d = addDays(d, -1); return d; }
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
      words.forEach((w, i) => { if (i > 0 && pastVerb(w) && !/^(اللي|التي|الذي|لما|ما|بعدما|قبلما)$/.test(normAr(words[i - 1])) && cur.some(x => !LOG_FILL.has(normAr(x)))) flush(); cur.push(w); });
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

/* ---------- time of day: "الساعة 10" · "10:30" · "3 العصر" · "at 3pm" ---------- */
const T_AM = /^(الصبح|صباحا|صباحًا|الصباح|صباحاً|am|a\.m\.?)$/i, T_PM = /^(العصر|بعد الضهر|بعد الظهر|الضهر|الظهر|المغرب|العشا|العشاء|مساء|مساءً|مساءا|بالليل|الليل|pm|p\.m\.?)$/i;
const TIME_RE = /(?:(?:ال)?ساع[ةه]\s*|at\s+)?(\d{1,2})(?:([:٫.])(\d{2}))?\s*(و\s*نص|و\s*ربع|[إا]لا\s*ربع)?\s*(الصبح|صباحًا|صباحاً|صباحا|الصباح|العصر|بعد الضهر|بعد الظهر|الضهر|الظهر|المغرب|العشاء|العشا|مساءً|مساءا|مساء|بالليل|الليل|a\.?m\.?|p\.?m\.?)?(?=[\s،,.]|$)/gi;
export function timeFrom(raw) {
  const text = asciiDigits(raw);
  for (const m of text.matchAll(TIME_RE)) {
    const prefixed = /^(?:(?:ال)?ساع|at\s)/i.test(m[0].trim()), q = m[5];
    const colon = m[3] != null && (m[2] !== '.' || prefixed || !!q); // «10.30» only counts as a time next to «الساعة» or a qualifier (else it may be a date)
    if (!prefixed && !colon && !q) continue;
    let h = +m[1], mi = colon ? +m[3] : 0;
    if (h > 23 || mi > 59) continue;
    const qn = q ? q.replace(/\s+/g, ' ') : '';
    if (m[4]) { if (/نص/.test(m[4])) mi = 30; else if (/لا/.test(m[4])) mi = 45; else mi = 15; }
    if (h <= 12) {
      if (qn && T_AM.test(qn)) { if (h === 12) h = 0; }
      else if (qn && T_PM.test(qn)) { if (h === 12 && /ليل/.test(qn)) h = 0; else if (h < 12) h += 12; }
      else if (h >= 1 && h <= 6) h += 12;
    }
    if (m[4] && /لا/.test(m[4])) h -= 1; // «إلا ربع» after the AM/PM mapping: «1 إلا ربع» = 12:45
    if (h < 0) h += 24;
    return { time: `${pad(h)}:${pad(mi)}`, span: m[0].trim() };
  }
  return null;
}

/* ---------- recurrence: "كل أحد" · "كل يوم" · "كل شهر يوم 25" · "آخر كل شهر" · "كل 3 شهور" ---------- */
const DAY_RAW = [['الأحد', 'الاحد', 'احد', 'أحد', 'sunday'], ['الاثنين', 'الإثنين', 'الاتنين', 'اتنين', 'اثنين', 'إثنين', 'monday'], ['الثلاثاء', 'التلات', 'التلاتاء', 'ثلاثاء', 'tuesday'], ['الأربعاء', 'الاربعاء', 'الاربع', 'أربعاء', 'اربعاء', 'wednesday'], ['الخميس', 'خميس', 'thursday'], ['الجمعة', 'الجمعه', 'جمعة', 'جمعه', 'friday'], ['السبت', 'سبت', 'saturday']];
const DAY_ALT = DAY_RAW.flat().sort((a, b) => b.length - a.length).join('|');
const DAY_B = `(?:${DAY_ALT})(?![\\p{L}])`; // a day name must end at a word boundary («كل تلاتة أيام» is not Tuesday)
const dayIdx = w => { const n = normAr(w); return DAY_RAW.findIndex(v => v.some(x => normAr(x) === n)); };
export function recurFrom(raw, base = today()) {
  const t = asciiDigits(raw);
  let m = t.match(new RegExp(`(?:كل|every)\\s+(?:يوم\\s+)?(${DAY_B}(?:\\s*(?:و|،|,|and)\\s*(?:يوم\\s+)?${DAY_B})*)`, 'iu'));
  if (m) { const days = [...m[1].matchAll(new RegExp(DAY_B, 'giu'))].map(x => dayIdx(x[0])).filter(i => i >= 0); if (days.length) return { recur: { f: 'weekly', days: [...new Set(days)].sort() }, span: m[0] }; }
  m = t.match(/(?:في\s+)?(?:آخر|اخر|نهاية|نهايه)\s+(?:يوم\s+)?(?:في\s+|من\s+)?كل\s+شهر|كل\s+(?:آخر|اخر)\s+(?:يوم\s+(?:في\s+|من\s+)?(?:ال)?)?شهر|end of every month|last (?:work)?day of (?:every|each) month/i);
  if (m) return { recur: { f: 'monthly', dom: 'last' }, span: m[0] };
  m = t.match(/كل\s+(?:3|تلات|ثلاث|ثلاثة|تلاتة|تلاته|ثلاثه)\s+(?:شهور|أشهر|اشهر)|ربع\s+سنوي(?:ًا|ا)?|كل\s+ربع(?:\s+سن[ةه])?|quarterly|every quarter/i);
  if (m) { const d = t.match(/يوم\s+(\d{1,2})(?!\d)/); return { recur: { f: 'quarterly', dom: d ? Math.min(31, +d[1]) : pd(base).getDate() }, span: m[0] }; }
  m = t.match(/كل\s+شهر\s+(?:يوم|في)?\s*(\d{1,2})(?!\d)|(?:يوم|في)\s+(\d{1,2})\s+(?:من\s+)?كل\s+شهر|every month on (?:the )?(\d{1,2})|كل\s+يوم\s+(\d{1,2})(?!\d)/i);
  if (m) return { recur: { f: 'monthly', dom: Math.max(1, Math.min(31, +(m[1] || m[2] || m[3] || m[4]))) }, span: m[0] };
  m = t.match(/كل\s+شهر|شهري(?:ًا|ا|اً)|monthly|every month/i);
  if (m) return { recur: { f: 'monthly', dom: pd(base).getDate() }, span: m[0] };
  m = t.match(/كل\s+(?:أسبوع|اسبوع)(?![\p{L}])|أسبوعي(?:ًا|ا|اً)|اسبوعي(?:ًا|ا|اً)|weekly|every week/iu);
  if (m) return { recur: { f: 'weekly', days: [pd(shiftWork(base)).getDay()] }, span: m[0] };
  m = t.match(/كل\s+يوم(?:\s+عمل)?|يومي(?:ًا|ا|اً)|every\s+(?:work\s*)?day|daily/i);
  if (m) return { recur: { f: 'daily' }, span: m[0] };
  return null;
}
const shiftWork = d => { let x = d; for (let i = 0; i < 7 && isWeekend(x); i++) x = addDays(x, 1); return x; };
const lastWorkdayOf = (y, m) => { let d = ds(new Date(y, m + 1, 0)); for (let i = 0; i < 7 && isWeekend(d); i++) d = addDays(d, -1); return d; };
const monthDay = (y, m, dom) => dom === 'last' ? lastWorkdayOf(y, m) : shiftWork(ds(new Date(y, m, Math.min(+dom || 1, new Date(y, m + 1, 0).getDate()))));
/** Next occurrence strictly after `from`. Weekend dates move forward to the next workday. */
export function recurNext(r, from) {
  if (!r || !validDate(from)) return null;
  if (r.f === 'daily') return addWorkdays(from, 1);
  if (r.f === 'weekly') {
    const days = Array.isArray(r.days) && r.days.length ? r.days : [pd(from).getDay()];
    let d = addDays(from, 1); for (let i = 0; i < 7; i++) { if (days.includes(pd(d).getDay())) return shiftWork(d); d = addDays(d, 1); } return null;
  }
  const step = r.f === 'quarterly' ? 3 : 1, f = pd(from), dom = r.dom ?? f.getDate();
  let y = f.getFullYear(), m = f.getMonth();
  if (monthDay(y, m - 1, dom) === from) m -= 1; // `from` is last month's occurrence moved past a weekend: anchor there, not on the shifted month
  const rawDay = (yy, mm) => dom === 'last' ? lastWorkdayOf(yy, mm) : ds(new Date(yy, mm, Math.min(+dom || 1, new Date(yy, mm + 1, 0).getDate())));
  if (rawDay(y, m) > from) return monthDay(y, m, dom); // later this month (compare before the weekend shift so a kept weekend date is not repeated 2 days later)
  for (let k = step; k <= 36; k += step) { const c = monthDay(y, m + k, dom); if (c > from) return c; }
  return null;
}
/** Normalise a recurrence object (from the AI or the form). */
export function cleanRecur(r) {
  if (!r || typeof r !== 'object') return null;
  const f = ['daily', 'weekly', 'monthly', 'quarterly'].includes(r.f || r.freq) ? (r.f || r.freq) : null; if (!f) return null;
  if (f === 'daily') return { f };
  if (f === 'weekly') { const days = (Array.isArray(r.days) ? r.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6); return { f, days: days.length ? [...new Set(days)].sort() : [] }; }
  const dom = r.dom === 'last' || r.last ? 'last' : Math.max(1, Math.min(31, parseInt(r.dom, 10) || 1));
  return { f, dom };
}
