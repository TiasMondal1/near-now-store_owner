// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Node-side CommonJS files (build scripts, config plugins, Expo/Metro/Jest
    // config). These run under Node, not the RN runtime, so `__dirname` etc.
    // are real globals here.
    files: [
      "*.config.js",
      "jest.setup.js",
      "scripts/**/*.js",
      "plugins/**/*.js",
    ],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
  },
]);
