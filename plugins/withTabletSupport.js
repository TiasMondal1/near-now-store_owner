/**
 * Expo config plugin — enables tablet support on Android and iOS.
 *
 * Android changes:
 *  • Adds <supports-screens> declaring large + xlarge screen compatibility.
 *  • Changes screenOrientation from "portrait" to "fullSensor" so tablets
 *    can rotate to landscape while phones default to their natural orientation.
 *  • Removes the "portrait" lock on ML Kit's GmsBarcodeScanningDelegateActivity
 *    (pulled in transitively by expo-camera) via tools:replace, so Android 16
 *    large-screen devices don't flag an orientation restriction.
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

    // ── 3. Override the ML Kit barcode-scanner activity's portrait lock ───────
    // expo-camera pulls in com.google.android.gms:play-services-code-scanner,
    // whose GmsBarcodeScanningDelegateActivity is declared android:screenOrientation
    // = "portrait". Android 16 ignores this on large screens and Play Console
    // flags it, so we override it with tools:replace to allow all orientations.
    const gmsScannerName =
      "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity";
    const appNode = manifest.manifest.application?.[0];
    if (appNode) {
      appNode.activity = appNode.activity ?? [];
      const alreadyOverridden = appNode.activity.some(
        (a) => a.$?.["android:name"] === gmsScannerName
      );
      if (!alreadyOverridden) {
        appNode.activity.push({
          $: {
            "android:name": gmsScannerName,
            "android:screenOrientation": "fullSensor",
            "tools:replace": "android:screenOrientation",
          },
        });
      }
    }

    return mod;
  });
};
