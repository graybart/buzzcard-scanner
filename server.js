'use strict';
// Check-in + door counter for keyboard-emulating ID scanners. No external dependencies.
//
// Every session has a mode, switchable at any time from the admin page:
//   attendance - roster-based check-in (names, late marking, type-your-name fallback)
//   door       - anonymous door counter (any 9-digit ID, fastpass/blacklist, inside count)
//
// Pages: /          scanner (open)          /count     public live count (open)
//        /admin     admin (login)           /checkout  exit-door -1 counter (login)
//        /fastpass  bulk fastpass import (login)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PASSWORD_FILE = path.join(DATA_DIR, 'password');
const SECRET_FILE = path.join(DATA_DIR, 'secret');
const PUBLIC = path.join(__dirname, 'public');
const COOKIE = 'checkin_admin';
const MODES = ['attendance', 'door'];
const ID_RE = /^\d{9}$/;          // door mode: student IDs must be exactly 9 digits
const NON_ID_LABEL = '(non-ID)';
const LISTS = ['blacklist', 'fastpass'];
// Door tap results that mean a person walked in
const ENTRY_STATUSES = new Set(['accepted', 'fastpass', 'duplicate', 'nonid']);

// ---------- storage ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = {
  defaultMode: 'attendance', // mode used when no session is active, and for new sessions
  people: {}, blacklist: [], fastpass: [],
  sessions: [], activeSid: null,
  checkins: {}, // attendance: sid -> [{uid, name, gtid, ts, method}]
  scans: {},    // door:       sid -> [{id, at, status}]
  exits: {},    // door:       sid -> [{at}]
};
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch (e) {
  if (e.code !== 'ENOENT') { console.error('Could not read', DB_FILE, e); process.exit(1); }
}

let byGtid = new Map();
const reindex = () => { byGtid = new Map(Object.values(db.people).map(p => [p.gtid, p])); };
reindex();

function save() { // synchronous + atomic: taps are low-rate, never lose one
  const tmp = DB_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    throw new Error(`Couldn't save data to ${DATA_DIR} (${e.code || e.message}). Check that the data folder is writable.`);
  }
}
try { fs.accessSync(DATA_DIR, fs.constants.W_OK); }
catch { console.error(`WARNING: data folder ${DATA_DIR} is not writable - nothing will be saved.`); }

const uid = () => crypto.randomBytes(6).toString('hex');
const normId = s => String(s ?? '').replace(/\s+/g, '');
const activeSession = () => db.sessions.find(s => s.sid === db.activeSid) || null;
const currentMode = () => (activeSession() || {}).mode || db.defaultMode;

// ---------- admin password ----------
// --password on the start script sets ADMIN_PASSWORD, which is saved in the data volume.
// Starting without it keeps the last saved password ("admin" on the very first run).
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (ADMIN_PASSWORD) {
  fs.writeFileSync(PASSWORD_FILE, ADMIN_PASSWORD, { mode: 0o600 });
} else {
  try { ADMIN_PASSWORD = fs.readFileSync(PASSWORD_FILE, 'utf8'); } catch {}
  if (!ADMIN_PASSWORD) ADMIN_PASSWORD = 'admin';
}
// The login cookie is an HMAC of the password with a random secret kept in the data volume,
// so logins survive restarts and changing the password logs everyone out.
let secret;
try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {}
if (!secret) { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 }); }
const adminToken = crypto.createHmac('sha256', secret).update('admin:' + ADMIN_PASSWORD).digest('hex');

