/**
 * Developer tools — TEMPORARY testing aids, present only in dev-client and
 * EAS preview builds (`DEV_TOOLS_AVAILABLE` is false in every other release
 * build, so every entry point that reads it renders nothing).
 *
 *  - Saved demo session: reuse one real OTP login for up to 30 days instead
 *    of paying Twilio for an OTP on every re-login. The token is the same
 *    backend-minted JWT a real login stores; nothing is bypassed server-side.
 *  - Simulated incoming order: raises a fake `pending_acceptance` allocation
 *    after a delay (plus a real local notification, so backgrounding the
 *    app exercises the OS / lock-screen path too). Demo orders never touch
 *    the backend — Accept/Reject on them are handled locally.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEV_TOOLS_AVAILABLE } from "./devToolsFlag";
import * as SecureStore from "expo-secure-store";
import { peekStoresAny } from "./appCache";
import { notificationService } from "./notifications";
import { DEMO_ALLOCATION_PREFIX, emitDemoOrder } from "./demoOrderEvents";
import { LOCK_SCREEN_ALERTS_AVAILABLE, cancelLockScreenAlerts, showLockScreenOrderAlert } from "./lockScreenAlert";
import type { UserSession } from "../session";
import type { Allocation } from "../components/orders/types";

/**
 * Dev-client and EAS "preview" builds only (lib/devToolsFlag). It used to be
 * "not production", which a release built from a local .env saying
 * "development" passed — shipping these tools to real shopkeepers.
 */
export { DEV_TOOLS_AVAILABLE };

/** Delay between tapping "Simulate" and the fake order arriving. */
export const DEMO_ORDER_DELAY_MS = 10_000;

// ─── Enabled flag (hide the tools without rebuilding) ────────────────────────

const ENABLED_KEY = "dev_tools_enabled_v1";
let enabledMem: boolean | null = null;
const enabledListeners = new Set<(v: boolean) => void>();

export async function isDevToolsEnabled(): Promise<boolean> {
  if (!DEV_TOOLS_AVAILABLE) return false;
  if (enabledMem != null) return enabledMem;
  try {
    const raw = await AsyncStorage.getItem(ENABLED_KEY);
    enabledMem = raw == null ? true : raw === "1";
  } catch {
    enabledMem = true;
  }
  return enabledMem;
}

export async function setDevToolsEnabled(v: boolean): Promise<void> {
  enabledMem = v;
  enabledListeners.forEach((l) => l(v));
  try {
    await AsyncStorage.setItem(ENABLED_KEY, v ? "1" : "0");
  } catch {
    // in-memory flag still applies for this run
  }
}

export function onDevToolsEnabledChange(listener: (v: boolean) => void): () => void {
  enabledListeners.add(listener);
  return () => {
    enabledListeners.delete(listener);
  };
}

// ─── Saved demo session ──────────────────────────────────────────────────────

const DEMO_SESSION_KEY = "dev_demo_session_v1";

export async function saveDemoSession(session: UserSession): Promise<void> {
  if (!DEV_TOOLS_AVAILABLE) return;
  await SecureStore.setItemAsync(DEMO_SESSION_KEY, JSON.stringify(session));
}

export async function loadDemoSession(): Promise<UserSession | null> {
  if (!DEV_TOOLS_AVAILABLE) return null;
  try {
    const raw = await SecureStore.getItemAsync(DEMO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed?.token || !parsed?.user?.id) return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearDemoSession(): Promise<void> {
  await SecureStore.deleteItemAsync(DEMO_SESSION_KEY).catch(() => {});
}

// ─── Simulated incoming order ────────────────────────────────────────────────

const DEMO_ITEMS: Omit<Allocation["items"][number], "id">[] = [
  { product_name: "Amul Taaza Milk 1L", quantity: 2, unit: "pcs", price: 68 },
  { product_name: "Britannia Brown Bread", quantity: 1, unit: "pcs", price: 55 },
  { product_name: "Tata Salt 1kg", quantity: 1, unit: "pcs", price: 28 },
];

export function buildDemoAllocation(now: number = Date.now()): Allocation {
  const stamp = now.toString(36).toUpperCase().slice(-5);
  const d = new Date(now);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const store = peekStoresAny()?.[0];
  return {
    allocation_id: `${DEMO_ALLOCATION_PREFIX}${now}`,
    order_id: `${DEMO_ALLOCATION_PREFIX}order-${now}`,
    order_code: `DEMO${ymd}-${stamp}`,
    alloc_status: "pending_acceptance",
    pickup_code: null,
    placed_at: new Date(now).toISOString(),
    store_id: store?.id,
    items: DEMO_ITEMS.map((it, i) => ({ ...it, id: `${DEMO_ALLOCATION_PREFIX}item-${now}-${i}` })),
    customer_area: "Demo Nagar",
    customer_distance: "1.2 km",
  };
}

/**
 * Build the JSON payload carried in the demo notification's `data`, so a tap
 * (even one that cold-starts the app) can rebuild the same fake order.
 */
export function demoNotificationData(alloc: Allocation): Record<string, unknown> {
  return { type: "new_order", demo: JSON.stringify(alloc) };
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNotificationId: string | null = null;
let pendingLockScreenId: string | null = null;

/** Which OS-level path the simulate button exercises on this build. */
export function demoNotificationMode(): "lock-screen" | "banner" | "none" {
  if (LOCK_SCREEN_ALERTS_AVAILABLE) return "lock-screen";
  return notificationService.isLocalSchedulingAvailable() ? "banner" : "none";
}

export function isDemoOrderScheduled(): boolean {
  return pendingTimer != null;
}

/**
 * Schedule a fake incoming order in `delayMs`. Fires both the in-app popup
 * (via the demo event bus) and a real local OS notification with the order
 * chime — put the app in the background or lock the phone to test that path.
 * Returns a cancel function.
 */
export async function scheduleDemoOrder(delayMs: number = DEMO_ORDER_DELAY_MS): Promise<() => void> {
  cancelDemoOrder();
  const alloc = buildDemoAllocation(Date.now() + delayMs);

  const title = "New order request";
  const body = `Order #${alloc.order_code} · ${alloc.items.length} items · ${alloc.customer_distance} away`;
  if (LOCK_SCREEN_ALERTS_AVAILABLE) {
    // Real lock-screen path: Notifee full-screen + looping chime, scheduled
    // via AlarmManager so it fires even with the app killed.
    pendingLockScreenId = await showLockScreenOrderAlert({
      id: `order-ring-${alloc.allocation_id}`,
      title,
      body,
      data: { demo: JSON.stringify(alloc), allocation_id: alloc.allocation_id },
      at: Date.now() + delayMs,
    });
  } else {
    try {
      pendingNotificationId = await notificationService.scheduleLocalNotification(
        title,
        body,
        demoNotificationData(alloc),
        Math.max(1, Math.round(delayMs / 1000))
      );
    } catch {
      pendingNotificationId = null;
    }
  }

  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    emitDemoOrder(alloc);
  }, delayMs);

  return cancelDemoOrder;
}

export function cancelDemoOrder(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingNotificationId) {
    void notificationService.cancelNotification(pendingNotificationId).catch(() => {});
    pendingNotificationId = null;
  }
  if (pendingLockScreenId) {
    void cancelLockScreenAlerts();
    pendingLockScreenId = null;
  }
}
