/**
 * Lock-screen / background incoming-order alert, built on Notifee (Android).
 *
 * The in-app popup (components/IncomingOrderAlertHost) can only run while
 * the JS app is alive and in front. When a new-order push lands with the
 * app backgrounded or killed, the background task in
 * lib/backgroundNotifications.ts calls `showLockScreenOrderAlert`, which
 * posts a Notifee notification with:
 *   • fullScreenAction — takes over the lock screen / wakes the screen
 *   • loopSound on a dedicated channel with the order chime
 *   • Accept / Reject action buttons that open the app — only when the alert
 *     knows its order (`data.allocation_id`, set when the app itself raises
 *     the alert). A push carries no order id, so its alert has no buttons:
 *     a tap opens the app and the popup shows the order to answer.
 *
 * The tapped action is parked here (`takePendingLockScreenAction`) and the
 * popup host applies it to that exact order once it has loaded
 * (lib/orderAlertRules resolveLockScreenTap) — never to another order.
 * Demo orders (Developer tools) carry their data, so the same path works
 * offline for them; outside dev / preview builds a demo payload is ignored.
 *
 * Everything degrades to a no-op when Notifee's native module is missing
 * (Expo Go, web, an older dev client) — the standard heads-up notification
 * from expo-notifications is still shown by the OS.
 */
import { Platform } from "react-native";
import { emitOrdersChanged } from "./orderEvents";
import { emitDemoOrder } from "./demoOrderEvents";
import { DEV_TOOLS_AVAILABLE } from "./devToolsFlag";
import { lockScreenAlertHasOrderActions, type LockScreenTap } from "./orderAlertRules";

type Notifee = typeof import("@notifee/react-native");
type NotifeeModule = Notifee["default"];

let notifeeMod: Notifee | null = null;
try {
  // Resolved at runtime on purpose: the native module is absent in Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notifeeMod = require("@notifee/react-native") as Notifee;
  // Touch a native-backed method so a JS-only shim without the module throws here.
  if (typeof notifeeMod.default?.displayNotification !== "function") notifeeMod = null;
} catch {
  notifeeMod = null;
}

export const LOCK_SCREEN_ALERTS_AVAILABLE: boolean = Platform.OS === "android" && !!notifeeMod;

const CHANNEL_ID = "orders_ring_v1";
const NOTIFICATION_ID_PREFIX = "order-ring-";
/** A ringing lock-screen alert that nobody answers falls silent after this. */
const RING_TIMEOUT_MS = 60_000;

export type LockScreenAction = "accept" | "reject" | "open";
export type LockScreenAlertPayload = {
  title: string;
  body: string;
  /** Carried into the app on tap; `demo` (JSON allocation) marks a Developer-tools order. */
  data?: Record<string, string>;
  /** Show at this epoch ms instead of immediately (Developer-tools simulate). */
  at?: number;
  /** Stable id so a repeated push for the same order updates instead of stacking. */
  id?: string;
};

function notifee(): NotifeeModule | null {
  return notifeeMod?.default ?? null;
}

