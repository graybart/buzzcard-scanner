import '../styles/base.css';
import '../styles/components.css';
import '../styles/admin.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, FormDialog, Live, Segmented, SplitButton, Tag, TextField, useConfirm, type MenuEntry } from '../ui';
import { useEvents } from '../lib/useEvents';
import { fromLocalInput } from '../lib/format';
import { MODE_NAME, ROLE_NAME, type Me, type Mode, type PublicStatus, type Session, type UpdateEvent, type UpdateType } from '../lib/types';
import { act, api, parseRoute, routeHash, type AdminCtx, type Route, type Ticks, type Topic } from './admin/shared';
import { SessionView } from './admin/SessionView';
import { SessionsPage } from './admin/SessionsPage';
import { RosterPage } from './admin/RosterPage';
import { AccountsPage } from './admin/AccountsPage';

// Which data each live update makes stale.
const STALE: Record<UpdateType, Topic[]> = {
  hello: ['sessions', 'checkins', 'door', 'lists', 'roster', 'accounts'],
  sessions: ['sessions', 'checkins', 'door'], checkins: ['sessions', 'checkins'],
  roster: ['roster'], scan: ['sessions', 'door'], checkout: ['sessions', 'door'],
  blacklist: ['lists', 'door', 'sessions'], fastpass: ['lists', 'door', 'sessions'], accounts: ['accounts'],
};

function Admin() {
  const [me, setMe] = React.useState<Me | null>(null);
  const [status, setStatus] = React.useState<PublicStatus | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [ticks, setTicks] = React.useState<Ticks>({ sessions: 0, checkins: 0, door: 0, lists: 0, roster: 0, accounts: 0 });
  const [route, setRoute] = React.useState<Route>(() => parseRoute(location.hash));
  const [newOpen, setNewOpen] = React.useState(false);
  const confirm = useConfirm();

  React.useEffect(() => { void act(api<Me>('/api/me')).then(m => m && setMe(m)); }, []);
  React.useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('popstate', onHash);
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('popstate', onHash); window.removeEventListener('hashchange', onHash); };
  }, []);
  const go = React.useCallback((r: Route) => {
    const h = routeHash(r);
    history.pushState(null, '', h === '#' ? location.pathname : h);
    setRoute(r); window.scrollTo(0, 0);
  }, []);

  const connected = useEvents((e: UpdateEvent) => {
    setStatus(e);
    setTicks(t => { const n = { ...t }; for (const k of STALE[e.type] ?? []) n[k]++; return n; });
  });

  const isAdmin = me?.role === 'admin';
  React.useEffect(() => {
    if (!ticks.sessions || !isAdmin) return;
    const h = window.setTimeout(async () => { const l = await act(api<Session[]>('/api/sessions')); if (l) setSessions(l); }, 120);
    return () => window.clearTimeout(h);
  }, [ticks.sessions, isAdmin]);

  if (!me) return null;
  const active = status?.session ?? null;
  const ctx: AdminCtx = { me, isAdmin, status, sessions, ticks, go, newSession: () => setNewOpen(true) };

  const endSession = async () => {
    if (!active) return;
    if (await confirm({ title: `End "${active.name}"?`, confirm: 'End session',
      body: 'The scanner stops recording until you start or reopen a session. Everything recorded so far stays on the All sessions page.' }))
      await act(api('/api/sessions/stop', 'POST'), 'Session ended');
  };
  const menu: MenuEntry[] = isAdmin ? [
    ...(active ? [{ label: 'End session', icon: 'stop' as const, onClick: endSession }] : []),
    { label: 'All sessions', icon: 'schedule', onClick: () => go({ page: 'sessions' }), separatorBefore: !!active },
    { label: 'Roster', icon: 'groups', onClick: () => go({ page: 'roster' }) },
    { label: 'Accounts', icon: 'how_to_reg', onClick: () => go({ page: 'accounts' }) },
    { label: 'Log out', icon: 'logout', href: '/logout', separatorBefore: true },
  ] : [{ label: 'Log out', icon: 'logout', href: '/logout' }];

  return (
    <>
      <header className="appbar">
        <div className="appbar-row">
          <div className="appbar-titles">
            <h1 className="appbar-title headline-m">
              <a href="#" onClick={e => { e.preventDefault(); go({ page: 'session', sid: null }); }}><span className="accent" aria-hidden />Check-in</a>
            </h1>
            <div className="session-line body-l">
              {active && status ? <>
                <b>{active.name}</b>
                <Tag tone={active.mode === 'door' ? 'fastpass' : 'primary'}>{MODE_NAME[active.mode]}</Tag>
                <span className="muted num">{active.mode === 'door' ? `${status.inside} inside · ${status.total} total` : `${status.count} checked in`}</span>
              </> : <span className="muted">No active session</span>}
              <Live up={connected} />
            </div>
          </div>
          <div className="spacer" />
          <SplitButton
            label={isAdmin ? 'New session' : undefined} icon="add" onClick={() => setNewOpen(true)}
            menuLabel="More" items={menu} soloLabel={me.username}
            header={<><div className="label-l">{me.username}</div><div className="body-s muted">{ROLE_NAME[me.role]}</div></>}
          />
        </div>
      </header>

      <main className="page">
        {route.page === 'session' && <SessionView {...ctx} sid={route.sid} />}
        {isAdmin && route.page === 'sessions' && <SessionsPage {...ctx} />}
        {isAdmin && route.page === 'roster' && <RosterPage {...ctx} />}
        {isAdmin && route.page === 'accounts' && <AccountsPage {...ctx} />}
      </main>

      {isAdmin && <NewSessionDialog open={newOpen} onOpenChange={setNewOpen} hasActive={!!active}
        onStarted={() => go({ page: 'session', sid: null })} />}
    </>
  );
}

