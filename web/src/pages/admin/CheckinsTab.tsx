import { Button, snack, Tag, useConfirm } from '../../ui';
import { dateTime, plural, sheetTime } from '../../lib/format';
import type { Checkin } from '../../lib/types';
import { act, api, SessionPicker, useLoad, WrongModeBanner, type AdminCtx } from './shared';

export function CheckinsTab({ status, sessions, ticks, viewSid, setViewSid, setMode }: AdminCtx) {
  const checkins = useLoad<Checkin[]>(viewSid && `/api/sessions/${viewSid}/checkins`, ticks.checkins, []);
  const confirm = useConfirm();
  const lateN = checkins.filter(c => c.late).length;
  const rows = [...checkins].sort((a, b) => b.ts - a.ts);
  const session = sessions.find(s => s.sid === viewSid);

  const tsv = () => [...checkins].sort((a, b) => a.ts - b.ts)
    .map(c => [c.name.replace(/[\t\r\n]+/g, ' '), sheetTime(c.ts)].join('\t')).join('\n');

  const copy = async () => {
    if (!checkins.length) return snack('Nothing to copy yet');
    try {
      if (await copyText(tsv())) snack(`Copied ${plural(checkins.length, 'row')}. Paste into Google Sheets.`);
      else snack("Couldn't copy. Use Download instead.", { error: true });
    } catch { snack("Couldn't copy. Use Download instead.", { error: true }); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tsv()], { type: 'text/tab-separated-values' }));
    a.download = ((session?.name) || 'checkins').replace(/[^\w\- ]+/g, '_') + '.tsv';
    a.click(); URL.revokeObjectURL(a.href);
  };
  const remove = async (c: Checkin) => {
    if (await confirm({ title: `Remove ${c.name}'s check-in?`, body: 'They can tap in again afterwards.', confirm: 'Remove', danger: true }))
      await act(api(`/api/sessions/${viewSid}/checkins/${c.uid}`, 'DELETE'));
  };

  return (
    <>
      <WrongModeBanner status={status} want="attendance" setMode={setMode} />
      <div className="toolbar">
        <SessionPicker sessions={sessions} viewSid={viewSid} setViewSid={setViewSid} />
        {viewSid && <span className="body-m muted">{checkins.length} checked in{lateN ? ` · ${lateN} late` : ''}</span>}
        <div className="spacer" />
        <Button variant="outlined" icon="download" onClick={download} disabled={!checkins.length}>Download .tsv</Button>
        <Button variant="filled" icon="content_copy" onClick={copy} disabled={!checkins.length}>Copy for Google Sheets</Button>
      </div>
      <p className="body-s muted" style={{ margin: '-4px 0 0' }}>
        Copy, click the first empty cell in Google Sheets, and paste. You get two columns, name and check-in time, and the times paste as real date-times.
      </p>
      <section className="card tbl-card">
        <div className="table-wrap scroll-520">
          <table className="data">
            <thead><tr><th style={{ width: 48 }}>#</th><th>Name</th><th>ID</th><th>Time</th><th>How</th><th className="end" /></tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.uid}>
                  <td className="muted num">{rows.length - i}</td>
                  <td className="strong">{c.name}</td>
                  <td className="num muted">{c.gtid}</td>
                  <td className="num">{dateTime(c.ts)}</td>
                  <td><div className="row" style={{ gap: 6 }}>
                    <Tag>{c.method === 'typed' ? 'Typed name' : 'ID tap'}</Tag>{c.late && <Tag tone="warn">Late</Tag>}
                  </div></td>
                  <td className="end"><Button variant="text" neutral small onClick={() => remove(c)}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty body-m">{viewSid ? 'No check-ins yet.' : 'No sessions yet. Start one on the Sessions tab.'}</div>}
        </div>
      </section>
    </>
  );
}

async function copyText(text: string) {
  // navigator.clipboard needs https/localhost; fall back for plain-http LAN access.
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
}
