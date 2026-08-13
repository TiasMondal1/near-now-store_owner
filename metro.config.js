const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// react-native-maps has no web implementation and crashes the entire web
// bundle outright (not just store-owner-signup.tsx, which uses it — expo-
// router eagerly resolves every route for web). Alias it to a lightweight
// placeholder on web only; native builds are completely unaffected. See
// web-mocks/react-native-maps.js. Found + fixed 2026-08-13 via live
// click-testing.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return {
      filePath: path.resolve(__dirname, "web-mocks/react-native-maps.js"),
      type: "sourceFile",
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Strip console.log/warn/error in production bundles
if (process.env.NODE_ENV === "production") {
  config.transformer = {
    ...config.transformer,
    minifierConfig: {
      ...config.transformer?.minifierConfig,
      compress: {
        ...(config.transformer?.minifierConfig?.compress ?? {}),
        drop_console: true,
      },
    },
  };
}

module.exports = config;
