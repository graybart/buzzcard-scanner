// Shapes returned by ../../server.js. Keep in sync with the server.

export type Mode = 'attendance' | 'door';
export const MODE_NAME: Record<Mode, string> = { attendance: 'Attendance', door: 'Door counter' };

export interface SessionRef { sid: string; name: string; startTime: number | null; mode: Mode }

/** /api/status and every live-update event (safe to show anyone: no IDs). */
export interface PublicStatus {
  mode: Mode;
  session: SessionRef | null;
  count: number;   // attendance check-ins in the active session
  total: number;   // door: unique IDs + non-ID entries
  inside: number;  // door: entries minus check-outs
  exits: number;
}
export type UpdateType =
  | 'hello' | 'mode' | 'sessions' | 'checkins' | 'roster' | 'scan' | 'checkout' | 'blacklist' | 'fastpass';
export interface UpdateEvent extends PublicStatus { type: UpdateType }

export interface DoorSummary {
  total: number; inside: number; exits: number; ids: number; nonId: number;
  fastpass: number; taps: number; duplicates: number; rejected: number;
}
export interface Session {
  sid: string; name: string; createdAt: number; startTime: number | null; mode: Mode;
  count: number; door: DoorSummary; active: boolean;
}

export interface Person { uid: string; name: string; gtid: string }
export interface NameOnly { uid: string; name: string }
export interface Checkin { uid: string; name: string; gtid: string; ts: number; method: 'scan' | 'typed'; late: boolean }

export type ScanStatus = 'accepted' | 'fastpass' | 'duplicate' | 'blacklisted' | 'nonid';
export interface Scan { id: string; at: string; status: ScanStatus }
export interface DoorDetail extends DoorSummary { scans: Scan[]; exitLog: { at: string }[] }

export interface ListEntry { id: string; note: string; addedAt: string }
export interface Lists { blacklist: ListEntry[]; fastpass: ListEntry[] }

/** POST /api/scan and /api/checkin-name in attendance mode */
export interface AttendanceResult {
  mode: 'attendance';
  status: 'ok' | 'duplicate' | 'unknown' | 'nosession' | 'error';
  name?: string; ts?: number; count?: number; late?: boolean;
}
/** POST /api/scan in door mode */
export type DoorResult =
  | ({ mode: 'door'; scan: Scan } & PublicStatus)
  | ({ mode: 'door'; status: 'nosession' } & PublicStatus)
  | { mode: 'door'; status: 'wrongmode' }
  | { mode: 'door'; error: string };
export type ScanResult = AttendanceResult | DoorResult;

export interface BulkResult {
  added: number; updated: number; unchanged: number; skippedBlacklisted: string[];
  invalid: number; removed: number; total: number;
}
