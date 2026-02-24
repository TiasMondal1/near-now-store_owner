/**
 * Safe fetch + JSON parse. Use instead of res.json() to avoid crashes when the
 * server returns HTML (e.g. 404 page) instead of JSON.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ res: Response; json: T | null }> {
  const res = await fetch(url, options);
  const raw = await res.text();
  let json: T | null = null;
  try {
    json = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Server returned HTML or non-JSON
  }
  return { res, json };
}
