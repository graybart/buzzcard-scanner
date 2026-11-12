import * as React from 'react';
import { Button, Checkbox, TextArea, TextField, useConfirm } from '../../ui';
import type { Person } from '../../lib/types';
import { act, api, PageHead, useLoad, type AdminCtx } from './shared';

const lines = (t: string) => t.replace(/\r/g, '').split('\n');
function trimTrailing(a: string[]) { while (a.length && !a[a.length - 1].trim()) a.pop(); return a; }

/** Names in one box and IDs in the other, or both columns pasted into the Names box. */
function parse(namesText: string, idsText: string) {
  let n = trimTrailing(lines(namesText)), ids = trimTrailing(lines(idsText));
  if (n.some(l => l.includes('\t')) && !idsText.trim()) {
    const split = n.map(l => l.split('\t'));
    const digitish = (col: number) => split.filter(r => /^\s*\d[\d\s]*$/.test(r[col] || '')).length;
    const idCol = digitish(1) >= digitish(0) ? 1 : 0, nameCol = 1 - idCol;
    n = split.map(r => (r[nameCol] || '').trim()); ids = split.map(r => (r[idCol] || '').trim());
  }
  return { n, ids };
}

export function RosterPage({ ticks, go }: AdminCtx) {
  const roster = useLoad<Person[]>('/api/roster', ticks.roster, []);
  const [names, setNames] = React.useState(''); const [ids, setIds] = React.useState('');
  const [replace, setReplace] = React.useState(false);
  const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const [q, setQ] = React.useState('');
  const confirm = useConfirm();

  const { n, ids: idRows } = parse(names, ids);
  const mismatch = n.length > 0 && idRows.length > 0 && n.length !== idRows.length;

  const doImport = async () => {
    if (!n.length) return setMsg({ text: 'Paste some names first.', bad: true });
    if (n.length !== idRows.length) return setMsg({ text: `Row counts don't match (${n.length} names, ${idRows.length} IDs).`, bad: true });
    const entries: { name: string; id: string }[] = [], skipped: number[] = [];
    n.forEach((name, i) => {
      const id = idRows[i].replace(/\s+/g, '');
      if (!name.trim() && !id) return;
      if (!name.trim() || !/\d/.test(id)) skipped.push(i + 1); // blank or header rows like "Name / GTID"
      else entries.push({ name: name.trim(), id });
    });
    if (replace && !await confirm({ title: 'Replace the entire roster?', confirm: 'Replace', danger: true,
      body: 'People who aren’t in this paste are removed from the roster. Their past check-ins are kept.' })) return;
    const r = await act(api<{ added: number; updated: number; total: number }>('/api/roster', 'POST', { entries, replace }));
    if (!r) return;
    setMsg({ text: `Added ${r.added}, updated ${r.updated}. The roster now has ${r.total}.`
      + (skipped.length ? ` Skipped row${skipped.length > 1 ? 's' : ''} ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''} (blank name or no digits in the ID).` : '') });
    setNames(''); setIds(''); setReplace(false);
  };

  const ql = q.trim().toLowerCase();
  const rows = ql ? roster.filter(p => p.name.toLowerCase().includes(ql) || p.gtid.includes(ql)) : roster;

  return (
    <>
      <PageHead title="Roster" go={go} sub="The people who can check in to attendance sessions." />
      <section className="card">
        <h2 className="title-l card-title">Add people</h2>
        <p className="card-sub body-m muted">
          Copy the Name column from your spreadsheet into the left box and the ID column into the right box, in the same row order.
          You can also paste both columns into the left box and they'll be split for you.
        </p>
        <div className="cols">
          <TextArea label={`Names${n.length ? ` (${n.length})` : ''}`} placeholder={'Jane Smith\nJohn Doe'} value={names} onChange={e => setNames(e.target.value)} />
          <TextArea label={`ID numbers${idRows.length ? ` (${idRows.length})` : ''}`} placeholder={'903123456\n903654321'} value={ids} onChange={e => setIds(e.target.value)} />
        </div>
        <div className="toolbar" style={{ marginTop: 16 }}>
          <Button variant="filled" icon="upload" onClick={doImport}>Add or update roster</Button>
          <Checkbox checked={replace} onChange={setReplace}>Replace the entire roster</Checkbox>
          {mismatch
            ? <span className="body-m" style={{ color: 'var(--md-sys-color-error)' }}>Row counts don't match ({n.length} names, {idRows.length} IDs)</span>
            : msg && <span className="body-m" style={{ color: msg.bad ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-success)' }}>{msg.text}</span>}
        </div>
      </section>

      <section className="card tbl-card">
        <div className="tbl-head">
          <h2 className="title-m">Roster <span className="muted body-m">({roster.length})</span></h2>
          <TextField dense label="Search" lead="search" value={q} onChange={e => setQ(e.target.value)} />
          <Button variant="outlined" danger icon="delete" disabled={!roster.length} onClick={async () => {
            if (await confirm({ title: `Clear all ${roster.length} people?`, body: 'Past check-ins are kept.', confirm: 'Clear roster', danger: true }))
              await act(api('/api/roster', 'DELETE'), 'Roster cleared');
          }}>Clear roster</Button>
        </div>
        <div className="table-wrap scroll-520">
          <table className="data">
            <thead><tr><th>Name</th><th>ID</th><th className="end" /></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.uid}>
                  <td className="strong">{p.name}</td><td className="num muted">{p.gtid}</td>
                  <td className="end"><Button variant="text" neutral small onClick={async () => {
                    if (await confirm({ title: `Remove ${p.name} from the roster?`, body: 'Their past check-ins are kept.', confirm: 'Remove', danger: true }))
                      await act(api(`/api/roster/${p.uid}`, 'DELETE'));
                  }}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty body-m">{roster.length ? 'No matches.' : 'The roster is empty. Paste names and IDs above.'}</div>}
        </div>
      </section>
    </>
  );
}
