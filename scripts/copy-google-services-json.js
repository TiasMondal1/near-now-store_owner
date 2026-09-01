#!/usr/bin/env node
/**
 * EAS Build lifecycle hook (runs automatically as "eas-build-post-install",
 * right after `npm install`, before the native Gradle build).
 *
 * STALE as of 2026-09-01: this app's android/app/build.gradle (and root
 * build.gradle/settings.gradle/gradlew) were deleted from git by an earlier
 * "cleanup" commit and never restored — `android/` is no longer a real
 * hand-maintained native project. EAS Build has since been silently
 * falling back to a fresh `expo prebuild` on every build, and Firebase is
 * now wired via app.config.js's `android.googleServicesFile` field (the
 * same managed-workflow pattern used by the customer/rider apps), which
 * Expo's own GoogleServices config-plugin applies during that prebuild —
 * see app.config.js's top-of-file comment for the full story.
 *
 * This script still runs and still copies the file into android/app/, but
 * it's now redundant: prebuild regenerates android/ from scratch anyway,
 * and Expo's config-plugin does its own copy + build.gradle patching. Left
 * in place as a harmless no-op rather than removed outright, in case a
 * future local bare-workflow build ever needs it again — but don't trust
 * this docstring's original bare-workflow description as current fact.
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
