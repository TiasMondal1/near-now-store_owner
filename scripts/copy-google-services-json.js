#!/usr/bin/env node
/**
 * EAS Build lifecycle hook (runs automatically as "eas-build-post-install",
 * right after `npm install`, before the native Gradle build).
 *
 * This app is a bare-workflow project — android/ is committed to git and
 * used as-is by EAS Build, which never runs `expo prebuild` for it. That
 * means the usual managed-workflow fix (an app.config.js config-plugin
 * reading a GOOGLE_SERVICES_JSON file env var) has nothing to hook into
 * here: nothing else copies the file into android/app/ automatically.
 *
 * android/app/build.gradle's `if (file('google-services.json').exists())`
 * guard checks that exact native path, not the repo root — so this hook
 * copies whatever EAS placed at the GOOGLE_SERVICES_JSON file env var
 * (or the local root-level copy, for local builds) into android/app/
 * before Gradle runs.
 */
const fs = require("fs");
const path = require("path");

const destPath = path.join(__dirname, "..", "android", "app", "google-services.json");
const sourcePath = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "..", "google-services.json");

if (!fs.existsSync(sourcePath)) {
  console.log("[copy-google-services-json] No google-services.json found (checked GOOGLE_SERVICES_JSON env var and repo root) — skipping. Push notifications via FCM will not work in this build.");
  process.exit(0);
}

fs.copyFileSync(sourcePath, destPath);
console.log(`[copy-google-services-json] Copied ${sourcePath} -> ${destPath}`);
