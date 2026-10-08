// رفيق — monthly report renderer. One source for: presentation mode, the read-only share page and the A4 PDF.
// Input is a self-contained snapshot (no live data, no personal notes).
import { DICT } from './i18n.js';

const tr = (lang, k, v) => { let s = (DICT[lang] || DICT.ar)[k] ?? DICT.ar[k] ?? k; if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loc = lang => lang === 'en' ? 'en-GB' : 'ar-u-ca-gregory-nu-latn';
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = (lang, s, o = { day: 'numeric', month: 'short' }) => s ? new Intl.DateTimeFormat(loc(lang), o).format(pd(s)) : '';
export const monthName = (lang, ym) => new Intl.DateTimeFormat(loc(lang), { month: 'long', year: 'numeric' }).format(pd(ym + '-01'));

const KIND = { pdf: 'PDF', img: 'IMG', sheet: 'XLS', doc: 'DOC', slides: 'PPT' };
const fileChip = f => `<span class="rp-file k-${esc(f.kind)}"><b>${KIND[f.kind] || 'FILE'}</b><span dir="auto">${esc(f.name)}</span></span>`;

/** snapshot → HTML string. mode: 'screen' | 'print' */
export function reportHTML(s, { mode = 'screen' } = {}) {
  const lang = s.lang === 'en' ? 'en' : 'ar';
  const t = (k, v) => tr(lang, k, v);
  const k = s.kpis || {};
  const rate = k.onTimeRate == null ? '—' : Math.round(k.onTimeRate * 100) + '%';
  const maxP = Math.max(1, ...(s.byProject || []).map(p => p.n));
  const doneItems = (s.items || []).filter(x => x.kind === 'done');
  const openItems = (s.items || []).filter(x => x.kind === 'open');
  const logItems = (s.items || []).filter(x => x.kind === 'log');
  const item = x => `<article class="rp-item">
      <div class="rp-item-h"><h4 dir="auto">${esc(x.title)}</h4>${x.kind === 'done' ? (x.onTime ? `<span class="rp-tag ok">${t('rpOnTime')}</span>` : '') : x.priority === 'hi' ? `<span class="rp-tag hi">${t('prioHi')}</span>` : ''}</div>
      <div class="rp-meta">${x.project ? `<span class="rp-proj" dir="auto">${esc(x.project)}</span>` : ''}${x.kind !== 'open' ? `<span>${t('rpDoneOn', { d: fmtD(lang, x.completed_on) })}</span>` : `${x.status ? `<span>${esc(t(x.status))}</span>` : ''}${x.due ? `<span>${t('rpDue', { d: fmtD(lang, x.due) })}</span>` : ''}`}</div>
      ${x.steps_total ? `<div class="rp-prog"><i style="width:${Math.round(100 * x.steps_done / x.steps_total)}%"></i></div><div class="rp-meta"><span>${t('stepsOf', { a: x.steps_done, b: x.steps_total })}</span></div>` : ''}
      ${x.details ? `<p class="rp-txt" dir="auto">${esc(x.details)}</p>` : ''}
      ${x.result ? `<p class="rp-res" dir="auto"><b>${t('result')}:</b> ${esc(x.result)}</p>` : ''}
      ${x.update ? `<p class="rp-txt" dir="auto"><b>${t('rpLastUpdate')}:</b> ${esc(x.update)}</p>` : ''}
      ${(x.people || []).length ? `<div class="rp-meta"><span>${t('rpWith')}: <span dir="auto">${x.people.map(esc).join('، ')}</span></span></div>` : ''}
      ${(x.files || []).length ? `<div class="rp-files">${x.files.map(fileChip).join('')}</div>` : ''}
    </article>`;
  return `<div class="rp ${mode === 'print' ? 'rp-print' : ''}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
    <header class="rp-head">
      <div class="rp-mark">${lang === 'ar' ? 'ر' : 'R'}</div>
      <div class="rp-hd">
        <div class="rp-eyebrow">${t('rpEyebrow')}</div>
        <h1>${t('rpTitle', { m: monthName(lang, s.period) })}</h1>
        <div class="rp-who" dir="auto">${esc(s.owner?.name || '')}${s.owner?.title ? ` · ${esc(s.owner.title)}` : ''}</div>
      </div>
    </header>
    <section class="rp-kpis ${k.logs ? 'n5' : ''}">
      <div class="rp-kpi"><b>${k.done ?? 0}</b><span>${t('rpKDone')}</span></div>
      <div class="rp-kpi accent"><b>${rate}</b><span>${t('rpKRate')}</span></div>
      <div class="rp-kpi"><b>${k.fuClosed ?? 0}</b><span>${t('rpKFu')}</span></div>
      <div class="rp-kpi"><b>${k.open ?? 0}</b><span>${t('rpKOpen')}</span></div>
      ${k.logs ? `<div class="rp-kpi"><b>${k.logs}</b><span>${t('rpKLogs')}</span></div>` : ''}
    </section>
    ${(s.byProject || []).length > 1 ? `<section class="rp-sec"><h3>${t('rpByProject')}</h3><div class="rp-bars">${s.byProject.map(p => `<div class="rp-bar"><span class="rp-bl" dir="auto">${esc(p.name || t('rpNoProject'))}</span><span class="rp-bt"><i style="width:${Math.max(4, Math.round(100 * p.n / maxP))}%"></i></span><b>${p.n}</b></div>`).join('')}</div></section>` : ''}
    ${doneItems.length ? `<section class="rp-sec"><h3>${t('rpAchievements')} <span class="rp-n">${doneItems.length}</span></h3><div class="rp-list">${doneItems.map(item).join('')}</div></section>` : ''}
    ${logItems.length ? `<section class="rp-sec"><h3>${t('rpOther')} <span class="rp-n">${logItems.length}</span></h3><div class="rp-list">${logItems.map(item).join('')}</div></section>` : ''}
    ${openItems.length ? `<section class="rp-sec"><h3>${t('rpInProgress')} <span class="rp-n">${openItems.length}</span></h3><div class="rp-list">${openItems.map(item).join('')}</div></section>` : ''}
    ${!doneItems.length && !openItems.length && !logItems.length ? `<p class="rp-empty">${t('rpEmpty')}</p>` : ''}
    <footer class="rp-foot">${t('rpFooter', { d: fmtD(lang, (s.generated_at || '').slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) })}</footer>
  </div>`;
}

/* Report styles: self-contained (own palette) so the share page and PDF look identical everywhere. */
export const REPORT_CSS = `
.rp{--rn:#1F3366;--rn2:#16264D;--rs:#E6EAF3;--ri:#16213A;--ri2:#4B5563;--ri3:#8A93A3;--rl:#E1E5EC;--rok:#1F7A50;--roks:#E3F1EA;--rhi:#B4372E;--rhis:#F8E8E6;--rw:#9A6510;--rws:#F7EEDD;
  color:var(--ri);font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,system-ui,sans-serif;line-height:1.6;max-width:880px;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp *{box-sizing:border-box}
.rp-head{display:flex;gap:16px;align-items:center;background:var(--rn);color:#fff;border-radius:18px;padding:22px 24px;position:relative;overflow:hidden}
.rp-head::after{content:"";position:absolute;inset-inline-end:-40px;top:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.07)}
.rp-mark{width:54px;height:54px;border-radius:16px;background:#fff;color:var(--rn);display:grid;place-items:center;font-family:'Readex Pro','IBM Plex Sans Arabic',sans-serif;font-weight:700;font-size:26px;flex:none}
.rp-eyebrow{font-size:12.5px;opacity:.75;font-weight:600;letter-spacing:.2px}
.rp-head h1{font-family:'Readex Pro','IBM Plex Sans Arabic',sans-serif;font-size:26px;margin:2px 0;line-height:1.35}
.rp-who{font-size:14.5px;opacity:.9}
.rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 6px}
.rp-kpis.n5{grid-template-columns:repeat(5,1fr)}
.rp-kpi{background:#fff;border:1px solid var(--rl);border-radius:14px;padding:12px 14px}
.rp-kpi b{display:block;font-family:'Readex Pro','IBM Plex Sans Arabic',sans-serif;font-size:28px;line-height:1.2;color:var(--rn);font-variant-numeric:tabular-nums}
.rp-kpi span{font-size:12.5px;color:var(--ri2);font-weight:600}
.rp-kpi.accent{background:var(--rn);border-color:var(--rn)} .rp-kpi.accent b,.rp-kpi.accent span{color:#fff}
.rp-sec{margin-top:18px}
.rp-sec h3{font-size:15px;margin:0 0 10px;color:var(--rn2);display:flex;align-items:center;gap:8px;font-weight:700}
.rp-sec h3::before{content:"";width:4px;height:16px;border-radius:3px;background:var(--rn)}
.rp-n{font-size:12px;background:var(--rs);color:var(--rn2);border-radius:99px;padding:0 9px;line-height:20px}
.rp-bars{background:#fff;border:1px solid var(--rl);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.rp-bar{display:grid;grid-template-columns:minmax(90px,30%) 1fr 32px;gap:10px;align-items:center;font-size:13.5px}
.rp-bl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ri2);font-weight:600}
.rp-bt{height:10px;background:var(--rs);border-radius:6px;overflow:hidden} .rp-bt i{display:block;height:100%;background:var(--rn);border-radius:6px}
.rp-bar b{text-align:end;font-variant-numeric:tabular-nums}
.rp-list{display:flex;flex-direction:column;gap:8px}
.rp-item{background:#fff;border:1px solid var(--rl);border-radius:14px;padding:12px 14px;break-inside:avoid;page-break-inside:avoid}
.rp-item-h{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
.rp-item h4{margin:0;font-size:15.5px;line-height:1.5;font-weight:700;overflow-wrap:anywhere}
.rp-tag{flex:none;font-size:11.5px;font-weight:700;border-radius:99px;padding:0 9px;line-height:21px;white-space:nowrap}
.rp-tag.ok{background:var(--roks);color:var(--rok)} .rp-tag.hi{background:var(--rhis);color:var(--rhi)}
.rp-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--ri3);margin-top:3px}
.rp-proj{background:var(--rs);color:var(--rn2);border-radius:99px;padding:0 9px;font-weight:600}
.rp-txt,.rp-res{margin:6px 0 0;font-size:13.5px;color:var(--ri2);white-space:pre-wrap;overflow-wrap:anywhere}
.rp-res{color:var(--ri)} .rp-res b,.rp-txt b{color:var(--rn2)}
.rp-prog{height:6px;border-radius:6px;background:var(--rs);overflow:hidden;margin-top:8px} .rp-prog i{display:block;height:100%;background:var(--rn)}
.rp-files{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rp-file{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--rl);border-radius:99px;padding:2px 10px 2px 3px;font-size:12px;color:var(--ri2);max-width:100%}
[dir=rtl] .rp-file{padding:2px 3px 2px 10px}
.rp-file span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-file b{font-size:9.5px;border-radius:99px;padding:1px 6px;background:var(--rl);color:var(--ri2);direction:ltr}
.rp-file.k-pdf b{background:var(--rhis);color:var(--rhi)} .rp-file.k-sheet b{background:var(--roks);color:var(--rok)} .rp-file.k-doc b{background:var(--rs);color:var(--rn2)} .rp-file.k-img b{background:var(--rws);color:var(--rw)}
.rp-empty{text-align:center;color:var(--ri3);padding:30px}
.rp-foot{margin-top:22px;padding-top:10px;border-top:1px solid var(--rl);font-size:11.5px;color:var(--ri3);text-align:center}
@media (max-width:560px){ .rp-kpis,.rp-kpis.n5{grid-template-columns:repeat(2,1fr)} .rp-kpis.n5 .rp-kpi:last-child{grid-column:1/-1} .rp-head{padding:18px} .rp-head h1{font-size:21px} .rp-kpi b{font-size:24px} }
.rp-print{max-width:none;font-size:12.5px}
.rp-print .rp-head{border-radius:12px;padding:16px 18px} .rp-print .rp-head h1{font-size:22px}
.rp-print .rp-kpi b{font-size:24px} .rp-print .rp-item{padding:9px 12px} .rp-print .rp-item h4{font-size:14px}
.rp-print .rp-kpis{grid-template-columns:repeat(4,1fr)} .rp-print .rp-kpis.n5{grid-template-columns:repeat(5,1fr)} .rp-print .rp-kpis.n5 .rp-kpi:last-child{grid-column:auto}
@media print{ .rp-sec h3{break-after:avoid;page-break-after:avoid} }
`;
export function ensureReportCSS(doc = document) {
  if (doc.getElementById('rp-css')) return;
  const st = doc.createElement('style'); st.id = 'rp-css'; st.textContent = REPORT_CSS; doc.head.appendChild(st);
}
