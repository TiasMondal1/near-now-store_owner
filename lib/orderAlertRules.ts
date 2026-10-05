/**
 * Pure decision rules for the incoming-order alerts — no React Native or
 * native modules, so they can be unit-tested (__tests__/orderAlertRules.test.ts).
 *
 * Fixes from the 2026-10-05 review of the incoming-order alert push:
 *  • Only a push of type "new_order" may start the ringing lock-screen alarm.
 *    The backend also sends "order_cancelled" and "order_items_added" to
 *    shopkeepers; matching on "contains order" rang both as a new order.
 *  • A lock-screen Accept / Reject is applied only to the order that rang,
 *    never to whichever order happens to be first in the popup queue, and a
 *    tap whose order never shows up is dropped instead of waiting for the
 *    next unrelated order.
 *  • Developer tools exist only in dev-client and preview builds.
 */
import type { Allocation } from "../components/orders/types";

export const NEW_ORDER_PUSH_TYPE = "new_order";

/** The `type` field of a push, wherever expo-notifications / FCM put it. */
export function findPushType(payload: any): string | null {
  const candidates = [
    payload?.data?.type,
    payload?.notification?.data?.type,
    payload?.notification?.request?.content?.data?.type,
    payload?.data?.body?.type,
  ];
  for (const c of candidates) if (typeof c === "string") return c;
  // FCM data messages sometimes arrive with `body` as a JSON string.
  const body = payload?.data?.body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.type === "string") return parsed.type;
    } catch {
      // not JSON
    }
  }
  return null;
}

/** The push title or body, wherever it was put. */
export function findPushText(payload: any, key: "title" | "body"): string | null {
  const candidates = [
    payload?.notification?.request?.content?.[key],
    payload?.notification?.[key],
    payload?.data?.[key],
    payload?.data?.notification?.[key],
  ];
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c;
  return null;
}

/**
 * True only for a newly received push of type "new_order". A notification
 * response (the user tapped a notification; it carries `actionIdentifier`)
 * and every other type — cancelled orders, added items, support replies, or
 * no type at all — is not a reason to ring.
 */
export function isNewOrderPush(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  if ("actionIdentifier" in payload) return false;
  return findPushType(payload) === NEW_ORDER_PUSH_TYPE;
}

/**
 * Accept / Reject buttons go on a lock-screen alert only when it knows which
 * order it is for. A push-triggered alert carries no order id, so it only
 * opens the app, where the popup shows the order to answer.
 */
export function lockScreenAlertHasOrderActions(data?: Record<string, string> | null): boolean {
  return typeof data?.allocation_id === "string" && data.allocation_id.length > 0;
}

/** How long a tapped lock-screen action waits for its order to load. */
export const LOCK_ACTION_TTL_MS = 90_000;

export type LockScreenTap = {
  action: "accept" | "reject" | "open";
  allocationId: string | null;
  /** When the action was tapped (epoch ms). */
  at: number;
};

export type LockScreenTapDecision =
  /** Answer exactly this order; `inQueue` false means it must be shown first. */
  | { kind: "apply"; alloc: Allocation; inQueue: boolean }
  /** The order has not loaded yet; ask again when the lists change. */
  | { kind: "wait" }
  /** Nothing to answer: a plain open, no order id, or the order never appeared. */
  | { kind: "drop"; reason: "open" | "no-order-id" | "expired" };

/**
 * Decide what a tapped lock-screen action does now. Matches by allocation id
 * only: the queued popup orders first, then the server's pending list (an
 * order already marked as rung after a restart is not queued again). Never
 * falls back to another order.
 */
export function resolveLockScreenTap(
  tap: LockScreenTap,
  queue: readonly Allocation[],
  serverPending: readonly Allocation[],
  now: number = Date.now()
): LockScreenTapDecision {
  if (tap.action === "open") return { kind: "drop", reason: "open" };
  if (!tap.allocationId) return { kind: "drop", reason: "no-order-id" };
  const queued = queue.find((a) => a.allocation_id === tap.allocationId);
  if (queued) return { kind: "apply", alloc: queued, inQueue: true };
  const pending = serverPending.find(
    (a) => a.allocation_id === tap.allocationId && a.alloc_status === "pending_acceptance"
  );
  if (pending) return { kind: "apply", alloc: pending, inQueue: false };
  if (now - tap.at > LOCK_ACTION_TTL_MS) return { kind: "drop", reason: "expired" };
  return { kind: "wait" };
}

/**
 * Developer tools (simulated orders, saved demo login) are compiled into
 * dev-client builds and EAS "preview" builds only. A release build is never
 * a dev build, so a release made with any other environment — including the
 * "development" value a local .env may carry — gets no tools.
 */
export function devToolsAvailable(environment: string | null | undefined, isDevBuild: boolean): boolean {
  return isDevBuild || environment === "preview";
}
