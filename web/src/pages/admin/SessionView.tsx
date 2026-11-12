import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Button, Checkbox, Icon, LinkButton, snack, Tag, TextField, useConfirm } from '../../ui';
import { clockSec, dateTime, fromLocalInput, plural, sheetTime, toLocalInput } from '../../lib/format';
import { MODE_NAME, type Checkin, type DoorDetail, type ListEntry, type Lists, type Mode, type NameOnly, type ScanStatus } from '../../lib/types';
import { act, api, useLoad, type AdminCtx } from './shared';

interface Viewed { sid: string; name: string; mode: Mode; startTime: number | null; createdAt?: number; active: boolean }

/** The active session (sid = null) or a past one. */
export function SessionView(ctx: AdminCtx & { sid: string | null }) {
  const { sid, status, sessions, isAdmin, go, newSession } = ctx;
  const active = status?.session ?? null;
  let s: Viewed | null = null;
  if (sid && sid !== active?.sid) {
    const found = sessions.find(x => x.sid === sid);
    if (found) s = { ...found, active: false };
  } else if (active) {
    const full = sessions.find(x => x.sid === active.sid);
    s = { ...active, createdAt: full?.createdAt, active: true };
  }

  if (!status || (sid && isAdmin && !sessions.length)) return null; // still loading
  if (!s) {
    return (
      <section className="card empty-state">
        <h2 className="headline-s" style={{ margin: 0 }}>{sid ? 'That session no longer exists' : 'No active session'}</h2>
        <p className="body-m muted" style={{ margin: '8px 0 20px' }}>
          {isAdmin ? 'Start a session to begin checking people in. The scanner records into the active session.'
            : 'An admin needs to start a session before anyone can be checked in.'}
        </p>
        {isAdmin && <div className="row" style={{ justifyContent: 'center' }}>
          <Button variant="filled" icon="add" onClick={newSession}>New session</Button>
          <Button variant="outlined" onClick={() => go({ page: 'sessions' })}>All sessions</Button>
        </div>}
      </section>
    );
  }

  return (
    <>
      {!s.active && (
        <div className="banner body-m" role="status">
          <span style={{ flex: 1 }}>
            You're looking at a past session: <b>{s.name}</b> ({MODE_NAME[s.mode]}{s.createdAt ? `, ${dateTime(s.createdAt)}` : ''}).
          </span>
          <Button variant="text" onClick={() => go({ page: 'session', sid: null })}>Back to active session</Button>
        </div>
      )}
      {s.mode === 'attendance' ? <AttendanceView ctx={ctx} s={s} /> : <DoorView ctx={ctx} s={s} />}
    </>
  );
}

