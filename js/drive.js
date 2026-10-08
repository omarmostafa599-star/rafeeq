// رفيق — Google Drive helpers. Files live in the user's own Drive, in a folder the app creates
// («رفيق» › one sub-folder per month). Scope is drive.file: the app sees only what it created.
import { state, driveToken, saveProfile } from './data.js';

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
export const ROOT_NAME = 'رفيق';
export const MAX_BYTES = 200 * 1024 * 1024;

async function call(path, { method = 'GET', body, headers = {}, raw = false, retry = true } = {}) {
  const tok = await driveToken();
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method, body, headers: Object.assign({ Authorization: 'Bearer ' + tok }, body && typeof body === 'string' ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}, headers),
  });
  if (res.status === 401 && retry) { await driveToken(true); return call(path, { method, body, headers, raw, retry: false }); }
  if (!res.ok) { let j = null; try { j = await res.json(); } catch { } throw { code: res.status === 404 ? 'not_found' : 'drive', status: res.status, detail: j?.error?.message || res.statusText }; }
  return raw ? res : res.status === 204 ? null : res.json();
}

const driveSettings = () => Object.assign({ root: null, months: {} }, (state.profile.settings || {}).drive || {});
function saveDriveSettings(d) { const s = Object.assign({}, state.profile.settings, { drive: d }); saveProfile({ settings: s }, { quiet: true }); }

async function folderAlive(id) {
  if (!id) return false;
  try { const f = await call(`/files/${id}?fields=id,trashed`); return !f.trashed; } catch (e) { if (e.code === 'not_found') return false; throw e; }
}
async function createFolder(name, parent) {
  const meta = { name, mimeType: FOLDER }; if (parent) meta.parents = [parent];
  const f = await call('/files?fields=id', { method: 'POST', body: JSON.stringify(meta) });
  return f.id;
}
async function findFolder(name, parent) {
  const q = [`mimeType='${FOLDER}'`, 'trashed=false', `name='${name.replace(/'/g, "\\'")}'`, parent ? `'${parent}' in parents` : null].filter(Boolean).join(' and ');
  const r = await call('/files?fields=files(id)&pageSize=1&q=' + encodeURIComponent(q));
  return r.files?.[0]?.id || null;
}
/** Folder id for files uploaded this month; creates «رفيق — Rafeeq/2026-10» when needed. */
export async function monthFolder(date = new Date()) {
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const d = driveSettings();
  if (d.months[ym] && await folderAlive(d.months[ym])) return d.months[ym];
  if (!(await folderAlive(d.root))) { d.root = (await findFolder(ROOT_NAME)) || (await createFolder(ROOT_NAME)); d.months = {}; }
  const id = (await findFolder(ym, d.root)) || (await createFolder(ym, d.root));
  d.months = Object.assign({}, d.months, { [ym]: id });
  saveDriveSettings(d);
  return id;
}
export const rootFolderUrl = () => { const d = driveSettings(); return d.root ? `https://drive.google.com/drive/folders/${d.root}` : 'https://drive.google.com/drive/my-drive'; };

/** Resumable upload with progress. Resolves to { id, name, mimeType, size }. */
export async function uploadFile(file, { onProgress, signal } = {}) {
  const parent = await monthFolder();
  const tok = await driveToken();
  const meta = { name: file.name || 'file', parents: [parent] };
  const init = await fetch(`${UP}/files?uploadType=resumable&fields=id,name,mimeType,size`, {
    method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': file.type || 'application/octet-stream', 'X-Upload-Content-Length': String(file.size) },
    body: JSON.stringify(meta),
  });
  if (!init.ok) { let j = null; try { j = await init.json(); } catch { } throw { code: 'drive', status: init.status, detail: j?.error?.message || init.statusText }; }
  const loc = init.headers.get('Location');
  if (!loc) throw { code: 'drive', detail: 'no upload session' };
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', loc);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch { reject({ code: 'drive', detail: 'bad response' }); } } else reject({ code: 'drive', status: xhr.status, detail: xhr.statusText }); };
    xhr.onerror = () => reject({ code: navigator.onLine ? 'drive' : 'offline' });
    xhr.onabort = () => reject({ code: 'aborted' });
    if (signal) signal.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

export const trashFile = id => call(`/files/${id}?fields=id`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) });
export const renameFile = (id, name) => call(`/files/${id}?fields=id,name`, { method: 'PATCH', body: JSON.stringify({ name }) });
export async function fileBlob(id) { const res = await call(`/files/${id}?alt=media`, { raw: true }); return res.blob(); }

export const viewUrl = id => `https://drive.google.com/file/d/${id}/view`;
export const previewUrl = id => `https://drive.google.com/file/d/${id}/preview`;

/* ---------- file kinds ---------- */
const EXT = s => (String(s || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase();
export function kindOf(f) {
  const m = (f.mime || '').toLowerCase(), e = EXT(f.name);
  if (m === 'application/pdf' || e === 'pdf') return 'pdf';
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'].includes(e)) return 'img';
  if (/spreadsheet|excel|csv/.test(m) || ['xlsx', 'xls', 'xlsm', 'csv', 'ods'].includes(e)) return 'sheet';
  if (/wordprocessing|msword|opendocument\.text|rtf/.test(m) || ['docx', 'doc', 'odt', 'rtf'].includes(e)) return 'doc';
  if (/presentation|powerpoint/.test(m) || ['pptx', 'ppt', 'odp'].includes(e)) return 'slides';
  return 'other';
}
export const extLabel = f => { const k = kindOf(f); return { pdf: 'PDF', img: 'IMG', sheet: 'XLS', doc: 'DOC', slides: 'PPT' }[k] || (EXT(f.name).toUpperCase().slice(0, 4) || 'FILE'); };
export function fmtSize(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}
