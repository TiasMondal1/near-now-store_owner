import { parseDbDate } from "../../lib/order-utils";

type OrderLike = { created_at?: unknown; placed_at?: unknown; order_code?: string | null };

/** Date embedded in an order code such as "NN20260924-0031" → local noon that day. */
export function dateFromOrderCode(code: string | null | undefined): Date | null {
  if (!code) return null;
  const m = code.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Best-effort timestamp for a store order: created_at → placed_at → order code. */
export function resolveOrderDate(o: OrderLike): Date | null {
  return parseDbDate(o.created_at) || parseDbDate(o.placed_at) || dateFromOrderCode(o.order_code);
}

/** "24 Sept 2026, 10:15 am" (en-IN), or the code-derived date, or "". */
export function resolveOrderDateStr(o: OrderLike): string {
  const fromTs = parseDbDate(o.placed_at) || parseDbDate(o.created_at);
  if (fromTs) {
    const date = fromTs.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const time = fromTs.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return time ? `${date}, ${time}` : date;
  }
  const d = dateFromOrderCode(o.order_code);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
}

/** "10:15 am · 24 Sept" (en-IN) for card captions, or null when unparseable. */
export function formatTimeDate(value: unknown): string | null {
  const d = parseDbDate(value);
  if (!d) return null;
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${time} · ${date}`;
}

/** "1 item" / "3 items". */
export function pluralItems(n: number): string {
  return `${n} item${n === 1 ? "" : "s"}`;
}
