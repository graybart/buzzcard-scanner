import * as React from 'react';
import { api as rawApi, ApiError } from '../../lib/api';
import { MODE_NAME, type Mode, type PublicStatus, type Session } from '../../lib/types';
import { Button, Select, snack } from '../../ui';

export type Topic = 'sessions' | 'checkins' | 'door' | 'lists' | 'roster';
export type Ticks = Record<Topic, number>;
export const TABS = ['checkins', 'door', 'sessions', 'roster'] as const;
export type TabName = (typeof TABS)[number];

export interface AdminCtx {
  status: PublicStatus | null; sessions: Session[]; ticks: Ticks;
  viewSid: string | null; setViewSid: (sid: string) => void; showTab: (t: TabName) => void;
  setMode: (m: Mode) => void;
}

/** Admin API call: a 401 sends the browser to the login page. */
export const api = <T,>(url: string, method = 'GET', body?: unknown) => rawApi<T>(url, method, body, '/admin');

/** Run an admin action; show a snackbar on failure (and `done` on success). Undefined if it failed. */
export async function act<T>(p: Promise<T>, done?: string): Promise<T | undefined> {
  try { const r = await p; if (done) snack(done); return r; }
  catch (e) { snack(e instanceof ApiError ? e.message : String(e), { error: true }); return undefined; }
}

/** Load `url` whenever `tick` or `url` changes. */
export function useLoad<T>(url: string | null, tick: number, initial: T): T {
  const [data, setData] = React.useState<T>(initial);
  React.useEffect(() => {
    if (!url || !tick) { if (!url) setData(initial); return; }
    let live = true;
    const h = window.setTimeout(async () => { const d = await act(api<T>(url)); if (live && d !== undefined) setData(d); }, 60);
    return () => { live = false; window.clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);
  return data;
}

export function SessionPicker({ sessions, viewSid, setViewSid }: Pick<AdminCtx, 'sessions' | 'viewSid' | 'setViewSid'>) {
  return (
    <Select<string>
      label="Session" value={viewSid} onChange={setViewSid} className="sess-pick" placeholder="No sessions yet"
      disabled={!sessions.length}
      items={sessions.map(s => ({ value: s.sid, label: s.name + (s.active ? ' (active)' : ''), meta: MODE_NAME[s.mode] }))}
    />
  );
}

/** Shown on a tab when the active session is in the other mode. */
export function WrongModeBanner({ status, want, setMode }: { status: PublicStatus | null; want: Mode; setMode: (m: Mode) => void }) {
  if (!status?.session || status.mode === want) return null;
  return (
    <div className="banner body-m" role="status">
      <span style={{ flex: 1 }}>
        The active session is in <b>{MODE_NAME[status.mode]}</b> mode, so the scanner isn't recording {want === 'door' ? 'door taps' : 'roster check-ins'} right now.
      </span>
      <Button variant="text" onClick={() => setMode(want)}>Switch to {MODE_NAME[want]}</Button>
    </div>
  );
}
