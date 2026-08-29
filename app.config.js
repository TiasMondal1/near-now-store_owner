// Single-source dynamic Expo config (no app.json).
// Uses EXPO_PUBLIC_API_BASE_URL and your custom logo for icons.

const withAbiSplits = require("./plugins/withAbiSplits");
const withTabletSupport = require("./plugins/withTabletSupport");
const withRemoveMediaPermissions = require("./plugins/withRemoveMediaPermissions");

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
      // NOTE: this app's android/ is committed to git (bare workflow) — EAS
      // Build uses it as-is and never runs `expo prebuild`. The real Firebase
      // wiring for THIS app is native: android/app/google-services.json +
      // the guarded `apply plugin: 'com.google.gms.google-services'` in
      // android/app/build.gradle, populated by the eas-build-post-install
      // hook (scripts/copy-google-services-json.js). A `googleServicesFile`
      // field here was previously believed inert (only honored by the
      // config-plugin during prebuild) — it isn't: EAS Build's own preflight
      // validates that path exists in the uploaded archive regardless of
      // workflow, and since this file is deliberately gitignored, that check
      // failed every build with EAS_BUILD_MISSING_GOOGLE_SERVICES_JSON_ERROR.
      // Left out entirely; nothing reads it for this app.
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