function isAdmin(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})'));
  return !!m && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(adminToken));
}
function passwordOk(pw) {
  const a = crypto.createHash('sha256').update(String(pw || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const SAFE_NEXT = new Set(['/admin', '/checkout', '/fastpass']);

// ---------- attendance mode ----------
const isLate = (s, ts) => !!(s.startTime && ts > s.startTime);
const parseStart = v => (v == null || v === '' ? null : Number(v) || null);

function checkIn(person, method) {
  const s = activeSession();
  if (!s) return { mode: 'attendance', status: 'nosession' };
  if (!person) return { mode: 'attendance', status: 'unknown' };
  const list = (db.checkins[s.sid] ||= []);
  const existing = list.find(c => c.uid === person.uid);
  if (existing) return { mode: 'attendance', status: 'duplicate', name: person.name, ts: existing.ts, count: list.length };
  const c = { uid: person.uid, name: person.name, gtid: person.gtid, ts: Date.now(), method };
  list.push(c);
  save();
  broadcast('checkins');
  return { mode: 'attendance', status: 'ok', name: person.name, ts: c.ts, count: list.length, late: isLate(s, c.ts) };
}

// ---------- door mode ----------
const idSet = list => new Set(db[list].map(b => b.id));

// total  = unique IDs counted this session (not currently blacklisted) + every non-ID entry
// inside = every entry (first entries, re-entries, non-ID) minus check-outs
function doorSummary(sid) {
  const scans = (sid && db.scans[sid]) || [], exitsList = (sid && db.exits[sid]) || [];
  const bl = idSet('blacklist');
  const counted = new Set();
  let reentries = 0, rejected = 0, nonId = 0, fastpass = 0, entries = 0;
  for (const s of scans) {
    if (ENTRY_STATUSES.has(s.status)) entries++;
    if (s.status === 'nonid') nonId++;
    else if ((s.status === 'accepted' || s.status === 'fastpass') && !bl.has(s.id)) {
      counted.add(s.id);
      if (s.status === 'fastpass') fastpass++;
    }
    else if (s.status === 'duplicate') reentries++;
    else if (s.status === 'blacklisted') rejected++;
  }
  const exits = exitsList.length;
  return {
    total: counted.size + nonId, inside: Math.max(0, entries - exits), exits,
    ids: counted.size, nonId, fastpass, taps: scans.length, duplicates: reentries, rejected,
  };
}

function recordScan(rawId, nonId) {
  const s = activeSession();
  if (!s) return { error: 'nosession' };
  const id = nonId ? '' : String(rawId || '').trim();
  if (!nonId && !ID_RE.test(id)) return { error: 'invalid' };
  const scans = (db.scans[s.sid] ||= []);
  let status;
  if (nonId) status = 'nonid';
  else if (idSet('blacklist').has(id)) status = 'blacklisted'; // blacklist always wins
  else if (scans.some(x => x.id === id && (x.status === 'accepted' || x.status === 'fastpass'))) status = 'duplicate';
  else if (idSet('fastpass').has(id)) status = 'fastpass';
  else status = 'accepted';
  const scan = { id, at: new Date().toISOString(), status };
  scans.push(scan);
  save();
  return { scan };
}

// ---------- shared status (safe to show anyone: no IDs) ----------
function publicStatus() {
  const s = activeSession();
  const d = doorSummary(s && s.sid);
  return {
    mode: currentMode(),
    session: s ? { sid: s.sid, name: s.name, startTime: s.startTime || null, mode: s.mode } : null,
    count: s ? (db.checkins[s.sid] || []).length : 0, // attendance check-ins
    total: d.total, inside: d.inside, exits: d.exits,  // door counter
  };
}

function sessionList() {
  return db.sessions
    .map(s => ({
      ...s,
      count: (db.checkins[s.sid] || []).length,
      door: doorSummary(s.sid),
      active: s.sid === db.activeSid,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- live updates (Server-Sent Events) ----------
const clients = new Set();
function broadcast(type) {
  const msg = `event: update\ndata: ${JSON.stringify({ type, ...publicStatus() })}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---------- http helpers ----------
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => {
      if ((req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) {
        return resolve(Object.fromEntries(new URLSearchParams(data)));
      }
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
const csvCell = v => /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function redirect(res, to, cookie) {
  const h = { Location: to };
  if (cookie) h['Set-Cookie'] = cookie;
  res.writeHead(303, h); res.end();
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
function serveStatic(res, file) {
  const p = path.join(PUBLIC, file);
  if (!p.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: 'not found' });
  fs.readFile(p, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  const parts = p.split('/').filter(Boolean);

  // --- open pages and endpoints (scanner + public count) ---
  if (m === 'GET' && (p === '/' || p === '/scanner')) return serveStatic(res, 'scanner.html');
  if (m === 'GET' && p === '/count') return serveStatic(res, 'count.html');
  if (m === 'GET' && (p === '/api/status' || p === '/api/count')) return send(res, 200, publicStatus());

  if (m === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`retry: 2000\nevent: update\ndata: ${JSON.stringify({ type: 'hello', ...publicStatus() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (m === 'GET' && p === '/api/names') { // attendance autocomplete - names only, no ID numbers
    return send(res, 200, Object.values(db.people).map(x => ({ uid: x.uid, name: x.name })));
  }
  if (m === 'POST' && p === '/api/scan') {
    const { id, nonId } = await readBody(req);
    if (currentMode() === 'attendance') {
      if (nonId) return send(res, 200, { mode: 'attendance', status: 'unknown' });
      return send(res, 200, checkIn(byGtid.get(normId(id)), 'scan'));
    }
    const r = recordScan(id, nonId === true);
    if (r.error === 'nosession') return send(res, 200, { mode: 'door', status: 'nosession', ...publicStatus() });
    if (r.error) return send(res, 400, { mode: 'door', error: 'ID must be exactly 9 digits' });
    broadcast('scan');
    return send(res, 200, { mode: 'door', scan: r.scan, ...publicStatus() });
  }
  if (m === 'POST' && p === '/api/checkin-name') {
    if (currentMode() !== 'attendance') return send(res, 200, { mode: 'door', status: 'wrongmode' });
    const { uid: u } = await readBody(req);
    return send(res, 200, checkIn(db.people[u], 'typed'));
  }

  // --- login ---
  if (m === 'GET' && p === '/login') {
    const next = SAFE_NEXT.has(url.searchParams.get('next')) ? url.searchParams.get('next') : '/admin';
    if (isAdmin(req)) return redirect(res, next);
    return serveStatic(res, 'login.html');
  }
  if (m === 'POST' && p === '/login') {
    const { password, next } = await readBody(req);
    const to = SAFE_NEXT.has(next) ? next : '/admin';
    if (!passwordOk(password)) {
      await new Promise(r => setTimeout(r, 600));
      return redirect(res, `/login?error=1&next=${encodeURIComponent(to)}`);
    }
    return redirect(res, to, `${COOKIE}=${adminToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`);
  }
  if (p === '/logout') return redirect(res, '/login', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);

  // --- everything below requires the admin password ---
  if (!isAdmin(req)) {
    if (m === 'GET' && SAFE_NEXT.has(p)) return redirect(res, `/login?next=${encodeURIComponent(p)}`);
    if (p.startsWith('/api/')) return send(res, 401, { error: 'Login required' });
    return send(res, 404, { error: 'not found' });
  }

  if (m === 'GET' && p === '/admin') return serveStatic(res, 'admin.html');
  if (m === 'GET' && p === '/checkout') return serveStatic(res, 'checkout.html');
  if (m === 'GET' && p === '/fastpass') return serveStatic(res, 'fastpass.html');

  // --- mode toggle: changes the active session's mode (and the default for new sessions) ---
  if (m === 'POST' && p === '/api/mode') {
    const { mode } = await readBody(req);
    if (!MODES.includes(mode)) return send(res, 400, { error: 'mode must be attendance or door' });
    db.defaultMode = mode;
    const s = activeSession();
    if (s) s.mode = mode;
    save(); broadcast('mode');
    return send(res, 200, publicStatus());
  }

  // --- roster (attendance) ---
  if (m === 'GET' && p === '/api/roster') {
    return send(res, 200, Object.values(db.people).sort((a, b) => a.name.localeCompare(b.name)));
  }
  if (m === 'POST' && p === '/api/roster') {
    const { entries = [], replace = false } = await readBody(req);
    if (replace) db.people = {};
    reindex();
    let added = 0, updated = 0;
    for (const e of entries) {
      const name = String(e.name || '').trim(), gtid = normId(e.id);
      if (!name || !gtid) continue;
      const existing = byGtid.get(gtid);
      if (existing) { if (existing.name !== name) { existing.name = name; updated++; } }
      else { const person = { uid: uid(), name, gtid }; db.people[person.uid] = person; byGtid.set(gtid, person); added++; }
    }
    save(); broadcast('roster');
    return send(res, 200, { added, updated, total: Object.keys(db.people).length });
  }
  if (m === 'DELETE' && p === '/api/roster') {
    db.people = {}; reindex(); save(); broadcast('roster');
    return send(res, 200, { ok: true });
  }
  if (m === 'DELETE' && parts[0] === 'api' && parts[1] === 'roster' && parts[2]) {
    delete db.people[parts[2]]; reindex(); save(); broadcast('roster');
    return send(res, 200, { ok: true });
  }

  // --- fastpass / blacklist (door) ---
  if (m === 'GET' && p === '/api/lists') return send(res, 200, { blacklist: db.blacklist, fastpass: db.fastpass });

  if (m === 'POST' && p === '/api/lists/fastpass/bulk') { // {items:[{id, note}], replace:bool}
    const { items, replace } = await readBody(req);
    if (!Array.isArray(items)) return send(res, 400, { error: 'items must be a list' });
    const bl = idSet('blacklist');
    const old = new Map(db.fastpass.map(f => [f.id, f]));
    const next = replace ? new Map() : new Map(old);
    const result = { added: 0, updated: 0, unchanged: 0, skippedBlacklisted: [], invalid: 0, removed: 0 };
    const now = new Date().toISOString();
    for (const it of items) {
      const id = String((it && it.id) || '').trim();
      const note = String((it && it.note) || '').trim().slice(0, 200);
      if (!ID_RE.test(id)) { result.invalid++; continue; }
      if (bl.has(id)) { result.skippedBlacklisted.push(id); continue; }
      const prev = next.get(id) || old.get(id);
      if (!prev) { next.set(id, { id, note, addedAt: now }); result.added++; }
      else if (note && note !== prev.note) { next.set(id, { ...prev, note }); result.updated++; }
      else { next.set(id, prev); result.unchanged++; }
    }
    if (replace) result.removed = [...old.keys()].filter(id => !next.has(id)).length;
    db.fastpass = [...next.values()];
    save(); broadcast('fastpass');
    return send(res, 200, { ...result, total: db.fastpass.length });
  }

  const lm = p.match(/^\/api\/lists\/(blacklist|fastpass)(?:\/(\d+))?$/);
  if (lm) {
    const [, list, delId] = lm;
    if (m === 'POST' && !delId) {
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      if (!ID_RE.test(id)) return send(res, 400, { error: 'ID must be exactly 9 digits' });
      const other = list === 'blacklist' ? 'fastpass' : 'blacklist';
      if (idSet(other).has(id)) return send(res, 409, { error: `${id} is on the ${other}. Remove it there first.` });
      if (!idSet(list).has(id)) {
        db[list].push({ id, note: String(body.note || '').slice(0, 200), addedAt: new Date().toISOString() });
        save(); broadcast(list);
      }
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE' && delId) {
      db[list] = db[list].filter(b => b.id !== delId);
      save(); broadcast(list);
      return send(res, 200, { ok: true });
    }
  }

  // --- check-out (door): {} = one person left, {undo:true} = take back the last check-out ---
  if (m === 'POST' && p === '/api/checkout') {
    const { undo } = await readBody(req);
    const s = activeSession();
    if (!s) return send(res, 409, { error: 'No active session', ...publicStatus() });
    if (s.mode !== 'door') return send(res, 409, { error: 'Door counter mode is off', ...publicStatus() });
    const exits = (db.exits[s.sid] ||= []);
    if (undo) {
      if (!exits.length) return send(res, 409, { error: 'Nothing to undo', ...publicStatus() });
      exits.pop();
    } else {
      if (doorSummary(s.sid).inside <= 0) return send(res, 409, { error: 'Nobody is inside', ...publicStatus() });
      exits.push({ at: new Date().toISOString() });
    }
    save(); broadcast('checkout');
    return send(res, 200, publicStatus());
  }

  // --- sessions ---
  if (m === 'GET' && p === '/api/sessions') return send(res, 200, sessionList());
  if (m === 'POST' && p === '/api/sessions') {
    const { name, startTime, mode } = await readBody(req);
    const s = {
      sid: uid(), name: String(name || '').trim() || new Date().toLocaleString('en-US'),
      createdAt: Date.now(), startTime: parseStart(startTime),
      mode: MODES.includes(mode) ? mode : db.defaultMode,
    };
    db.sessions.push(s); db.activeSid = s.sid; db.defaultMode = s.mode;
    save(); broadcast('sessions');
    return send(res, 200, s);
  }
  if (m === 'POST' && p === '/api/sessions/stop') {
    db.activeSid = null; save(); broadcast('sessions');
    return send(res, 200, { ok: true });
  }
  if (parts[0] === 'api' && parts[1] === 'sessions' && parts[2]) {
    const s = db.sessions.find(x => x.sid === parts[2]);
    if (!s) return send(res, 404, { error: 'no such session' });
    if (m === 'POST' && parts[3] === 'activate') {
      db.activeSid = s.sid; db.defaultMode = s.mode; save(); broadcast('sessions');
      return send(res, 200, { ok: true });
    }
    if (m === 'PATCH' && !parts[3]) { // edit name, start time, mode
      const body = await readBody(req);
      if ('startTime' in body) s.startTime = parseStart(body.startTime);
      if (body.name && String(body.name).trim()) s.name = String(body.name).trim();
      if (MODES.includes(body.mode)) { s.mode = body.mode; if (s.sid === db.activeSid) db.defaultMode = s.mode; }
      save(); broadcast('sessions');
      return send(res, 200, s);
    }
    if (m === 'GET' && parts[3] === 'checkins') {
      return send(res, 200, (db.checkins[s.sid] || []).map(c => ({ ...c, late: isLate(s, c.ts) })));
    }
    if (m === 'DELETE' && parts[3] === 'checkins' && parts[4]) {
      db.checkins[s.sid] = (db.checkins[s.sid] || []).filter(c => c.uid !== parts[4]);
      save(); broadcast('checkins');
      return send(res, 200, { ok: true });
    }
    if (m === 'GET' && parts[3] === 'door') {
      return send(res, 200, { ...doorSummary(s.sid), scans: db.scans[s.sid] || [], exitLog: db.exits[s.sid] || [] });
    }
    if (m === 'GET' && parts[3] === 'export.csv') { // door scan log
      const bl = idSet('blacklist');
      const events = [
        ...(db.scans[s.sid] || []).map(x => x.status === 'nonid'
          ? [x.at, NON_ID_LABEL, 'nonid', 'no']
          : [x.at, x.id, x.status === 'duplicate' ? 'reentry' : x.status, bl.has(x.id) ? 'yes' : 'no']),
        ...(db.exits[s.sid] || []).map(e => [e.at, '(check-out)', 'checkout', '']),
      ].sort((a, b) => a[0].localeCompare(b[0]));
      const rows = [['time', 'id', 'event', 'currently_blacklisted'], ...events];
      const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
      const fname = (s.name.replace(/[^\w\- ]+/g, '_') || 'scans') + '.csv';
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}"` });
      return res.end(csv);
    }
    if (m === 'DELETE' && !parts[3]) {
      db.sessions = db.sessions.filter(x => x.sid !== s.sid);
      delete db.checkins[s.sid]; delete db.scans[s.sid]; delete db.exits[s.sid];
      if (db.activeSid === s.sid) db.activeSid = null;
      save(); broadcast('sessions');
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => { console.error(err); send(res, 500, { error: String(err.message || err) }); });
});
server.listen(PORT, () => console.log(`Check-in running on :${PORT}  (scanner: /  admin: /admin  count: /count  exit door: /checkout)`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
