/**
 * Build full URL from API_BASE whether it is `https://host` or `https://host/api`.
 * Path should be like `/auth/dev-login` (leading slash).
 */
export function apiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) {
    return `${base}${p}`;
  }
  return `${base}/api${p}`;
}
