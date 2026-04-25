const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

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
