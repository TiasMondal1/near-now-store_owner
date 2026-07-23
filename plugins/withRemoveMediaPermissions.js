/**
 * Expo config plugin — removes broad media/storage permissions from the Android
 * manifest so Google Play accepts the app (Photo Picker policy).
 *
 * The app uses expo-image-picker's launchImageLibraryAsync which already uses
 * the Android system Photo Picker — no READ_MEDIA_* permissions needed.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS_TO_REMOVE = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
];

module.exports = function withRemoveMediaPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Filter out the unwanted permissions
    if (manifest["uses-permission"]) {
      manifest["uses-permission"] = manifest["uses-permission"].filter(
        (perm) => {
          const name = perm.$?.["android:name"];
          return !PERMISSIONS_TO_REMOVE.includes(name);
        }
      );
    }

    // Also add tools:node="remove" entries so library permissions get stripped
    // during the final manifest merge by Gradle
    const toolsNs = "http://schemas.android.com/tools";
    for (const perm of PERMISSIONS_TO_REMOVE) {
      manifest["uses-permission"].push({
        $: {
          "android:name": perm,
          [`xmlns:tools`]: toolsNs,
          [`tools:node`]: "remove",
        },
      });
    }

    return config;
  });
};
