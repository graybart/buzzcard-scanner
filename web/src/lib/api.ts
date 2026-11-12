export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) { super(message); }
}

/**
 * JSON fetch helper. On 401 it sends the browser to the login page (for pages that need the
 * admin password) and never resolves, so callers don't have to handle that case.
 */
export async function api<T>(url: string, method = 'GET', body?: unknown, loginNext?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the check-in server", 0);
  }
  if (res.status === 401 && loginNext) {
    location.href = '/login?next=' + encodeURIComponent(loginNext);
    return new Promise<T>(() => {});
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty or non-JSON */ }
  const err = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : null;
  if (!res.ok || err) throw new ApiError(err || `Request failed (${res.status})`, res.status, data);
  return data as T;
}
