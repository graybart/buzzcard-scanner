import '../styles/base.css';
import '../styles/components.css';
import '../styles/kiosk.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Button, Live, TextField } from '../ui';
import { useEvents } from '../lib/useEvents';
import { enableSound, play, type SoundName } from '../lib/sound';
import { clock } from '../lib/format';
import type { AttendanceResult, DoorResult, Mode, NameOnly, PublicStatus, ScanResult, UpdateEvent } from '../lib/types';

type Flash = 'ok' | 'warn' | 'bad' | 'fastpass';
type Tone = 'ok' | 'warn' | 'bad' | '';
interface AttView { label: string; late: boolean; name: string; result: string; tone: Tone }
interface DoorView { last: string; result: string }
const ATT_IDLE: AttView = { label: 'Last check-in', late: false, name: '—', result: 'Tap your ID', tone: '' };
const DOOR_IDLE: DoorView = { last: '—', result: '' };

function Scanner() {
  const [started, setStarted] = React.useState(false);
  const [status, setStatus] = React.useState<PublicStatus | null>(null);
  const [att, setAtt] = React.useState<AttView>(ATT_IDLE);
  const [door, setDoor] = React.useState<DoorView>(DOOR_IDLE);
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const [names, setNames] = React.useState<NameOnly[]>([]);
  const [text, setText] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const flashTimer = React.useRef<number>(0);
  const buf = React.useRef(''); const lastKey = React.useRef(0);

  const mode: Mode = status?.mode ?? 'attendance';
  const modeRef = React.useRef(mode);
  const startedRef = React.useRef(started);
  startedRef.current = started;

  // ---- mode switching (live, no reload, so sound stays enabled) ----
  const applyMode = React.useCallback((m: Mode) => {
    if (m === modeRef.current) return;
    modeRef.current = m;
    setAtt(ATT_IDLE); setDoor(DOOR_IDLE); setText(''); setFlash(null); buf.current = '';
    if (m === 'door') inputRef.current?.blur();
  }, []);

  const flashFor = (kind: Flash, ms = 500, sound: SoundName | null = null) => {
    window.clearTimeout(flashTimer.current);
    setFlash(kind);
    flashTimer.current = window.setTimeout(() => setFlash(null), ms);
    play(sound);
  };

  const loadNames = React.useCallback(async () => {
    try { setNames(await (await fetch('/api/names')).json()); } catch { /* keep last list */ }
  }, []);

  const connected = useEvents((e: UpdateEvent) => {
    applyMode(e.mode);
    setStatus(e);
    if (e.type === 'roster' || e.type === 'hello') void loadNames();
    if (e.type === 'sessions' && e.mode === 'door') setDoor(DOOR_IDLE);
  });

  // ---- results ----
  const showAtt = (r: AttendanceResult) => {
    if (r.count != null) setStatus(s => (s ? { ...s, count: r.count! } : s));
    const t = r.ts ? clock(r.ts) : '';
    switch (r.status) {
      case 'ok':
        if (r.late) { setAtt({ label: 'Late entry', late: true, name: r.name!, result: `Late entry · checked in ${t}`, tone: 'warn' }); flashFor('warn', 500, 'ok'); }
        else { setAtt({ label: 'Last check-in', late: false, name: r.name!, result: `Checked in · ${t}`, tone: 'ok' }); flashFor('ok', 500, 'ok'); }
        return;
      case 'duplicate':
        setAtt({ label: 'Last check-in', late: false, name: r.name!, result: `Already checked in at ${t}`, tone: 'warn' }); flashFor('warn', 500, 'duplicate'); return;
      case 'unknown':
        setAtt(a => ({ ...a, label: 'Last check-in', late: false, result: 'ID not recognized. See the front desk.', tone: 'bad' })); flashFor('bad', 700, 'error'); return;
      case 'nosession':
        setAtt(a => ({ ...a, label: 'Last check-in', late: false, result: 'No active session. Start one on the admin page.', tone: 'bad' })); flashFor('bad', 700, 'error'); return;
      default:
        setAtt(a => ({ ...a, result: 'Something went wrong', tone: 'bad' })); flashFor('bad', 700, 'error');
    }
  };

  const showDoor = (d: DoorResult, id: string | null) => {
    if ('total' in d) setStatus(s => (s ? { ...s, total: d.total, inside: d.inside, exits: d.exits } : s));
    const label = id ?? 'Non-ID';
    if ('status' in d && d.status === 'nosession') {
      setDoor({ last: label, result: 'No active session. Start one on the admin page.' }); flashFor('bad', 700, 'error'); return;
    }
    if (!('scan' in d)) { setDoor({ last: label, result: 'Not recorded. Tap again.' }); flashFor('bad'); return; }
    const s = d.scan;
    if (s.status === 'nonid') { setDoor({ last: 'Non-ID', result: 'Non-ID entry added' }); flashFor('ok', 500, 'ok'); return; }
    if (s.status === 'accepted') { setDoor({ last: s.id, result: 'Checked in' }); flashFor('ok', 500, 'ok'); }
    else if (s.status === 'fastpass') { setDoor({ last: s.id, result: 'Fastpass' }); flashFor('fastpass', 500, 'fastpass'); }
    else if (s.status === 'duplicate') { setDoor({ last: s.id, result: 'Welcome back (re-entry)' }); flashFor('warn'); }
    else { setDoor({ last: s.id, result: 'Not allowed' }); flashFor('bad'); }
  };

  const handle = (r: ScanResult, doorId: string | null) => {
    applyMode(r.mode);
    setStatus(s => (s ? { ...s, mode: r.mode } : s));
    if (r.mode === 'attendance') showAtt(r); else showDoor(r, doorId);
  };

  const post = async (url: string, body: object, doorId: string | null = null) => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = (await res.json()) as ScanResult;
      if (d.mode === 'door' && 'error' in d) { setDoor({ last: doorId ?? 'Non-ID', result: d.error }); flashFor('bad'); return; }
      handle(d, doorId);
    } catch {
      if (modeRef.current === 'door') { setDoor({ last: doorId ?? 'Non-ID', result: 'Not recorded: server unreachable' }); flashFor('bad'); }
      else showAtt({ mode: 'attendance', status: 'error' });
    }
  };

  // ---- attendance: name autocomplete ----
  const matches = React.useMemo(() => matchNames(names, text), [names, text]);
  React.useEffect(() => setSel(0), [text]);
  const pick = (p: NameOnly) => { setText(''); void post('/api/checkin-name', { uid: p.uid }); inputRef.current?.focus(); };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (modeRef.current !== 'attendance') return;
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setSel(i => (i + 1) % matches.length); return; }
    if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setSel(i => (i - 1 + matches.length) % matches.length); return; }
    if (e.key === 'Escape') { setText(''); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.currentTarget.value;
    // Scanner output = digits followed by Enter. Also handles a tap mid-way through someone typing a name.
    const m = v.match(/^(.*?)(\d+)$/);
    if (m && (m[1].trim() === '' || m[2].length >= 5)) { setText(m[1]); void post('/api/scan', { id: m[2] }); return; }
    if (matches.length) { pick(matches[sel] ?? matches[0]); return; }
    if (v.trim()) { setAtt(a => ({ ...a, result: 'Pick your name from the list', tone: 'warn' })); play('error'); }
  };

  // ---- door: keyboard-wedge capture at the document level ----
  const submitDoor = React.useRef<(id: string | null) => void>(() => {});
  submitDoor.current = (id) => void post('/api/scan', id === null ? { nonId: true } : { id }, id);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modeRef.current !== 'door') {
        if (startedRef.current && document.activeElement !== inputRef.current) inputRef.current?.focus(); // catch stray keys
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = Date.now();
      if (now - lastKey.current > 2000) buf.current = ''; // stale partial input
      lastKey.current = now;
      if (e.key === 'Enter') {
        e.preventDefault();
        const id = buf.current.trim(); buf.current = '';
        if (!id) submitDoor.current(null); // Enter on its own = non-ID entry
        else if (!/^\d{9}$/.test(id)) { setDoor({ last: id, result: 'Invalid ID (must be 9 digits)' }); flashFor('bad'); }
        else submitDoor.current(id);
      } else if (e.key.length === 1) {
        e.preventDefault();
        buf.current += e.key;
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // Keep the field focused in attendance mode so scans are never lost.
  React.useEffect(() => {
    if (!started || mode !== 'attendance') return;
    const refocus = () => window.setTimeout(() => { if (modeRef.current === 'attendance') inputRef.current?.focus(); }, 0);
    inputRef.current?.focus();
    const el = inputRef.current;
    el?.addEventListener('blur', refocus);
    document.addEventListener('click', refocus);
    return () => { el?.removeEventListener('blur', refocus); document.removeEventListener('click', refocus); };
  }, [started, mode]);

  const session = status?.session ?? null;
  return (
    <div className="kiosk" data-flash={flash ?? undefined}>
      <div className="flash" />
      {!started && (
        <button className="start" onClick={() => { enableSound(); setStarted(true); }}>
          <span className="headline-l">Click to start</span>
          <span className="body-l muted">Turns on sound and keeps the scanner ready for taps</span>
        </button>
      )}

      <header className="kbar on-flash">
        <div className="sess body-l">
          {session ? <>Session: <b>{session.name}</b>{mode === 'attendance' && session.startTime ? ` · starts ${clock(session.startTime)}` : ''}</>
            : <span className="nosession">No active session</span>}
        </div>
        <div className="spacer" />
        {mode === 'attendance'
          ? <div className="count body-l"><b className="num">{status?.count ?? 0}</b>checked in</div>
          : <Button variant="outlined" neutral icon="add" tabIndex={-1} onMouseDown={e => e.preventDefault()}
              onClick={e => { e.currentTarget.blur(); submitDoor.current(null); }}>
              Add non-ID entry <span className="muted label-m" style={{ marginLeft: 4 }}>Enter</span>
            </Button>}
      </header>

      {mode === 'attendance' ? (
        <>
          <main className="stage on-flash">
            <div className={att.late ? 'overline late' : 'overline'}>{att.label}</div>
            <div className="big-name">{att.name}</div>
            <div className={`result ${att.tone}`}>{att.result}</div>
          </main>
          <div className="entry">
            {matches.length > 0 && (
              <ul className="ac" role="listbox" aria-label="Matching names">
                {matches.map((p, i) => (
                  <li key={p.uid} role="option" aria-selected={i === sel} onMouseDown={e => { e.preventDefault(); pick(p); }}>
                    <span><Highlight name={p.name} query={text} /></span>
                  </li>
                ))}
              </ul>
            )}
            <TextField
              label="Tap your ID, or start typing your name" lead="search" inputRef={inputRef}
              autoComplete="off" spellCheck={false} value={text}
              onChange={e => setText(e.target.value)} onKeyDown={onInputKey}
              support="Forgot your ID? Type your name and pick it from the list."
            />
          </div>
        </>
      ) : (
        <main className="stage on-flash">
          <div className="overline">Last scanned</div>
          <div className="big-id">{door.last}</div>
          <div className="result" style={{ color: 'var(--md-sys-color-on-surface)' }}>{door.result || ' '}</div>
          <div className="counters">
            <div className="counter"><span className="overline">Total</span><span className="n">{status?.total ?? 0}</span></div>
            <div className="counter"><span className="overline">Inside</span><span className="n">{status?.inside ?? 0}</span></div>
          </div>
        </main>
      )}
      <div className="kfoot on-flash"><Live up={connected} /></div>
    </div>
  );
}

// ---- name matching: every typed word must start some word of the name ----
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function matchNames(names: NameOnly[], text: string): NameOnly[] {
  const q = norm(text.trim());
  if (q.length < 2 || /\d/.test(q)) return [];
  const terms = q.split(/\s+/);
  return names
    .filter(p => { const words = norm(p.name).split(/[\s,.'-]+/); return terms.every(t => words.some(w => w.startsWith(t))); })
    .map(p => [norm(p.name).startsWith(q) ? 0 : 1, p] as const)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, 6).map(x => x[1]);
}
function Highlight({ name, query }: { name: string; query: string }) {
  const terms = norm(query.trim()).split(/\s+/);
  return <>{name.split(/(\s+)/).map((w, i) => {
    const t = terms.find(t => t && norm(w).startsWith(t));
    return t ? <React.Fragment key={i}><mark>{w.slice(0, t.length)}</mark>{w.slice(t.length)}</React.Fragment> : w;
  })}</>;
}

createRoot(document.getElementById('root')!).render(<AppShell><Scanner /></AppShell>);
