import '../styles/base.css';
import '../styles/components.css';
import '../styles/admin.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Button, Checkbox, LinkButton, Radios, Tag, TextArea, useConfirm } from '../ui';
import { api, ApiError } from '../lib/api';
import { useEvents } from '../lib/useEvents';
import { plural } from '../lib/format';
import type { BulkResult, ListEntry, Lists } from '../lib/types';

type Kind = 'new' | 'have' | 'upd' | 'bl' | 'dup' | 'bad';
interface Line { ln: number; raw: string; id?: string; note: string; kind: Kind }
const KIND: Record<Kind, [string, 'ok' | 'warn' | 'bad' | 'fastpass' | 'primary' | undefined]> = {
  new: ['New', 'fastpass'], have: ['Already on list', undefined], upd: ['Note updated', 'primary'],
  bl: ['On blacklist (skipped)', 'bad'], dup: ['Repeated in paste', 'warn'], bad: ['No 9-digit ID (skipped)', 'bad'],
};
const fpApi = <T,>(url: string, method = 'GET', body?: unknown) => api<T>(url, method, body, '/fastpass');

// Find the 9-digit ID on each line; anything else on the line can become the note.
function parse(text: string, useNotes: boolean) {
  const out: { ln: number; raw: string; id?: string; note: string; bad?: true }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(/(?<!\d)\d{9}(?!\d)/);
    if (!m) { out.push({ ln: i + 1, raw: line, note: '', bad: true }); return; }
    let note = '';
    if (useNotes) {
      const rest = line.slice(0, m.index) + '\t' + line.slice(m.index! + 9);
      note = rest.split('\t').map(c => c.trim()).filter(c => c && !/^[.,;:|-]+$/.test(c)).join(' · ').slice(0, 200);
    }
    out.push({ ln: i + 1, raw: line, id: m[0], note });
  });
  return out;
}

