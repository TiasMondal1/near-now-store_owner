// @expo/config-plugins pulls in an ES-module-only dependency (uuid) that this
// Jest setup cannot load, so its two manifest lookups are stood in for here.
// The real plugin is exercised end to end by `expo prebuild`.
jest.mock("@expo/config-plugins", () => ({
  withAndroidManifest: (config: unknown) => config,
  AndroidConfig: {
    Manifest: {
      getMainActivityOrThrow: (m: any) =>
        m.manifest.application[0].activity.find((a: any) => a.$["android:name"] === ".MainActivity"),
      getMainApplicationOrThrow: (m: any) => m.manifest.application[0],
    },
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { applyLockScreenAlertManifest } = require("../plugins/withLockScreenAlerts");

function manifest(activityAttrs: Record<string, string> = {}) {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      "uses-permission": [{ $: { "android:name": "android.permission.INTERNET" } }],
      application: [
        {
          $: { "android:name": ".MainApplication" },
          activity: [
            {
              $: { "android:name": ".MainActivity", ...activityAttrs },
              "intent-filter": [
                {
                  action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
                  category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

const permissions = (m: any) => m.manifest["uses-permission"].map((p: any) => p.$["android:name"]);
const mainActivity = (m: any) => m.manifest.application[0].activity[0].$;

describe("withLockScreenAlerts manifest changes", () => {
  it("never puts the whole app over the lock screen, and removes an old copy of that setting", () => {
    const m = applyLockScreenAlertManifest(manifest({ "android:showWhenLocked": "true", "android:turnScreenOn": "true" }));
    expect(mainActivity(m)["android:showWhenLocked"]).toBeUndefined();
    expect(mainActivity(m)["android:turnScreenOn"]).toBeUndefined();
    expect(mainActivity(m)["android:name"]).toBe(".MainActivity");
  });

  it("adds the alert and foreground-service permissions once, even when applied twice", () => {
    const m = applyLockScreenAlertManifest(applyLockScreenAlertManifest(manifest()));
    const names = permissions(m);
    for (const p of [
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.WAKE_LOCK",
    ]) {
      expect(names.filter((n: string) => n === p)).toHaveLength(1);
    }
    expect(names).toContain("android.permission.INTERNET");
  });

  it("declares Notifee's foreground service as special use, once", () => {
    const m = applyLockScreenAlertManifest(applyLockScreenAlertManifest(manifest()));
    const services = m.manifest.application[0].service.filter((s: any) => s.$["android:name"] === "app.notifee.core.ForegroundService");
    expect(services).toHaveLength(1);
    expect(services[0].$["android:foregroundServiceType"]).toBe("specialUse");
    expect(services[0].property).toHaveLength(1);
  });
});
