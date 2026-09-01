// Single-source dynamic Expo config (no app.json).
// Uses EXPO_PUBLIC_API_BASE_URL and your custom logo for icons.

const fs = require("fs");
const path = require("path");
const withAbiSplits = require("./plugins/withAbiSplits");
const withTabletSupport = require("./plugins/withTabletSupport");
const withRemoveMediaPermissions = require("./plugins/withRemoveMediaPermissions");

// This app's android/app/build.gradle (and root build.gradle/settings.gradle/
// gradlew) were deleted from git by an errant "cleanup" commit (ec154b4,
// 2026-08-27) and never restored — confirmed via `git ls-files` and `find`,
// neither shows them tracked or present on disk as of HEAD. Despite that,
// `eas build` still succeeds and produces ABI-split APKs (app-arm64-v8a-*,
// app-armeabi-v7a-*, matching the `withAbiSplits` config-plugin below) —
// meaning EAS Build is silently falling back to a fresh `expo prebuild` from
// this file, NOT using a hand-maintained native android/ project the way the
// comment below this block used to claim. That comment was correct when
// written, before the native files were deleted; it is not correct now.
// Root cause of shopkeeper push notifications never arriving (found
// 2026-09-01, direct comparison against the rider app which DOES receive
// pushes): with no `googleServicesFile` field here, a prebuild-generated
// android/ project has no Firebase wiring at all — confirmed by extracting
// a real built APK and finding zero occurrences of this project's
// `mobilesdk_app_id` anywhere in it. `copy-google-services-json.js` (the
// eas-build-post-install hook) still copies the file into
// android/app/google-services.json, but with no build.gradle to apply
// `com.google.gms.google-services` against it, the copied file is inert.
// Guarded the same way nearandnowcustomerapp/app.config.js and
// NAT_Near-Now_Rider-/app.config.js already do it (that pattern is exactly
// what makes rider push notifications work) — an ungated field would throw
// during prebuild whenever the file isn't present at all (e.g. local
// checkouts without it).
const googleServicesFilePath =
  process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "google-services.json");
const hasGoogleServicesFile = fs.existsSync(googleServicesFilePath);

module.exports = () => {
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    "";

  return {
    name: "Near & Now Shopkeeper",
    slug: "shopkeeperapp",
    version: "1.0.0",
    orientation: "portrait",
    // App icon used on the device / launcher
    icon: "./near_now_shopkeeper.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./near_now_shopkeeper.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.nearandnow.shopkeeper",
      buildNumber: "1",
      // Native Google Maps SDK (tiles) — required for MapView on iOS release builds
      config: {
        googleMapsApiKey,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./near_now_shopkeeper_foreground.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.nearandnow.shopkeeper",
      // See the top-of-file comment: EAS Build has been silently prebuilding
      // this app fresh (the native android/ this comment used to describe no
      // longer exists), so it needs the same googleServicesFile config-plugin
      // wiring the customer/rider apps already use — guarded so a checkout
      // without the file (or a prebuild-preflight quirk) doesn't fail outright.
      ...(hasGoogleServicesFile ? { googleServicesFile: googleServicesFilePath } : {}),
      versionCode: 16,
      jsEngine: "hermes",
      // Native Maps SDK meta-data — required for MapView tiles on Android
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    web: {
      favicon: "./near_now_shopkeeper.png",
    },
    owner: "near-and-now-organization",
    scheme: "nearandnow-shopkeeper",
    updates: {
      url: "https://u.expo.dev/f0f709ec-f013-416a-b543-729b80cbd4b0",
    },
    runtimeVersion: "1.0.0",
    plugins: [
      "expo-router",
      "expo-font",
      "expo-secure-store",
      "@sentry/react-native",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to upload shop documents.",
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to take photos of shop documents.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./near_now_shopkeeper_foreground.png",
          color: "#000000",
          defaultChannel: "orders_v2",
          sounds: ["./assets/sounds/order_chime.wav"],
        },
      ],
      withAbiSplits,
      withTabletSupport,
      withRemoveMediaPermissions,
    ],
    extra: {
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_BASE_URL ||
        "https://near-and-now-backend.vercel.app",
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        "",
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        "",
      googleMapsApiKey,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
      environment:
        process.env.EXPO_PUBLIC_ENV ||
        (process.env.NODE_ENV === "production" ? "production" : "development"),
      eas: {
        projectId: "f0f709ec-f013-416a-b543-729b80cbd4b0",
      },
    },
  };
};
