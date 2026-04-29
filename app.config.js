// Single-source dynamic Expo config (no app.json).
// Uses EXPO_PUBLIC_API_BASE_URL and your custom logo for icons.

const withAbiSplits = require("./plugins/withAbiSplits");

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
      versionCode: 2,
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
    plugins: ["expo-router", "expo-font", withAbiSplits],
    extra: {
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_BASE_URL ||
        "https://near-and-now-frontend.vercel.app/",
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        "",
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        "",
      googleMapsApiKey,
      eas: {
        projectId: "f0f709ec-f013-416a-b543-729b80cbd4b0",
      },
    },
  };
};
