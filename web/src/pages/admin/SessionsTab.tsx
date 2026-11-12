import * as React from 'react';
import { Button, Select, Tag, TextField, useConfirm } from '../../ui';
import { dateTime, fromLocalInput, plural, toLocalInput } from '../../lib/format';
import { MODE_NAME, type Mode, type Session } from '../../lib/types';
import { act, api, type AdminCtx } from './shared';

const MODES = [{ value: 'attendance' as Mode, label: MODE_NAME.attendance }, { value: 'door' as Mode, label: MODE_NAME.door }];

export function SessionsTab({ status, sessions, showTab, setViewSid }: AdminCtx) {
  const [name, setName] = React.useState('');
  const [mode, setMode] = React.useState<Mode>('attendance');
  const [start, setStart] = React.useState('');
  const touched = React.useRef(false);
  React.useEffect(() => { if (!touched.current && status) setMode(status.mode); }, [status?.mode]);
  const confirm = useConfirm();
  const active = sessions.find(s => s.active);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = await act(api<Session>('/api/sessions', 'POST', { name, startTime: fromLocalInput(start), mode }), 'Session started');
    if (!s) return;
    setName(''); setStart(''); touched.current = false; setViewSid(s.sid);
    showTab(mode === 'door' ? 'door' : 'checkins');
  };
  const del = async (s: Session) => {
    if (await confirm({
      title: `Delete "${s.name}"?`, confirm: 'Delete', danger: true,
      body: `This deletes its ${plural(s.count, 'check-in')} and ${plural(s.door.taps, 'door tap')}. You can't undo this.`,
    })) await act(api(`/api/sessions/${s.sid}`, 'DELETE'), 'Session deleted');
  };

  return (
    <>
      <section className="card">
        <h2 className="title-l card-title">Start a session</h2>
        <p className="card-sub body-m muted">The new session becomes active right away, and every scan goes to it. In Attendance mode, taps after the start time are marked late.</p>
        <form className="toolbar" onSubmit={create}>
          <TextField dense label="Name" placeholder="e.g. Chapter Meeting 11/10" value={name} onChange={e => setName(e.target.value)} style={{ minWidth: 260 }} />
          <Select<Mode> label="Mode" items={MODES} value={mode} onChange={m => { touched.current = true; setMode(m); }} className="mode-pick" />
          <TextField dense float label="Start time (optional)" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
          <Button variant="filled" type="submit" icon="play_arrow">Start session</Button>
          <div className="spacer" />
          {active && <Button variant="outlined" icon="stop" onClick={() => act(api('/api/sessions/stop', 'POST'), 'Session stopped')}>Stop active session</Button>}
        </form>
      </section>

      <section className="card tbl-card">
        <div className="tbl-head"><h2 className="title-m">All sessions</h2></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Mode</th><th>Created</th><th>Late after</th><th className="end">Check-ins</th><th className="end">Door total</th><th className="end" /></tr></thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.sid}>
                  <td><span className="strong">{s.name}</span> {s.active && <Tag tone="ok">Active</Tag>}</td>
                  <td><Select<Mode> label={`Mode for ${s.name}`} items={MODES} value={s.mode} className="dense-select"
                    onChange={m => act(api(`/api/sessions/${s.sid}`, 'PATCH', { mode: m }), `Mode set to ${MODE_NAME[m]}`)} /></td>
                  <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{dateTime(s.createdAt)}</td>
                  <td><input type="datetime-local" className="field-input" aria-label={`Start time for ${s.name}`} defaultValue={toLocalInput(s.startTime)}
                    key={s.startTime ?? 'none'}
                    onChange={e => act(api(`/api/sessions/${s.sid}`, 'PATCH', { startTime: fromLocalInput(e.target.value) }), e.target.value ? 'Start time saved' : 'Start time cleared')} /></td>
                  <td className="end num">{s.count}</td>
                  <td className="end num">{s.door.total}</td>
                  <td className="end"><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {!s.active && <Button variant="text" small onClick={() => act(api(`/api/sessions/${s.sid}/activate`, 'POST'), 'Session activated')}>Make active</Button>}
                    <Button variant="text" danger small onClick={() => del(s)}>Delete</Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sessions.length && <div className="empty body-m">No sessions yet. Start one above.</div>}
        </div>
      </section>
    </>
  );
}
