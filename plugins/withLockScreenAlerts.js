/**
 * Expo config plugin — lets the incoming-order alert take over the lock
 * screen on Android (Notifee `fullScreenAction`).
 *
 * Android changes:
 *  • USE_FULL_SCREEN_INTENT — required to launch a full-screen notification
 *    while the device is locked / screen off. On Android 14+ non-call/alarm
 *    apps also need the user to allow it once in settings; the app prompts
 *    for that (lib/lockScreenAlert.ts maybeRequestFullScreenPermission).
 *  • VIBRATE / WAKE_LOCK — ring pattern and waking the screen.
 *  • MainActivity showWhenLocked + turnScreenOn — so the activity the
 *    full-screen intent launches is actually visible over the keyguard.
 */
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

const PERMISSIONS = [
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK",
  // Lets the Developer-tools demo trigger fire at the exact second; without
  // it Notifee falls back to an inexact alarm the OS may delay.
  "android.permission.SCHEDULE_EXACT_ALARM",
  // One-tap "Allow app to run in background?" dialog from the Order alert
  // setup screen (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS). Play asks
  // for a justification for this one, same as USE_FULL_SCREEN_INTENT.
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  // "Store online — listening for orders" foreground service
  // (lib/orderListenerService.ts). specialUse: the only type without the
  // Android 15 six-hour cap that fits "keep listening for incoming orders".
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
];

const NOTIFEE_SERVICE = "app.notifee.core.ForegroundService";

module.exports = function withLockScreenAlerts(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;

    manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] || [];
    for (const name of PERMISSIONS) {
      const present = manifest.manifest["uses-permission"].some((p) => p.$?.["android:name"] === name);
      if (!present) manifest.manifest["uses-permission"].push({ $: { "android:name": name } });
    }

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$["android:showWhenLocked"] = "true";
    mainActivity.$["android:turnScreenOn"] = "true";

    // Declare Notifee's foreground service with the specialUse type (required
    // on Android 14+) and the subtype property Play asks for.
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service || [];
    let svc = app.service.find((s) => s.$?.["android:name"] === NOTIFEE_SERVICE);
    if (!svc) {
      svc = { $: { "android:name": NOTIFEE_SERVICE } };
      app.service.push(svc);
    }
    svc.$["android:foregroundServiceType"] = "specialUse";
    svc.$["android:exported"] = "false";
    svc.property = svc.property || [];
    if (!svc.property.some((p) => p.$?.["android:name"] === "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE")) {
      svc.property.push({
        $: { "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE", "android:value": "listening_for_incoming_store_orders" },
      });
    }
    // tools:node="merge" so our attributes merge into Notifee's own declaration.
    manifest.manifest.$["xmlns:tools"] = manifest.manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
    svc.$["tools:node"] = "merge";

    return mod;
  });
};