function NewSessionDialog({ open, onOpenChange, hasActive, onStarted }: {
  open: boolean; onOpenChange: (o: boolean) => void; hasActive: boolean; onStarted: () => void;
}) {
  const [name, setName] = React.useState('');
  const [mode, setMode] = React.useState<Mode>('attendance');
  const [start, setStart] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setName(''); setStart(''); } }, [open]);
  const submit = async () => {
    setBusy(true);
    const s = await act(api<Session>('/api/sessions', 'POST', { name, mode, startTime: mode === 'attendance' ? fromLocalInput(start) : null }),
      'Session started');
    setBusy(false);
    if (s) { onOpenChange(false); onStarted(); }
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New session" submitLabel="Start session" onSubmit={submit} busy={busy}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="label-l">Type</span>
        <Segmented<Mode> label="Session type" value={mode} onChange={setMode}
          items={[{ value: 'attendance', label: 'Attendance' }, { value: 'door', label: 'Door counter' }]} />
        <span className="body-s muted">
          {mode === 'attendance'
            ? 'Roster check-in: shows names, marks late arrivals, and lets people type their name.'
            : 'Counts any 9-digit ID at the door, with fastpass, blacklist and an inside count.'}
          {' '}You can't change the type later.
        </span>
      </div>
      <TextField label="Name" placeholder={mode === 'attendance' ? 'e.g. Chapter Meeting 11/10' : 'e.g. Fall Social'}
        value={name} onChange={e => setName(e.target.value)} autoFocus
        support="Leave blank to use today's date and time." />
      {mode === 'attendance' && (
        <TextField float label="Start time (optional)" type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
          support="Check-ins after this time are marked late." />
      )}
      {hasActive && <p className="body-s muted" style={{ margin: 0 }}>
        This replaces the current active session. Its data stays on the All sessions page.</p>}
    </FormDialog>
  );
}

createRoot(document.getElementById('root')!).render(<AppShell><Admin /></AppShell>);
