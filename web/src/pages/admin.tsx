import '../styles/base.css';
import '../styles/components.css';
import '../styles/admin.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Tabs } from '@base-ui/react/tabs';
import { AppShell, LinkButton, Live, Segmented } from '../ui';
import { useEvents } from '../lib/useEvents';
import { MODE_NAME, type Mode, type PublicStatus, type Session, type UpdateEvent, type UpdateType } from '../lib/types';
import { act, api as adminApi, TABS, type AdminCtx, type TabName, type Ticks, type Topic } from './admin/shared';
import { CheckinsTab } from './admin/CheckinsTab';
import { DoorTab } from './admin/DoorTab';
import { SessionsTab } from './admin/SessionsTab';
import { RosterTab } from './admin/RosterTab';

// Which data each live update makes stale.
const STALE: Record<UpdateType, Topic[]> = {
  hello: ['sessions', 'checkins', 'door', 'lists', 'roster'],
  mode: ['sessions'], sessions: ['sessions', 'checkins', 'door'], checkins: ['sessions', 'checkins'],
  roster: ['roster'], scan: ['sessions', 'door'], checkout: ['sessions', 'door'],
  blacklist: ['lists', 'door', 'sessions'], fastpass: ['lists', 'door', 'sessions'],
};

function Admin() {
  const [status, setStatus] = React.useState<PublicStatus | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [ticks, setTicks] = React.useState<Ticks>({ sessions: 0, checkins: 0, door: 0, lists: 0, roster: 0 });
  const [viewSid, setViewSid] = React.useState<string | null>(null);
  const lastActive = React.useRef<string | null | undefined>(undefined);
  const [tab, setTab] = React.useState<TabName | null>(() => {
    const h = location.hash.slice(1) as TabName;
    return TABS.includes(h) ? h : null; // null until we know the mode
  });

  const showTab = React.useCallback((t: TabName) => { setTab(t); history.replaceState(null, '', '#' + t); }, []);
  React.useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1) as TabName; if (TABS.includes(h)) setTab(h); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const connected = useEvents((e: UpdateEvent) => {
    setStatus(e);
    setTab(t => t ?? (e.mode === 'door' ? 'door' : 'checkins'));
    setTicks(t => { const n = { ...t }; for (const k of STALE[e.type] ?? []) n[k]++; return n; });
  });

  // Sessions feed the picker, the badge and the Sessions tab. Debounced: taps can arrive quickly.
  React.useEffect(() => {
    if (!ticks.sessions) return;
    const h = window.setTimeout(async () => {
      const list = await act(adminApi<Session[]>('/api/sessions'));
      if (!list) return;
      setSessions(list);
      // Follow the active session when it changes; otherwise keep whatever the user picked.
      const activeSid = list.find(s => s.active)?.sid ?? null;
      const followActive = activeSid !== lastActive.current;
      lastActive.current = activeSid;
      setViewSid(v => (!followActive && v && list.some(s => s.sid === v) ? v : (activeSid ?? list[0]?.sid ?? null)));
    }, 120);
    return () => window.clearTimeout(h);
  }, [ticks.sessions]);

  const setMode = async (m: Mode) => {
    const s = await act(adminApi<PublicStatus>('/api/mode', 'POST', { mode: m }), `Switched to ${MODE_NAME[m]} mode`);
    if (s) { setStatus(s); showTab(m === 'door' ? 'door' : 'checkins'); }
  };

  const active = sessions.find(s => s.active);
  const ctx: AdminCtx = { status, sessions, ticks, viewSid, setViewSid, showTab, setMode };
  const mode = status?.mode ?? 'attendance';

  return (
    <Tabs.Root value={tab ?? 'checkins'} onValueChange={v => showTab(v as TabName)}>
      <header className="appbar">
        <div className="appbar-row">
          <h1 className="appbar-title headline-s"><span className="accent" aria-hidden />Check-in</h1>
          <Segmented<Mode> label="Scanner mode" value={mode} onChange={setMode}
            items={[{ value: 'attendance', label: 'Attendance' }, { value: 'door', label: 'Door counter' }]} />
          {!status?.session && status && (
            <span className="body-s muted" style={{ maxWidth: 220 }}>No active session. New sessions start in {MODE_NAME[mode]} mode.</span>
          )}
          <div className="spacer" />
          <div className="active-sess body-m">
            {active ? <>Active: <b>{active.name}</b><br /><span className="body-s">
              {active.mode === 'door' ? `${active.door.total} total · ${active.door.inside} inside` : `${active.count} checked in`}</span></>
              : 'No active session'}
          </div>
          <Live up={connected} />
          <LinkButton variant="text" icon="logout" href="/logout">Log out</LinkButton>
        </div>
        <Tabs.List className="tabs-list">
          <Tabs.Tab value="checkins" className="tab state">Check-ins</Tabs.Tab>
          <Tabs.Tab value="door" className="tab state">Door counter</Tabs.Tab>
          <Tabs.Tab value="sessions" className="tab state">Sessions</Tabs.Tab>
          <Tabs.Tab value="roster" className="tab state">Roster</Tabs.Tab>
          <Tabs.Indicator className="tabs-indicator" />
        </Tabs.List>
      </header>

      <Tabs.Panel value="checkins" className="page"><CheckinsTab {...ctx} /></Tabs.Panel>
      <Tabs.Panel value="door" className="page"><DoorTab {...ctx} /></Tabs.Panel>
      <Tabs.Panel value="sessions" className="page"><SessionsTab {...ctx} /></Tabs.Panel>
      <Tabs.Panel value="roster" className="page"><RosterTab {...ctx} /></Tabs.Panel>
    </Tabs.Root>
  );
}

createRoot(document.getElementById('root')!).render(<AppShell><Admin /></AppShell>);
