/**
 * "Store online — listening for orders" foreground service (Android).
 *
 * While the shopkeeper's store is online, a Notifee foreground service keeps
 * the app process (and so the JS runtime, the Supabase realtime socket and
 * a slow background poll) alive. A new pending order is then detected by
 * the app itself and raised as the Notifee lock-screen ringing alert
 * (lib/lockScreenAlert) — no dependency on the push arriving on time, and
 * OEM battery managers stop freezing the app.
 *
 * The cost is the ongoing, silent "Store online" notification Android
 * requires for any foreground service. It is removed the moment the store
 * goes offline or the shopkeeper logs out.
 *
 * `registerOrderListenerTask` must run at app start (lib/backgroundNotifications).
 */
import { Platform } from "react-native";

type Notifee = typeof import("@notifee/react-native");
let notifeeMod: Notifee | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notifeeMod = require("@notifee/react-native") as Notifee;
  if (typeof notifeeMod.default?.registerForegroundService !== "function") notifeeMod = null;
} catch {
  notifeeMod = null;
}

export const ORDER_LISTENER_AVAILABLE: boolean = Platform.OS === "android" && !!notifeeMod;

const CHANNEL_ID = "order_listener_v1";
export const ORDER_LISTENER_NOTIFICATION_ID = "order-listener";

let running = false;
let stopResolver: (() => void) | null = null;
const listeners = new Set<(running: boolean) => void>();

export function isOrderListenerRunning(): boolean {
  return running;
}

export function onOrderListenerChange(listener: (running: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setRunning(v: boolean): void {
  if (running === v) return;
  running = v;
  listeners.forEach((l) => {
    try {
      l(v);
    } catch {
      // ignore
    }
  });
}

/** Register the (never-resolving) service task. Call once, at startup, before the app renders. */
export function registerOrderListenerTask(): void {
  if (!notifeeMod) return;
  try {
    notifeeMod.default.registerForegroundService(
      () =>
        new Promise<void>((resolve) => {
          stopResolver = resolve;
        })
    );
  } catch {
    // not available
  }
}

let channelReady: Promise<void> | null = null;
function ensureChannel(): Promise<void> {
  const mod = notifeeMod;
  if (!mod) return Promise.resolve();
  if (!channelReady) {
    channelReady = mod.default
      .createChannel({
        id: CHANNEL_ID,
        name: "Store online status",
        description: "Shown while your store is online and listening for orders",
        importance: mod.AndroidImportance.LOW,
        visibility: mod.AndroidVisibility.PUBLIC,
        vibration: false,
        sound: undefined,
      })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return channelReady;
}

/** Start (or refresh) the service. Safe to call repeatedly. */
export async function startOrderListener(storeName?: string | null): Promise<void> {
  const mod = notifeeMod;
  if (!mod || Platform.OS !== "android") return;
  try {
    await ensureChannel();
    await mod.default.displayNotification({
      id: ORDER_LISTENER_NOTIFICATION_ID,
      title: storeName ? `${storeName} is online` : "Store online",
      body: "Listening for new orders. Tap to open.",
      data: { type: "order_listener" },
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: [mod.AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SPECIAL_USE],
        ongoing: true,
        autoCancel: false,
        onlyAlertOnce: true,
        smallIcon: "notification_icon",
        color: "#0C831F",
        importance: mod.AndroidImportance.LOW,
        pressAction: { id: "default", launchActivity: "default" },
        showTimestamp: false,
      },
    });
    setRunning(true);
  } catch (e) {
    if (__DEV__) console.warn("[orderListener] start failed:", e);
  }
}

/** Stop the service and remove its notification. */
export async function stopOrderListener(): Promise<void> {
  const mod = notifeeMod;
  if (!mod) return;
  try {
    await mod.default.stopForegroundService();
    await mod.default.cancelNotification(ORDER_LISTENER_NOTIFICATION_ID).catch(() => {});
  } catch {
    // ignore
  }
  stopResolver?.();
  stopResolver = null;
  setRunning(false);
}
