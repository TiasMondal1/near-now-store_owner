/**
 * Expo config plugin — declares tablet screen support on Android.
 *
 * Android changes:
 *  • Adds <supports-screens> declaring large + xlarge screen compatibility so
 *    Play lists the app for tablets.
 *
 * What this plugin deliberately does NOT do any more:
 *  • It used to rewrite MainActivity's screenOrientation from "portrait" to
 *    "fullUser". Android has no per-device-class manifest switch, so that
 *    applied to phones too and silently overrode `orientation: "portrait"`
 *    in app.config.js — every screen (tabs, OTP, invoice) would rotate to
 *    landscape although none was designed for it. Portrait is now kept
 *    everywhere; if tablet landscape is wanted later, do it at runtime with
 *    expo-screen-orientation gated on the device's smallest width.
 *  • It used to patch ML Kit's GmsBarcodeScanningDelegateActivity, which was
 *    only present because of the unused expo-camera dependency. That
 *    dependency has been removed, so the activity no longer exists.
 *
 * iOS: supportsTablet is set to true in app.config.js directly.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withTabletSupport(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;

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

    return mod;
  });
};
