/**
 * Expo config. When you run "expo start", .env is loaded first; we bake
 * EXPO_PUBLIC_API_BASE_URL into the app via extra so the device gets your LAN IP.
 */
const { expo } = require("./app.json");

module.exports = {
  expo: {
    ...expo,
    scheme: "nearandnow-storeowner",
    extra: {
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_BASE_URL || "http://192.168.0.111:3000",
    },
  },
};
