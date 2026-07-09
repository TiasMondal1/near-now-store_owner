/** Jest configuration for the shopkeeper app (unit tests for pure logic). */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  clearMocks: true,
  // Allow the RN/Expo/Supabase/Sentry ESM packages to be transformed by Babel.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|@supabase/.*))",
  ],
};
