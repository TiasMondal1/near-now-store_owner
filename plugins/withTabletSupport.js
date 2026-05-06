/**
 * Expo config plugin — enables tablet support on Android and iOS.
 *
 * Android changes:
 *  • Adds <supports-screens> declaring large + xlarge screen compatibility.
 *  • Changes screenOrientation from "portrait" to "fullSensor" so tablets
 *    can rotate to landscape while phones default to their natural orientation.
 *
 * iOS: supportsTablet is set to true in app.config.js directly.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withTabletSupport(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;

    // ── 1. Add <supports-screens> to <manifest> root ─────────────────────────
    if (!manifest.manifest["supports-screens"]) {
      manifest.manifest["supports-screens"] = [
        {
          $: {
            "android:smallScreens": "true",
            "android:normalScreens": "true",
            "android:largeScreens": "true",
            "android:xlargeScreens": "true",
            "android:requiresSmallestWidthDp": "320",
          },
        },
      ];
    }

    // ── 2. Change screenOrientation to fullSensor on the main activity ────────
    // "fullSensor" lets Android use the device's natural orientation:
    // phones stay portrait-first, tablets rotate freely to landscape.
    const activities =
      manifest.manifest.application?.[0]?.activity ?? [];

    for (const activity of activities) {
      if (activity.$?.["android:name"] === ".MainActivity") {
        activity.$["android:screenOrientation"] = "fullSensor";
        // configChanges must include orientation so React Native handles
        // rotation without destroying the activity.
        const existing = activity.$["android:configChanges"] ?? "";
        if (!existing.includes("orientation")) {
          activity.$["android:configChanges"] = existing
            ? existing + "|orientation"
            : "orientation";
        }
        break;
      }
    }

    return mod;
  });
};
