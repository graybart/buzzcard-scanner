import '../styles/base.css';
import '../styles/components.css';
import '../styles/kiosk.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Button as BaseButton } from '@base-ui/react/button';
import { Button, LinkButton, Live } from '../ui';
import { useEvents } from '../lib/useEvents';
import type { PublicStatus } from '../lib/types';

// Exit-door phone page: one big −1 button. Needs the admin login.
function Checkout() {
  const [s, setS] = React.useState<PublicStatus | null>(null);
  const [msg, setMsg] = React.useState('');
  const [pulse, setPulse] = React.useState(false);
  const msgTimer = React.useRef(0);
  const up = useEvents(e => setS(e));
  const say = (t: string) => { setMsg(t); clearTimeout(msgTimer.current); msgTimer.current = window.setTimeout(() => setMsg(''), 2500); };

  const post = async (undo: boolean) => {
    try {
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(undo ? { undo: true } : {}) });
      if (r.status === 401) { location.href = '/login?next=/checkout'; return; }
      const d = await r.json();
      if (d.inside !== undefined) setS(d);
      if (!r.ok) say(d.error || 'Something went wrong');
      else if (undo) say('Undone');
      else { navigator.vibrate?.(40); setPulse(true); setTimeout(() => setPulse(false), 150); }
    } catch { say('Not recorded: server unreachable'); }
  };

  const off = !s?.session ? 'No active session' : s.mode !== 'door' ? 'The active session is an attendance session' : '';
  return (
    <div className="kiosk" style={{ padding: 'max(12px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))', userSelect: 'none', touchAction: 'manipulation' }}>
      <header className="row" style={{ minHeight: 48 }}>
        <Live up={up} /><div className="spacer" />
        <LinkButton variant="text" small href="/logout" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Log out</LinkButton>
      </header>
      <div className="row" style={{ justifyContent: 'space-around', margin: '2vh 0 3vh', textAlign: 'center' }}>
        <div><div className="overline">Inside</div><div className="num" style={{ font: '600 clamp(56px, 18vw, 96px)/1.1 var(--md-ref-typeface-plain)' }}>{s?.inside ?? '–'}</div></div>
        <div><div className="overline">Left</div><div className="num muted" style={{ font: '600 clamp(36px, 10vw, 56px)/1.1 var(--md-ref-typeface-plain)' }}>{s?.exits ?? '–'}</div></div>
      </div>
      <BaseButton
        className="state" disabled={!!off || !s || s.inside <= 0} onClick={() => post(false)}
        style={{
          flex: 1, minHeight: 200, width: '100%', border: 0, borderRadius: 'var(--md-sys-shape-xl)', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: off || !s || s.inside <= 0 ? 'var(--md-sys-color-surface-container-high)' : pulse ? '#e0554a' : 'var(--md-sys-color-primary-container)',
          color: off || !s || s.inside <= 0 ? 'var(--md-sys-color-on-surface-variant)' : 'var(--md-sys-color-on-primary-container)',
          transition: 'background 120ms',
        }}>
        <span style={{ font: '700 clamp(64px, 22vw, 120px)/1 var(--md-ref-typeface-plain)' }}>−1</span>
        <span className="title-m">{off || 'Tap when someone leaves'}</span>
      </BaseButton>
      <Button variant="outlined" neutral icon="undo" onClick={() => post(true)} disabled={!!off || !s || s.exits <= 0}
        style={{ marginTop: 16, height: 56, width: '100%', fontSize: 16 }}>Undo last check-out</Button>
      <div className="title-m" style={{ textAlign: 'center', minHeight: 28, marginTop: 12, color: 'var(--md-sys-color-secondary)' }} role="status">{msg}</div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Checkout />);
