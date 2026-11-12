import '../styles/base.css';
import '../styles/components.css';
import '../styles/admin.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, TextField } from '../ui';

// A plain form POST: the server checks the password and redirects back with a login cookie.
function Login() {
  const q = new URLSearchParams(location.search);
  const next = q.get('next') || '/admin';
  const [busy, setBusy] = React.useState(false);
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form method="post" action="/login" className="card" onSubmit={() => setBusy(true)}
        style={{ width: 'min(380px, 100%)', padding: '32px 28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 className="headline-s appbar-title" style={{ margin: 0 }}><span className="accent" aria-hidden />Check-in</h1>
          <p className="body-m muted" style={{ margin: '8px 0 0' }}>Log in to manage sessions and the roster.</p>
        </div>
        <input type="hidden" name="next" value={next} />
        <TextField label="Username" name="username" required autoFocus={!q.get('user')} autoComplete="username" autoCapitalize="none"
          defaultValue={q.get('user') ?? undefined} />
        <TextField label="Password" name="password" type="password" required autoFocus={!!q.get('user')} autoComplete="current-password"
          support={q.has('error') ? <span style={{ color: 'var(--md-sys-color-error)' }}>That username and password don't match. Try again.</span> : undefined} />
        <Button variant="filled" type="submit" disabled={busy} icon="login">Log in</Button>
        <p className="body-s muted" style={{ margin: 0, textAlign: 'center' }}>Just want the count? <a href="/count">See the live count</a></p>
      </form>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Login />);
