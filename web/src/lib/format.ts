const pad = (n: number) => String(n).padStart(2, '0');

/** "7:42 PM" */
export const clock = (t: number | string) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** "7:42:05 PM" */
export const clockSec = (t: number | string) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
/** "Nov 4, 7:42 PM" */
export const dateTime = (t: number | string) =>
  new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Local "YYYY-MM-DD HH:MM:SS"; Google Sheets parses this as a date-time in any locale. */
export const sheetTime = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
/** epoch ms <-> <input type="datetime-local"> value, in this browser's time zone */
export const toLocalInput = (t: number | null) => {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : null);
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
