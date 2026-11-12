import '../styles/base.css';
import '../styles/components.css';
import '../styles/kiosk.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Live } from '../ui';
import { useEvents } from '../lib/useEvents';
import type { PublicStatus } from '../lib/types';

// Public live count: no login, no IDs. Inside/total in door mode; checked-in count in attendance mode.
function Count() {
  const [s, setS] = React.useState<PublicStatus | null>(null);
  const [bump, setBump] = React.useState(false);
  const last = React.useRef<number | null>(null);
  const up = useEvents(e => setS(e));
  const door = s?.mode === 'door';
  const n = s ? (door ? s.inside : s.count) : null;
  React.useEffect(() => {
    if (n == null) return;
    if (last.current != null && n > last.current) { setBump(true); const t = setTimeout(() => setBump(false), 400); last.current = n; return () => clearTimeout(t); }
    last.current = n;
  }, [n]);
  return (
    <div className="kiosk">
      <main className="stage" style={{ paddingBottom: 0 }}>
        <div className="overline" style={{ fontSize: 'clamp(14px, 2.4vw, 22px)', lineHeight: 1.3 }}>{door ? 'Inside now' : 'Checked in'}</div>
        <div className="num" style={{
          font: '600 clamp(120px, 30vw, 300px)/1 var(--md-ref-typeface-plain)', fontVariantNumeric: 'tabular-nums',
          color: bump ? 'var(--md-sys-color-success)' : 'var(--md-sys-color-on-surface)', transition: bump ? 'none' : 'color .4s',
        }}>{n ?? '–'}</div>
        {door && <div className="body-l muted" style={{ fontSize: 'clamp(16px, 2.2vw, 22px)', marginTop: 16 }}>
          Total checked in tonight: <b className="num" style={{ color: 'var(--md-sys-color-on-surface)' }}>{s?.total}</b>
        </div>}
        {s?.session && <div className="body-m muted" style={{ marginTop: 8 }}>{s.session.name}</div>}
      </main>
      <div className="kfoot"><Live up={up} /></div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Count />);
