/**
 * Normalize email for signup/API payloads and session storage.
 */
export function normalizeSignupEmail(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/** Looser than RFC; good enough for UX + most APIs. */
export function isPlausibleEmail(normalized: string): boolean {
  if (normalized.length < 5 || normalized.length > 254) return false;
  const at = normalized.indexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;
  const dot = normalized.lastIndexOf(".");
  return dot > at + 1 && dot < normalized.length - 1;
}

const INVALID_EMAIL_PLACEHOLDERS = /^(invalid|none|n\/a|null|undefined|\.{3,})$/i;

export function isGarbageEmail(value: string | undefined | null): boolean {
  const s = normalizeSignupEmail(String(value ?? ""));
  return s.length === 0 || INVALID_EMAIL_PLACEHOLDERS.test(s);
}

/** Prefer server value unless it is empty or a known bad placeholder. */
export function coalesceEmail(fromServer: unknown, fromForm: string): string {
  const formNorm = normalizeSignupEmail(fromForm);
  if (fromServer == null || fromServer === "") return formNorm;
  const s = normalizeSignupEmail(String(fromServer));
  if (isGarbageEmail(s)) return formNorm;
  return s;
}
