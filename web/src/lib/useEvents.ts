import { useEffect, useRef, useState } from 'react';
import type { UpdateEvent } from './types';

/**
 * Subscribes to the server's live feed (/api/events). Calls `onUpdate` for every event
 * (the first one, type "hello", arrives on connect) and reports whether the feed is up.
 */
export function useEvents(onUpdate: (e: UpdateEvent) => void): boolean {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener('update', ev => cb.current(JSON.parse((ev as MessageEvent).data)));
    return () => es.close();
  }, []);
  return connected;
}
