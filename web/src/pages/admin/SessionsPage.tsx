import { Button, Tag, useConfirm } from '../../ui';
import { dateTime, fromLocalInput, plural, toLocalInput } from '../../lib/format';
import { MODE_NAME, type Session } from '../../lib/types';
import { act, api, PageHead, type AdminCtx } from './shared';

export function SessionsPage({ sessions, go, newSession }: AdminCtx) {
  const confirm = useConfirm();
  const del = async (s: Session) => {
    if (await confirm({
      title: `Delete "${s.name}"?`, confirm: 'Delete', danger: true,
      body: s.mode === 'door'
        ? `This deletes its ${plural(s.door.taps, 'door tap')}. You can't undo this.`
        : `This deletes its ${plural(s.count, 'check-in')}. You can't undo this.`,
    })) await act(api(`/api/sessions/${s.sid}`, 'DELETE'), 'Session deleted');
  };

  return (
    <>
      <PageHead title="All sessions" go={go}
        sub="Open a session to see or fix its check-ins. Making a session active sends new scans to it.">
        <Button variant="tonal" icon="add" onClick={newSession}>New session</Button>
      </PageHead>
      <section className="card tbl-card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Type</th><th>Created</th><th>Late after</th><th className="end">Count</th><th className="end" /></tr></thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.sid}>
                  <td>
                    <a className="row-link" href={`#session/${s.sid}`} onClick={e => { e.preventDefault(); go({ page: 'session', sid: s.active ? null : s.sid }); }}>{s.name}</a>
                    {' '}{s.active && <Tag tone="ok">Active</Tag>}
                  </td>
                  <td><Tag tone={s.mode === 'door' ? 'fastpass' : 'primary'}>{MODE_NAME[s.mode]}</Tag></td>
                  <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{dateTime(s.createdAt)}</td>
                  <td>{s.mode === 'attendance'
                    ? <input type="datetime-local" className="field-input" aria-label={`Start time for ${s.name}`} defaultValue={toLocalInput(s.startTime)}
                        key={s.startTime ?? 'none'}
                        onChange={e => act(api(`/api/sessions/${s.sid}`, 'PATCH', { startTime: fromLocalInput(e.target.value) }), e.target.value ? 'Start time saved' : 'Start time cleared')} />
                    : <span className="muted">—</span>}</td>
                  <td className="end num" style={{ whiteSpace: 'nowrap' }}>{s.mode === 'door' ? `${s.door.total} in` : `${s.count} checked in`}</td>
                  <td className="end"><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {!s.active && <Button variant="text" small onClick={() => act(api(`/api/sessions/${s.sid}/activate`, 'POST'), `"${s.name}" is now active`)}>Make active</Button>}
                    <Button variant="text" danger small onClick={() => del(s)}>Delete</Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sessions.length && <div className="empty body-m">No sessions yet.</div>}
        </div>
      </section>
    </>
  );
}
