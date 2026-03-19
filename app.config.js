// Single-source dynamic Expo config (no app.json).
// Uses EXPO_PUBLIC_API_BASE_URL and your custom logo for icons.

module.exports = () => ({
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
  },
  web: {
    favicon: "./near_now_shopkeeper.png",
  },
  owner: "near-and-now-organization",
  scheme: "nearandnow-shopkeeper",
  updates: {
    url: "https://u.expo.dev/f0f709ec-f013-416a-b543-729b80cbd4b0",
  },
  runtimeVersion: { policy: "appVersion" },
  plugins: ["expo-router", "expo-font"],
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      "https://near-and-now-backend-production.up.railway.app/",
    supabaseUrl:
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "",
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "",
    googleMapsApiKey:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      "",
    eas: {
      projectId: "f0f709ec-f013-416a-b543-729b80cbd4b0",
    },
  },
});
