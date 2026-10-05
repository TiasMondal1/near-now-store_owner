/**
 * Headless (background / killed-app) notification handling. Imported from
 * index.ts BEFORE expo-router's entry so the task and Notifee's background
 * handler are registered in the global scope, as both libraries require.
 *
 *  • expo-notifications background task: fires on Android for a remote push
 *    received while the app is not in the foreground. For a new-order push
 *    it raises the Notifee full-screen ringing alert
 *    (lib/lockScreenAlert.ts) and dismisses the plain banner expo posted.
 *  • Notifee background event: Accept / Reject / tap on that alert while the
 *    app is not in the foreground.
 *
 * Everything is wrapped so a runtime without these native modules (Expo Go,
 * web) simply skips it.
 */
import { Platform } from "react-native";
import { handleLockScreenEvent, LOCK_SCREEN_ALERTS_AVAILABLE, showLockScreenOrderAlert } from "./lockScreenAlert";
import { registerOrderListenerTask } from "./orderListenerService";

export const NEW_ORDER_BACKGROUND_TASK = "near-now-new-order-background";

function findType(payload: any): string | null {
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

function findText(payload: any, key: "title" | "body"): string | null {
  const candidates = [
    payload?.notification?.request?.content?.[key],
    payload?.notification?.[key],
    payload?.data?.[key],
    payload?.data?.notification?.[key],
  ];
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c;
  return null;
}

if (Platform.OS === "android") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask(NEW_ORDER_BACKGROUND_TASK, async ({ data, error }) => {
      if (error || !LOCK_SCREEN_ALERTS_AVAILABLE) return;
      const type = findType(data);
      if (type && !type.includes("order")) return;
      await showLockScreenOrderAlert({
        title: findText(data, "title") ?? "New order request",
        body: findText(data, "body") ?? "Tap to accept or reject",
      });
      // The plain banner expo-notifications posted for the same push is now
      // redundant next to the ringing alert.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Notifications = require("expo-notifications") as typeof import("expo-notifications");
        const presented = await Notifications.getPresentedNotificationsAsync();
        await Promise.all(
          presented
            .filter((n) => {
              const d: any = n.request.content.data;
              return !d?.demo && (!d?.type || String(d.type).includes("order"));
            })
            .map((n) => Notifications.dismissNotificationAsync(n.request.identifier))
        );
      } catch {
        // best-effort
      }
    });
  } catch {
    // expo-task-manager unavailable (Expo Go / web)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifee = (require("@notifee/react-native") as typeof import("@notifee/react-native")).default;
    if (typeof notifee?.onBackgroundEvent === "function") {
      notifee.onBackgroundEvent(async ({ type, detail }) => {
        handleLockScreenEvent(type, detail);
      });
    }
  } catch {
    // Notifee unavailable
  }

  // "Store online — listening for orders" foreground service task.
  registerOrderListenerTask();
}
