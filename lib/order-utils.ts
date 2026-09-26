import { colors, toneColors, type Tone } from "./theme";

function normalizeStatus(status: string | null | undefined): string {
  return (status || "").toLowerCase().trim().replace(/-/g, "_");
}

/**
 * Semantic tone for an order status.
 *
 *   pending_store / pending_at_store / pending_acceptance   → warning
 *   pending_review / under_review / in_review               → warning
 *   accepted / store_accepted / ready / ready_for_pickup    → info
 *   picked_up / delivered / order_delivered / completed     → success
 *   approved                                                → success
 *   rejected / cancelled                                    → error
 *   anything else                                           → neutral
 *
 * The review statuses cover verification / product-submission records so one
 * `Badge` mapping serves orders and approvals alike.
 */
export function getStatusTone(status: string | null | undefined): Tone {
  const s = normalizeStatus(status);
  switch (s) {
    case "pending_store":
    case "pending_at_store":
    case "pending_acceptance":
    case "pending":
    case "pending_review":
    case "under_review":
    case "in_review":
      return "warning";
    case "accepted":
    case "store_accepted":
    case "ready":
    case "ready_for_pickup":
      return "info";
    case "picked_up":
    case "delivered":
    case "order_delivered":
    case "completed":
    case "approved":
      return "success";
    case "rejected":
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}

/**
 * Solid status colour (the tone's `fill`). Prefer `getStatusTone` + `Badge`
 * in new code; this stays for callers that paint a single colour.
 */
export function getStatusColor(status: string | null | undefined): string {
  const tone = getStatusTone(status);
  if (tone === "neutral") return colors.textTertiary;
  return toneColors(tone).fill;
}

export function formatStatus(status: string | null | undefined): string {
  const s = normalizeStatus(status);
  switch (s) {
    case "pending_store":
    case "pending_at_store":
    case "pending_acceptance":
    case "pending":
      return "Pending";
    case "pending_review":
      return "Pending review";
    case "under_review":
    case "in_review":
      return "Under review";
    case "approved":
      return "Approved";
    case "accepted":
    case "store_accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "ready":
      return "Ready";
    case "ready_for_pickup":
      return "Ready for pickup";
    case "picked_up":
      return "Picked up";
    case "delivered":
    case "order_delivered":
    case "completed":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    default:
      return status ?? "";
  }
}

/**
 * Indian-style digit grouping ("12,34,567") without relying on Intl.
 */
function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

/**
 * Format a rupee amount for display: en-IN grouping, at most two decimals,
 * with a trailing ".00" stripped. `null`/`undefined`/NaN render as "₹0".
 *
 *   formatINR(1234567)   → "₹12,34,567"
 *   formatINR(99.5)      → "₹99.50"
 *   formatINR("250.00")  → "₹250"
 *   formatINR(-40, { symbol: false }) → "-40"
 */
export function formatINR(
  value: number | string | null | undefined,
  options: { symbol?: boolean } = {}
): string {
  const { symbol = true } = options;
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(safe);

  let formatted: string;
  try {
    formatted = abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Some engines ignore the locale and fall back to en-US grouping; detect
    // that and re-group by hand so the output is consistently Indian-style.
    if (abs >= 100000 && !/^\d{1,2},\d{2}(,\d{2})*,\d{3}\./.test(formatted)) {
      throw new Error("locale-fallback");
    }
  } catch {
    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split(".");
    formatted = groupIndian(intPart) + "." + decPart;
  }

  formatted = formatted.replace(/\.00$/, "");
  const sign = safe < 0 ? "-" : "";
  return sign + (symbol ? "₹" : "") + formatted;
}

/**
 * Parse a timestamp coming from Postgres / Supabase into a Date, or null.
 *
 * Why not `new Date(str)`: Postgres emits values like
 *   "2026-09-24T10:15:00.123456+00:00"   (6 fractional digits)
 *   "2026-09-24 10:15:00.12+00"          (space separator, bare "+00" offset)
 *   "2026-09-24T10:15:00"                (naive timestamp, no zone)
 * The ECMAScript date grammar only guarantees 3 fractional digits and a
 * "+HH:MM" offset. Hermes (the engine this app ships on Android) rejects
 * the others and returns Invalid Date, so orders silently dropped out of
 * "Today" / "Last 7 Days" and cards fell back to a date read from the
 * order code. This normalises every variant to strict ISO first, and as a
 * last resort parses the fields by hand.
 */
export function parseDbDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;

  // "YYYY-MM-DD HH:mm..." → "YYYY-MM-DDTHH:mm..."
  s = s.replace(/^(\d{4}-\d{2}-\d{2})[ ](\d)/, "$1T$2");
  // Fractional seconds: keep at most 3 digits.
  s = s.replace(/(\.\d{3})\d+/, "$1");
  // Offset "+HH" → "+HH:00", "+HHMM" → "+HH:MM" — only when a time part is
  // present, otherwise the "-24" of a bare "2026-09-24" would be mangled.
  if (/T\d{2}:\d{2}/.test(s)) {
    s = s.replace(/(T[\d:.]+)([+-]\d{2})$/, "$1$2:00").replace(/(T[\d:.]+)([+-]\d{2})(\d{2})$/, "$1$2:$3");
  }
  // Naive timestamp (has a time, no zone): Postgres/Supabase values are UTC.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(s)) s += "Z";

  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d;

  // Manual fallback for anything the engine still refuses.
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:\d{2})?$/
  );
  if (!m) return null;
  const [, Y, Mo, D, h = "0", mi = "0", sec = "0", ms = "0", zone] = m;
  let t = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +sec, +ms.padEnd(3, "0"));
  if (zone && zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const [zh, zm] = zone.slice(1).split(":").map(Number);
    t -= sign * (zh * 60 + zm) * 60_000;
  }
  const out = new Date(t);
  return Number.isFinite(out.getTime()) ? out : null;
}

/** True for every status `getStatusTone`/`formatStatus` treat as delivered. */
export function isDelivered(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "delivered" || s === "order_delivered" || s === "completed";
}