// =====================================================================================
// Attendance
// =====================================================================================
function AttendanceView({ ctx, s }: { ctx: AdminCtx; s: Viewed }) {
  const { ticks, isAdmin } = ctx;
  const checkins = useLoad<Checkin[]>(`/api/sessions/${s.sid}/checkins`, ticks.checkins, []);
  const confirm = useConfirm();
  const lateN = checkins.filter(c => c.late).length;
  const rows = [...checkins].sort((a, b) => b.ts - a.ts);

  const tsv = () => [...checkins].sort((a, b) => a.ts - b.ts)
    .map(c => [c.name.replace(/[\t\r\n]+/g, ' '), sheetTime(c.ts)].join('\t')).join('\n');
  const copy = async () => {
    try {
      if (await copyText(tsv())) snack(`Copied ${plural(checkins.length, 'row')}. Paste into Google Sheets.`);
      else snack("Couldn't copy. Use Download instead.", { error: true });
    } catch { snack("Couldn't copy. Use Download instead.", { error: true }); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tsv()], { type: 'text/tab-separated-values' }));
    a.download = (s.name || 'checkins').replace(/[^\w\- ]+/g, '_') + '.tsv';
    a.click(); URL.revokeObjectURL(a.href);
  };
  const remove = async (c: Checkin) => {
    if (await confirm({ title: `Remove ${c.name}'s check-in?`, body: 'They can be checked in again afterwards.', confirm: 'Remove', danger: true }))
      await act(api(`/api/sessions/${s.sid}/checkins/${c.uid}`, 'DELETE'));
  };

  return (
    <>
      <section className="card add-card">
        <AddCheckin s={s} isAdmin={isAdmin} checkedIn={React.useMemo(() => new Set(checkins.map(c => c.uid)), [checkins])} tick={ticks.roster} />
      </section>

      <section className="card tbl-card">
        <div className="tbl-head">
          <h2 className="title-l">Checked in <span className="muted body-m num">{checkins.length}{lateN ? ` · ${lateN} late` : ''}</span></h2>
          {isAdmin && <>
            <Button variant="outlined" icon="download" onClick={download} disabled={!checkins.length}>Download .tsv</Button>
            <Button variant="tonal" icon="content_copy" onClick={copy} disabled={!checkins.length}
              title="Two columns, name and check-in time. Paste into the first empty cell; times paste as real date-times.">Copy for Google Sheets</Button>
          </>}
        </div>
        <div className="table-wrap scroll-520">
          <table className="data">
            <thead><tr>
              <th style={{ width: 48 }}>#</th><th>Name</th>{isAdmin && <th>ID</th>}<th>Time</th><th>How</th>{isAdmin && <th className="end" />}
            </tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.uid}>
                  <td className="muted num">{rows.length - i}</td>
                  <td className="strong">{c.name}</td>
                  {isAdmin && <td className="num muted">{c.gtid}</td>}
                  <td className="num">{dateTime(c.ts)}</td>
                  <td><div className="row" style={{ gap: 6 }}>
                    <Tag>{c.method === 'typed' ? 'Typed name' : c.method === 'manual' ? `Added by ${c.by ?? 'admin'}` : 'ID tap'}</Tag>
                    {c.late && <Tag tone="warn">Late</Tag>}
                  </div></td>
                  {isAdmin && <td className="end"><Button variant="text" neutral small onClick={() => remove(c)}>Remove</Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty body-m">No check-ins yet.</div>}
        </div>
      </section>
    </>
  );
}

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Every typed word must start some word of the name (same matching as the scanner). */
const nameMatches = (name: string, query: string) => {
  const terms = norm(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const words = norm(name).split(/[\s,.'-]+/);
  return terms.every(t => words.some(w => w.startsWith(t)));
};

/** Compact "check someone in by name" box (the scanner's write-in, for the admin page). */
function AddCheckin({ s, isAdmin, checkedIn, tick }: { s: Viewed; isAdmin: boolean; checkedIn: Set<string>; tick: number }) {
  const [names, setNames] = React.useState<NameOnly[]>([]);
  const [input, setInput] = React.useState('');
  const [time, setTime] = React.useState(() => toLocalInput(s.startTime ?? s.createdAt ?? Date.now()));
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { void fetch('/api/names').then(r => r.json()).then(setNames).catch(() => {}); }, [tick]);
  React.useEffect(() => { setTime(toLocalInput(s.startTime ?? s.createdAt ?? Date.now())); }, [s.sid]);

  const available = React.useMemo(() => names.filter(n => !checkedIn.has(n.uid)).sort((a, b) => a.name.localeCompare(b.name)), [names, checkedIn]);
  const items = React.useMemo(() => Combobox.createItems(available, { getValue: n => n.uid, getLabel: n => n.name }), [available]);
  const past = !s.active;

  const add = async (uid: string | null) => {
    if (!uid) return;
    const person = names.find(n => n.uid === uid);
    if (past && !time) { snack('Pick the check-in time first', { error: true }); return; }
    setBusy(true);
    const r = await act(api(`/api/sessions/${s.sid}/checkins`, 'POST', { uid, ...(past && isAdmin ? { ts: fromLocalInput(time) } : {}) }),
      `Checked in ${person?.name ?? ''}`);
    setBusy(false);
    if (r) setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="add-row">
      <div className="add-text">
        <h2 className="title-l" style={{ margin: 0 }}>Check someone in</h2>
        <p className="body-s muted" style={{ margin: '2px 0 0' }}>
          {past ? 'Adds a check-in to this past session at the time you choose.' : 'For anyone who forgot their ID. Pick their name to check them in now.'}
        </p>
      </div>
      <Combobox.Root items={items} value={null} onValueChange={v => void add(v as string | null)}
        inputValue={input} onInputValueChange={setInput} autoHighlight
        filter={(item: NameOnly, q: string) => nameMatches(item.name, q)}>
        <div className="field dense add-combo">
          <div className="field-box combo">
            <span className="combo-icon"><Icon name="search" /></span>
            <Combobox.Input ref={inputRef} className="field-input" placeholder=" " disabled={busy} aria-label="Name" />
            <label className="field-label" style={{ left: 36 }}>Type a name…</label>
          </div>
        </div>
        <Combobox.Portal>
          <Combobox.Positioner className="menu-positioner" sideOffset={4}>
            <Combobox.Popup className="menu combo-popup">
              <Combobox.Empty className="combo-empty body-m">
                {available.length ? 'No one on the roster matches.' : names.length ? 'Everyone on the roster is checked in.' : 'The roster is empty.'}
              </Combobox.Empty>
              <Combobox.List className="combo-list">
                {(n: NameOnly) => (
                  <Combobox.Item key={n.uid} value={n.uid} className="menu-item state combo-item">
                    <span>{n.name}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {past && isAdmin && (
        <TextField dense float label="Check-in time" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
      )}
    </div>
  );
}

async function copyText(text: string) {
  // navigator.clipboard needs https/localhost; fall back for plain-http LAN access.
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
}

// =====================================================================================
// Door counter
// =====================================================================================
const EMPTY: DoorDetail = { scans: [], exitLog: [], total: 0, inside: 0, exits: 0, ids: 0, nonId: 0, fastpass: 0, taps: 0, duplicates: 0, rejected: 0 };
const LABEL: Record<ScanStatus | 'checkout', string> = {
  accepted: 'Counted', fastpass: 'Fastpass', duplicate: 'Re-entry', blacklisted: 'Rejected', nonid: 'Non-ID', checkout: 'Checked out',
};
const TONE = { accepted: 'ok', fastpass: 'fastpass', duplicate: 'warn', blacklisted: 'bad', nonid: undefined, checkout: undefined } as const;

function DoorView({ ctx, s }: { ctx: AdminCtx; s: Viewed }) {
  const { ticks, isAdmin, status } = ctx;
  const detail = useLoad<DoorDetail>(isAdmin ? `/api/sessions/${s.sid}/door` : null, ticks.door, EMPTY);
  // Staff only get the public counts.
  const door = isAdmin ? detail : { ...EMPTY, total: status?.total ?? 0, inside: status?.inside ?? 0, exits: status?.exits ?? 0 };
  const lists = useLoad<Lists>(isAdmin ? '/api/lists' : null, ticks.lists, { blacklist: [], fastpass: [] });
  const [filter, setFilter] = React.useState('');
  const [showExits, setShowExits] = React.useState(true);

  const bl = new Set(lists.blacklist.map(b => b.id)), fp = new Set(lists.fastpass.map(b => b.id));
  type Ev = { at: string; status: ScanStatus | 'checkout'; id: string; n?: number };
  const events: Ev[] = door.scans.map((x, i) => ({ ...x, n: i + 1 }));
  const f = filter.trim();
  if (showExits && !f) for (const e of door.exitLog) events.push({ at: e.at, status: 'checkout', id: '' });
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const shown = events.filter(x => !f || (x.status !== 'nonid' && x.status !== 'checkout' && x.id.includes(f)));

  return (
    <>
      <div className="toolbar">
        {s.active && <>
          <LinkButton variant="outlined" icon="open_in_new" href="/checkout" target="_blank">Exit door page</LinkButton>
          <LinkButton variant="text" icon="open_in_new" href="/count" target="_blank">Public count</LinkButton>
        </>}
        <div className="spacer" />
        {isAdmin && <LinkButton variant="outlined" icon="download" href={`/api/sessions/${s.sid}/export.csv`}>Export CSV</LinkButton>}
      </div>

      <section className={isAdmin ? 'stats' : 'stats stats-staff'}>
        <div className="card stat hero">
          <div className="inside"><div className="n">{door.inside}</div><div className="k label-l">Inside now</div></div>
          <div><div className="n">{door.total}</div><div className="k label-l">Total in</div></div>
        </div>
        <Stat n={door.exits} k="Checked out" />
        {isAdmin && <>
          <Stat n={door.fastpass} k="Fastpass" />
          <Stat n={door.nonId} k="Non-ID" />
          <Stat n={door.duplicates} k="Re-entries" />
          <Stat n={door.rejected} k="Rejected" />
        </>}
      </section>
      <p className="body-s muted" style={{ margin: '-4px 0 0' }}>Total in counts unique IDs plus non-ID entries. Inside is every entry minus check-outs from the exit door page.</p>

      {isAdmin && (
        <div className="door-grid">
          <section className="card tbl-card">
            <div className="tbl-head">
              <h2 className="title-l">Activity</h2>
              <Checkbox checked={showExits} onChange={setShowExits}>Show check-outs</Checkbox>
              <TextField dense label="Filter by ID" lead="search" value={filter} onChange={e => setFilter(e.target.value)} inputMode="numeric" style={{ width: 160 }} />
            </div>
            <div className="table-wrap scroll-60">
              <table className="data">
                <thead><tr><th style={{ width: 48 }}>#</th><th>Time</th><th>ID</th><th>Result</th><th className="end" /></tr></thead>
                <tbody>
                  {shown.map((x, i) => {
                    const noId = x.status === 'nonid' || x.status === 'checkout';
                    return (
                      <tr key={i} className={x.status === 'checkout' ? 'exit' : undefined}>
                        <td className="muted num">{x.n ?? ''}</td>
                        <td className="num muted">{clockSec(x.at)}</td>
                        <td className={'id-cell num' + (noId ? ' non' : '')}>{x.status === 'nonid' ? 'Non-ID entry' : x.status === 'checkout' ? 'Someone left' : x.id}</td>
                        <td><Tag tone={TONE[x.status]}>{LABEL[x.status]}</Tag></td>
                        <td className="end">{!noId && (bl.has(x.id)
                          ? <span className="body-s muted">On blacklist</span>
                          : <>{fp.has(x.id) && <span className="body-s muted">On fastpass · </span>}
                            <Button variant="text" neutral small onClick={() => act(api('/api/lists/blacklist', 'POST', { id: x.id }), `${x.id} added to the blacklist`)}>Blacklist</Button></>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!shown.length && <div className="empty body-m">{events.length ? 'No matching activity.' : 'No scans yet.'}</div>}
            </div>
          </section>
          <div className="side">
            <IdList list="fastpass" items={lists.fastpass} title="Fastpass" color="#2367ce"
              help={<>Fastpass IDs flash blue with their own chime and count like a normal entry. <a href="/fastpass">Bulk import from a spreadsheet</a>.</>} />
            <IdList list="blacklist" items={lists.blacklist} title="Blacklist" color="var(--md-sys-color-error)"
              help="Blacklisted IDs flash red and don't count toward the total, including taps from before they were added." />
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ n, k }: { n: number; k: string }) {
  return <div className="card stat"><div className="n">{n}</div><div className="k label-m">{k}</div></div>;
}

function IdList({ list, items, title, help, color }: { list: 'fastpass' | 'blacklist'; items: ListEntry[]; title: string; help: React.ReactNode; color: string }) {
  const [id, setId] = React.useState(''); const [note, setNote] = React.useState('');
  const idRef = React.useRef<HTMLInputElement>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(id.trim())) { idRef.current?.focus(); snack('IDs must be exactly 9 digits', { error: true }); return; }
    if (await act(api(`/api/lists/${list}`, 'POST', { id: id.trim(), note: note.trim() }))) { setId(''); setNote(''); idRef.current?.focus(); }
  };
  return (
    <section className="card">
      <h2 className="title-l card-title"><span className="dot" style={{ background: color }} />{title} <span className="muted body-m">({items.length})</span></h2>
      <p className="body-s muted" style={{ margin: 0 }}>Kept across sessions. {help}</p>
      <form className="list-form" onSubmit={add}>
        <TextField dense label="9-digit GTID" value={id} onChange={e => setId(e.target.value)} inputRef={idRef} inputMode="numeric" maxLength={9} autoComplete="off" />
        <div className="row">
          <TextField dense label="Note (optional)" value={note} onChange={e => setNote(e.target.value)} autoComplete="off" />
          <Button variant="filled" type="submit">Add</Button>
        </div>
      </form>
      <ul className="id-list">
        {items.slice().reverse().map(b => (
          <li key={b.id}>
            <span className="id num">{b.id}</span><span className="note body-s">{b.note}</span>
            <Button variant="text" small neutral onClick={() => act(api(`/api/lists/${list}/${encodeURIComponent(b.id)}`, 'DELETE'))}>Remove</Button>
          </li>
        ))}
      </ul>
      {!items.length && <div className="body-s muted" style={{ paddingTop: 8 }}>No {title.toLowerCase()} IDs yet.</div>}
    </section>
  );
}
