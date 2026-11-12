import * as React from 'react';
import { api as rawApi, ApiError } from '../../lib/api';
import type { Me, PublicStatus, Session } from '../../lib/types';
import { snack } from '../../ui';

export type Topic = 'sessions' | 'checkins' | 'door' | 'lists' | 'roster' | 'accounts';
export type Ticks = Record<Topic, number>;

/** Where the admin page is: a session (the active one when sid is null), or one of the menu pages. */
export type Route = { page: 'session'; sid: string | null } | { page: 'sessions' | 'roster' | 'accounts' };
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'sessions' || h === 'roster' || h === 'accounts') return { page: h };
  const m = h.match(/^session\/([\w-]+)$/);
  return { page: 'session', sid: m ? m[1] : null };
}
export const routeHash = (r: Route) => (r.page === 'session' ? (r.sid ? `#session/${r.sid}` : '#') : `#${r.page}`);

export interface AdminCtx {
  me: Me; isAdmin: boolean;
  status: PublicStatus | null; sessions: Session[]; ticks: Ticks;
  go: (r: Route) => void; newSession: () => void;
}

/** Admin API call: a 401 sends the browser to the login page. */
export const api = <T,>(url: string, method = 'GET', body?: unknown) => rawApi<T>(url, method, body, '/admin');

/** Run an action; show a snackbar on failure (and `done` on success). Undefined if it failed. */
export async function act<T>(p: Promise<T>, done?: string): Promise<T | undefined> {
  try { const r = await p; if (done) snack(done); return r; }
  catch (e) { snack(e instanceof ApiError ? e.message : String(e), { error: true }); return undefined; }
}

/** Load `url` whenever `tick` or `url` changes. */
export function useLoad<T>(url: string | null, tick: number, initial: T): T {
  const [data, setData] = React.useState<T>(initial);
  React.useEffect(() => {
    if (!url) { setData(initial); return; }
    if (!tick) return;
    let live = true;
    const h = window.setTimeout(async () => { const d = await act(api<T>(url)); if (live && d !== undefined) setData(d); }, 60);
    return () => { live = false; window.clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);
  return data;
}

/** Page heading used by the menu pages. */
export function PageHead({ title, sub, go, children }: { title: string; sub?: React.ReactNode; go: AdminCtx['go']; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <a className="back-link label-l" href="#" onClick={e => { e.preventDefault(); go({ page: 'session', sid: null }); }}>← Active session</a>
        <h2 className="headline-m" style={{ margin: '4px 0 0' }}>{title}</h2>
        {sub && <p className="body-m muted" style={{ margin: '4px 0 0' }}>{sub}</p>}
      </div>
      <div className="row">{children}</div>
    </div>
  );
}