let channelReady: Promise<void> | null = null;
function ensureChannel(): Promise<void> {
  const n = notifee();
  const mod = notifeeMod;
  if (!n || !mod) return Promise.resolve();
  if (!channelReady) {
    channelReady = n
      .createChannel({
        id: CHANNEL_ID,
        name: "Incoming order ring",
        description: "Rings until you accept or reject a new order",
        importance: mod.AndroidImportance.HIGH,
        visibility: mod.AndroidVisibility.PUBLIC,
        // Resource name: expo-notifications' plugin already copies
        // assets/sounds/order_chime.wav into android res/raw.
        sound: "order_chime",
        vibration: true,
        vibrationPattern: [300, 700, 300, 700],
        bypassDnd: true,
      })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return channelReady;
}

let lastError: string | null = null;
/** Last failure from showLockScreenOrderAlert, for the Developer-tools screen. */
export function getLastLockScreenAlertError(): string | null {
  return lastError;
}

/** Post (or schedule) the full-screen ringing alert. Resolves to the notification id or null. */
export async function showLockScreenOrderAlert(payload: LockScreenAlertPayload): Promise<string | null> {
  const n = notifee();
  const mod = notifeeMod;
  if (!n || !mod || Platform.OS !== "android") return null;
  lastError = null;
  try {
    await ensureChannel();
    const id = payload.id ?? `${NOTIFICATION_ID_PREFIX}${Date.now()}`;
    const notification = {
      id,
      title: payload.title,
      body: payload.body,
      data: { type: "new_order", ...(payload.data ?? {}) },
      android: {
        channelId: CHANNEL_ID,
        category: mod.AndroidCategory.CALL,
        importance: mod.AndroidImportance.HIGH,
        visibility: mod.AndroidVisibility.PUBLIC,
        smallIcon: "notification_icon",
        color: "#FF6B00",
        colorized: true,
        loopSound: true,
        sound: "order_chime",
        vibrationPattern: [300, 700, 300, 700],
        lightUpScreen: true,
        ongoing: true,
        autoCancel: false,
        timeoutAfter: RING_TIMEOUT_MS,
        showTimestamp: true,
        fullScreenAction: { id: "default", launchActivity: "default" },
        pressAction: { id: "default", launchActivity: "default" },
        // Without an order id there is nothing a button could safely answer.
        ...(lockScreenAlertHasOrderActions(payload.data)
          ? {
              actions: [
                { title: "✓ Accept", pressAction: { id: "accept", launchActivity: "default" } },
                { title: "✕ Reject", pressAction: { id: "reject", launchActivity: "default" } },
              ],
            }
          : {}),
      },
    };
    if (payload.at && payload.at > Date.now() + 1000) {
      await n.createTriggerNotification(notification, {
        type: mod.TriggerType.TIMESTAMP,
        timestamp: payload.at,
        alarmManager: { allowWhileIdle: true },
      });
    } else {
      await n.displayNotification(notification);
    }
    return id;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn("[lockScreenAlert] failed to show:", e);
    return null;
  }
}

/** Silence and remove every ringing alert (popup took over, order answered, logout). */
export async function cancelLockScreenAlerts(): Promise<void> {
  const n = notifee();
  if (!n) return;
  try {
    const displayed = await n.getDisplayedNotifications();
    await Promise.all(
      displayed
        .filter((d) => d.notification.android?.channelId === CHANNEL_ID && d.notification.id)
        .map((d) => n.cancelNotification(d.notification.id as string))
    );
    const triggers = await n.getTriggerNotificationIds();
    await Promise.all(triggers.filter((id) => id.startsWith(NOTIFICATION_ID_PREFIX)).map((id) => n.cancelNotification(id)));
  } catch {
    // best-effort
  }
}

// ─── Tapped action → applied by the popup once the order is on screen ───────

let pending: LockScreenTap | null = null;
const PENDING_TTL_MS = 90_000;

/** The last tapped action, with the time it was tapped (the host expires it). */
export function takePendingLockScreenAction(): LockScreenTap | null {
  if (!pending) return null;
  const p = pending;
  pending = null;
  if (Date.now() - p.at > PENDING_TTL_MS) return null;
  return p;
}

const pendingListeners = new Set<() => void>();
export function onPendingLockScreenAction(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

/**
 * Shared handler for Notifee foreground + background events and the
 * cold-start initial notification. Records the action and nudges the app
 * to refetch (or raises the demo order) so the popup appears immediately.
 */
export function handleLockScreenEvent(type: number, detail: { notification?: { data?: Record<string, unknown> }; pressAction?: { id?: string } }): void {
  const mod = notifeeMod;
  if (!mod) return;
  const { EventType } = mod;
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
  const data = detail.notification?.data ?? {};
  const actionId = detail.pressAction?.id;
  const action: LockScreenAction = actionId === "accept" || actionId === "reject" ? actionId : "open";
  const allocationId = typeof data.allocation_id === "string" ? data.allocation_id : null;
  pending = { action, at: Date.now(), allocationId };

  if (typeof data.demo === "string" && DEV_TOOLS_AVAILABLE) {
    try {
      const alloc = JSON.parse(data.demo);
      pending.allocationId = alloc?.allocation_id ?? null;
      emitDemoOrder(alloc);
    } catch {
      // ignore malformed demo payload
    }
  } else {
    emitOrdersChanged();
  }
  pendingListeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore
    }
  });
}

let foregroundSub: (() => void) | null = null;
/** Call once the JS app is up (notifications.initialize). Safe to call repeatedly. */
export async function setupLockScreenAlertHandling(): Promise<void> {
  const n = notifee();
  if (!n) return;
  try {
    if (!foregroundSub) {
      foregroundSub = n.onForegroundEvent(({ type, detail }) => handleLockScreenEvent(type, detail));
    }
    // Cold start from a lock-screen alert: the press happened before JS existed.
    const initial = await n.getInitialNotification();
    if (initial) {
      handleLockScreenEvent(notifeeMod!.EventType.PRESS, {
        notification: initial.notification as { data?: Record<string, unknown> },
        pressAction: initial.pressAction,
      });
    }
  } catch {
    // best-effort
  }
}
