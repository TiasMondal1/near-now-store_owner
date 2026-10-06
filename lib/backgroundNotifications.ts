/**
 * Headless (background / killed-app) notification handling. Imported from
 * index.ts BEFORE expo-router's entry so the task and Notifee's background
 * handler are registered in the global scope, as both libraries require.
 *
 *  • expo-notifications background task: fires on Android for a remote push
 *    received while the app is not in the foreground. For a push of type
 *    "new_order" — and only that type — it raises the Notifee full-screen
 *    ringing alert (lib/lockScreenAlert.ts) and dismisses the plain banner
 *    expo posted. The task also runs for pushes received while the app is
 *    open and for notification taps; neither rings (the in-app popup
 *    already rings for an open app, and a tap is not a new order).
 *  • Notifee background event: Accept / Reject / tap on that alert while the
 *    app is not in the foreground.
 *
 * Everything is wrapped so a runtime without these native modules (Expo Go,
 * web) simply skips it.
 */
import { AppState, Platform } from "react-native";
import { handleLockScreenEvent, LOCK_SCREEN_ALERTS_AVAILABLE, showLockScreenOrderAlert } from "./lockScreenAlert";
import { registerOrderListenerTask } from "./orderListenerService";
import { NEW_ORDER_PUSH_TYPE, findPushText, findPushType, isNewOrderPush } from "./orderAlertRules";

export const NEW_ORDER_BACKGROUND_TASK = "near-now-new-order-background";

if (Platform.OS === "android") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask(NEW_ORDER_BACKGROUND_TASK, async ({ data, error }) => {
      if (error || !LOCK_SCREEN_ALERTS_AVAILABLE) return;
      // Only a new order rings — not a cancellation, added items, a support
      // reply, a push with no type, or the user tapping a notification.
      if (!isNewOrderPush(data)) return;
      // App open: the in-app popup (IncomingOrderAlertHost) rings already;
      // a second, lock-screen ring on top of it would play twice.
      if (AppState.currentState === "active") return;
      // The push carries no order id, so this alert has no Accept / Reject
      // buttons (lib/lockScreenAlert): a tap opens the app on the order.
      await showLockScreenOrderAlert({
        title: findPushText(data, "title") ?? "New order request",
        body: findPushText(data, "body") ?? "Tap to open the order",
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
              // Only the new-order banner the ringing alert replaces; a
              // cancellation or items-added banner must stay.
              return !d?.demo && findPushType({ data: d }) === NEW_ORDER_PUSH_TYPE;
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