function Fastpass() {
  const [lists, setLists] = React.useState<Lists>({ blacklist: [], fastpass: [] });
  const [text, setText] = React.useState('');
  const [useNotes, setUseNotes] = React.useState(true);
  const [mode, setMode] = React.useState<'add' | 'replace'>('add');
  const [result, setResult] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const confirm = useConfirm();

  const load = React.useCallback(async () => { try { setLists(await fpApi<Lists>('/api/lists')); } catch { /* shown on next action */ } }, []);
  useEvents(e => { if (e.type === 'hello' || e.type === 'fastpass' || e.type === 'blacklist') void load(); });

  const fp = React.useMemo(() => new Map<string, ListEntry>(lists.fastpass.map(f => [f.id, f])), [lists]);
  const bl = React.useMemo(() => new Set(lists.blacklist.map(b => b.id)), [lists]);
  const replace = mode === 'replace';

  const parsed: Line[] = React.useMemo(() => {
    const seen = new Set<string>();
    return parse(text, useNotes).map(p => {
      let kind: Kind;
      if (p.bad || !p.id) kind = 'bad';
      else if (seen.has(p.id)) kind = 'dup';
      else if (bl.has(p.id)) kind = 'bl';
      else if (!fp.has(p.id)) kind = 'new';
      else kind = p.note && p.note !== fp.get(p.id)!.note ? 'upd' : 'have';
      if (p.id) seen.add(p.id);
      return { ln: p.ln, raw: p.raw, id: p.id, note: p.note, kind };
    });
  }, [text, useNotes, fp, bl]);

  const counts: Partial<Record<Kind, number>> = {};
  for (const p of parsed) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const ids = new Set(parsed.map(p => p.id).filter(Boolean));
  const removed = replace ? [...fp.keys()].filter(id => !ids.has(id) || bl.has(id)).length : 0;
  const toSend = parsed.filter(p => p.kind !== 'bad' && p.kind !== 'dup' && p.kind !== 'bl');
  const changes = (counts.new ?? 0) + (counts.upd ?? 0) + removed;
  const disabled = busy || (replace ? toSend.length === 0 && removed === 0 : changes === 0);
  const label = replace ? `Replace list (${plural(toSend.length, 'ID')})`
    : `Import ${plural(counts.new ?? 0, 'new ID')}` + (counts.upd ? ` + ${plural(counts.upd, 'note update')}` : '');

  const doImport = async () => {
    if (replace && removed && !await confirm({ title: 'Replace the fastpass list?', confirm: 'Replace', danger: true,
      body: `${plural(removed, 'ID')} currently on it will be removed.` })) return;
    setBusy(true);
    try {
      const d = await fpApi<BulkResult>('/api/lists/fastpass/bulk', 'POST', { replace, items: toSend.map(p => ({ id: p.id, note: p.note })) });
      const parts = [`${d.added} added`];
      if (d.updated) parts.push(`${d.updated} notes updated`);
      if (d.unchanged) parts.push(`${d.unchanged} already on the list`);
      if (d.removed) parts.push(`${d.removed} removed`);
      if (d.skippedBlacklisted.length) parts.push(`${d.skippedBlacklisted.length} skipped (blacklisted)`);
      setResult({ text: `Done: ${parts.join(', ')}. The fastpass list now has ${plural(d.total, 'ID')}.` });
      setText(''); await load();
    } catch (e) { setResult({ text: e instanceof ApiError ? e.message : 'Import failed', bad: true }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <header className="appbar">
        <div className="appbar-row">
          <LinkButton variant="text" icon="arrow_back" href="/admin">Admin</LinkButton>
          <h1 className="appbar-title headline-s">Fastpass import</h1>
          <div className="spacer" />
          <span className="body-m muted">{plural(fp.size, 'ID')} on the fastpass list now</span>
        </div>
      </header>
      <main className="page">
        <div className="cols">
          <section className="card">
            <h2 className="title-l card-title">1. Paste IDs</h2>
            <p className="card-sub body-m muted">Paste a column from your spreadsheet, one GTID per line. You can copy several columns, like GTID and name; the 9-digit ID is found on each line.</p>
            <TextArea label="IDs" placeholder={'903123456\tAlex Kim\n903234567\n903345678'} value={text}
              onChange={e => { setText(e.target.value); setResult(null); }} style={{ minHeight: 320, width: '100%' }} className="full" />
            <div className="stack" style={{ gap: 0, margin: '12px 0' }}>
              <Checkbox checked={useNotes} onChange={setUseNotes}>Use the other columns on each line (like a name) as the note</Checkbox>
              <Radios<'add' | 'replace'> label="Import mode" value={mode} onChange={setMode} items={[
                { value: 'add', label: <><b>Add</b> to the current fastpass list</> },
                { value: 'replace', label: <><b>Replace</b> the whole list with this paste <span style={{ color: 'var(--md-sys-color-error)' }}>(IDs not in the paste are removed)</span></> },
              ]} />
            </div>
            <div className="toolbar">
              <Button variant="filled" icon="upload" disabled={disabled} onClick={doImport}>{label}</Button>
              <Button variant="text" onClick={() => { setText(''); setResult(null); }}>Clear</Button>
            </div>
            {result && <p className="body-m" role="status" style={{ margin: '16px 0 0', color: result.bad ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-success)' }}>{result.text}</p>}
          </section>

          <section className="card tbl-card">
            <div className="tbl-head" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <h2 className="title-l">2. Check the preview</h2>
              <div className="row" style={{ gap: 6 }}>
                {parsed.length ? (Object.keys(KIND) as Kind[]).filter(k => counts[k]).map(k => (
                  <Tag key={k} tone={KIND[k][1]}>{counts[k]} {KIND[k][0].toLowerCase().replace('id', 'ID')}</Tag>
                )) : <span className="body-m muted">Paste something to see a preview.</span>}
                {removed > 0 && <Tag tone="bad">{removed} will be removed</Tag>}
              </div>
            </div>
            <div className="table-wrap" style={{ maxHeight: 460 }}>
              <table className="data">
                <thead><tr><th>Line</th><th>ID</th><th>Note</th><th>Result</th></tr></thead>
                <tbody>
                  {parsed.map(p => (
                    <tr key={p.ln}>
                      <td className="muted num">{p.ln}</td>
                      {p.kind === 'bad'
                        ? <td colSpan={2} className="muted" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, wordBreak: 'break-all' }}>{p.raw}</td>
                        : <><td className="strong num">{p.id}</td><td>{p.note}</td></>}
                      <td><Tag tone={KIND[p.kind][1]}>{KIND[p.kind][0]}</Tag></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<AppShell><Fastpass /></AppShell>);
