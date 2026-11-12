import * as React from 'react';
import { Button, Checkbox, LinkButton, Tag, TextField, useConfirm } from '../../ui';
import { clockSec } from '../../lib/format';
import type { DoorDetail, ListEntry, Lists, ScanStatus } from '../../lib/types';
import { act, api, SessionPicker, useLoad, WrongModeBanner, type AdminCtx } from './shared';

const EMPTY: DoorDetail = { scans: [], exitLog: [], total: 0, inside: 0, exits: 0, ids: 0, nonId: 0, fastpass: 0, taps: 0, duplicates: 0, rejected: 0 };
const LABEL: Record<ScanStatus | 'checkout', string> = {
  accepted: 'Counted', fastpass: 'Fastpass', duplicate: 'Re-entry', blacklisted: 'Rejected', nonid: 'Non-ID', checkout: 'Checked out',
};
const TONE = { accepted: 'ok', fastpass: 'fastpass', duplicate: 'warn', blacklisted: 'bad', nonid: undefined, checkout: undefined } as const;

export function DoorTab({ status, sessions, ticks, viewSid, setViewSid, setMode }: AdminCtx) {
  const door = useLoad<DoorDetail>(viewSid && `/api/sessions/${viewSid}/door`, ticks.door, EMPTY);
  const lists = useLoad<Lists>('/api/lists', ticks.lists, { blacklist: [], fastpass: [] });
  const [filter, setFilter] = React.useState('');
  const [showExits, setShowExits] = React.useState(true);
  const confirm = useConfirm();

  const bl = new Set(lists.blacklist.map(b => b.id)), fp = new Set(lists.fastpass.map(b => b.id));
  type Ev = { at: string; status: ScanStatus | 'checkout'; id: string; n?: number };
  const events: Ev[] = door.scans.map((s, i) => ({ ...s, n: i + 1 }));
  const f = filter.trim();
  if (showExits && !f) for (const e of door.exitLog) events.push({ at: e.at, status: 'checkout', id: '' });
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const shown = events.filter(s => !f || (s.status !== 'nonid' && s.status !== 'checkout' && s.id.includes(f)));

  const newSession = async () => {
    if (!await confirm({
      title: 'Start a new door session?', confirm: 'Start new session',
      body: 'It becomes the active session, so Total, Inside and check-outs start from zero. The current session stays on the Sessions tab, and the fastpass list and blacklist carry over.',
    })) return;
    await act(api('/api/sessions', 'POST', { mode: 'door' }), 'New door session started');
  };

  return (
    <>
      <WrongModeBanner status={status} want="door" setMode={setMode} />
      <div className="toolbar">
        <SessionPicker sessions={sessions} viewSid={viewSid} setViewSid={setViewSid} />
        <div className="spacer" />
        <LinkButton variant="text" icon="open_in_new" href="/checkout" target="_blank">Exit door page</LinkButton>
        <LinkButton variant="text" icon="open_in_new" href="/count" target="_blank">Public count</LinkButton>
        <LinkButton variant="outlined" icon="download" href={viewSid ? `/api/sessions/${viewSid}/export.csv` : undefined} aria-disabled={!viewSid}>Export CSV</LinkButton>
        <Button variant="tonal" icon="add" onClick={newSession}>New door session</Button>
      </div>

      <section className="stats">
        <div className="card stat hero">
          <div className="inside"><div className="n">{door.inside}</div><div className="k label-l">Inside now</div></div>
          <div><div className="n">{door.total}</div><div className="k label-l">Total in</div></div>
        </div>
        <Stat n={door.exits} k="Checked out" />
        <Stat n={door.fastpass} k="Fastpass" />
        <Stat n={door.nonId} k="Non-ID" />
        <Stat n={door.duplicates} k="Re-entries" />
        <Stat n={door.rejected} k="Rejected" />
      </section>
      <p className="body-s muted" style={{ margin: '-4px 0 0' }}>Total in counts unique IDs plus non-ID entries. Inside is every entry minus check-outs from the exit door page.</p>

      <div className="door-grid">
        <section className="card tbl-card">
          <div className="tbl-head">
            <h2 className="title-m">Activity</h2>
            <Checkbox checked={showExits} onChange={setShowExits}>Show check-outs</Checkbox>
            <TextField dense label="Filter by ID" lead="search" value={filter} onChange={e => setFilter(e.target.value)} inputMode="numeric" style={{ width: 160 }} />
          </div>
          <div className="table-wrap scroll-60">
            <table className="data">
              <thead><tr><th style={{ width: 48 }}>#</th><th>Time</th><th>ID</th><th>Result</th><th className="end" /></tr></thead>
              <tbody>
                {shown.map((s, i) => {
                  const noId = s.status === 'nonid' || s.status === 'checkout';
                  return (
                    <tr key={i} className={s.status === 'checkout' ? 'exit' : undefined}>
                      <td className="muted num">{s.n ?? ''}</td>
                      <td className="num muted">{clockSec(s.at)}</td>
                      <td className={'id-cell num' + (noId ? ' non' : '')}>{s.status === 'nonid' ? 'Non-ID entry' : s.status === 'checkout' ? 'Someone left' : s.id}</td>
                      <td><Tag tone={TONE[s.status]}>{LABEL[s.status]}</Tag></td>
                      <td className="end">{!noId && (bl.has(s.id)
                        ? <span className="body-s muted">On blacklist</span>
                        : <>{fp.has(s.id) && <span className="body-s muted">On fastpass · </span>}
                          <Button variant="text" neutral small onClick={() => act(api('/api/lists/blacklist', 'POST', { id: s.id }), `${s.id} added to the blacklist`)}>Blacklist</Button></>)}
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
          <IdList list="fastpass" items={lists.fastpass} title="Fastpass" color="var(--flash-fastpass, #2367ce)"
            help={<>Fastpass IDs flash blue with their own chime and count like a normal entry. <a href="/fastpass">Bulk import from a spreadsheet</a>.</>} />
          <IdList list="blacklist" items={lists.blacklist} title="Blacklist" color="var(--md-sys-color-error)"
            help="Blacklisted IDs flash red and don't count toward the total, including taps from before they were added." />
        </div>
      </div>
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
    if (!/^\d{9}$/.test(id.trim())) { idRef.current?.focus(); return void act(Promise.reject(new Error('IDs must be exactly 9 digits'))); }
    if (await act(api(`/api/lists/${list}`, 'POST', { id: id.trim(), note: note.trim() }))) { setId(''); setNote(''); idRef.current?.focus(); }
  };
  return (
    <section className="card">
      <h2 className="title-m card-title"><span className="dot" style={{ background: color }} />{title} <span className="muted body-m">({items.length})</span></h2>
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
