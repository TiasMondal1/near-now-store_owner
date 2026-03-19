#!/usr/bin/env node
/**
 * Build release APK with .env loaded so EXPO_PUBLIC_* are baked into the bundle.
 * Run from project root: node scripts/build-apk-with-env.js
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        if (key.startsWith("EXPO_PUBLIC_") || key.startsWith("VITE_") || key === "NODE_ENV") {
          process.env[key] = val;
        }
      }
    }
  });
  const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "";
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const supaKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  console.log("Loaded .env:");
  console.log("  EXPO_PUBLIC_API_BASE_URL     =", apiUrl || "(not set)");
  console.log("  EXPO_PUBLIC_SUPABASE_URL     =", supaUrl || "(not set)");
  console.log("  EXPO_PUBLIC_SUPABASE_ANON_KEY=", supaKey ? supaKey.slice(0, 20) + "…" : "(not set)");
  if (!supaUrl || !supaKey) {
    console.error("\nERROR: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from .env");
    console.error("The built APK will have no Supabase connection. Add them to .env and rebuild.\n");
  }
  if (!apiUrl || apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")) {
    console.warn("");
    console.warn("WARNING: EXPO_PUBLIC_API_BASE_URL is not set or is localhost. The APK will not reach your backend on a real device.");
    console.warn("Set EXPO_PUBLIC_API_BASE_URL in .env to your production URL (e.g. https://api.yourdomain.com) or your computer LAN IP (e.g. http://192.168.1.5:3000), then run this again.");
    console.warn("");
  }
} else {
  console.warn("No .env file found. Create .env and set EXPO_PUBLIC_API_BASE_URL to your API URL, then run again.");
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const androidDir = path.join(rootDir, "android");
const isWin = process.platform === "win32";
const gradleWrapper = isWin ? "gradlew.bat" : "gradlew";
const gradle = path.join(androidDir, gradleWrapper);

// Use whatever JAVA_HOME / PATH the environment provides; don't hardcode JDK paths.
const env = {
  ...process.env,
  JAVA_TOOL_OPTIONS:
    "--enable-native-access=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED",
};

const run = (gradleArgs) => {
  if (isWin) {
    // On Windows, run via cmd.exe to avoid spawnSync EINVAL with .bat
    return spawnSync("cmd.exe", ["/c", gradle, ...gradleArgs], {
      cwd: androidDir,
      env,
      stdio: "inherit",
    });
  }
  return spawnSync(gradle, gradleArgs, {
    cwd: androidDir,
    env,
    stdio: "inherit",
  });
};
// Stop daemon so a new one picks up the freshly injected EXPO_PUBLIC_* env vars.
run(["--stop"]);

// Delete only the JS bundle intermediates so Metro always re-bundles with the current env vars.
// We deliberately avoid "gradle clean" because it also cleans C++ native build artifacts and
// triggers a CMake re-check that fails when codegen directories haven't been created yet.
const bundleDirs = [
  path.join(androidDir, "app/build/intermediates/assets"),
  path.join(androidDir, "app/build/intermediates/merged_assets"),
  path.join(androidDir, "app/build/generated/assets"),
];
bundleDirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("Cleared bundle cache:", dir);
  }
});

const result = run(["assembleRelease"]);

if (result.error) {
  console.error("Gradle failed to start:", result.error.message || result.error);
}

process.exit(result.status ?? 1);
