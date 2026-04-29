#!/usr/bin/env node
/**
 * Build release APK or AAB with .env loaded so EXPO_PUBLIC_* are baked into the bundle.
 * Run from project root:
 *   node scripts/build-apk-with-env.js        → APK (assembleRelease)
 *   node scripts/build-apk-with-env.js aab    → AAB (bundleRelease, Play Store)
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
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || "";
  console.log("Loaded .env:");
  console.log("  EXPO_PUBLIC_API_BASE_URL     =", apiUrl || "(not set)");
  console.log("  EXPO_PUBLIC_SUPABASE_URL     =", supaUrl || "(not set)");
  console.log("  EXPO_PUBLIC_SUPABASE_ANON_KEY=", supaKey ? supaKey.slice(0, 20) + "…" : "(not set)");
  console.log("  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=", mapsKey ? mapsKey.slice(0, 8) + "… (native manifest + JS)" : "(not set — MapView may crash or show blank in release)");
  if (!supaUrl || !supaKey) {
    console.error("\nERROR: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from .env");
    console.error("The built app will have no Supabase connection. Add them to .env and rebuild.\n");
  }
  if (!apiUrl || apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")) {
    console.warn("");
    console.warn("WARNING: EXPO_PUBLIC_API_BASE_URL is not set or is localhost. The build will not reach your backend on a real device.");
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
const localPropertiesPath = path.join(androidDir, "local.properties");

const resolveJava17Home = () => {
  if (process.platform !== "darwin") return "";
  const candidates = [];
  const javaHomeResult = spawnSync("/usr/libexec/java_home", ["-v", "17"], { encoding: "utf8" });
  const javaHomeCandidate = (javaHomeResult.stdout || "").trim();
  if (javaHomeResult.status === 0 && javaHomeCandidate) {
    candidates.push(javaHomeCandidate);
  }
  // Homebrew openjdk@17 is keg-only by default and may not be visible to /usr/libexec/java_home.
  candidates.push("/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home");
  candidates.push("/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home");

  for (const candidate of candidates) {
    const versionCheck = spawnSync(path.join(candidate, "bin", "java"), ["-version"], { encoding: "utf8" });
    const versionText = `${versionCheck.stdout || ""}\n${versionCheck.stderr || ""}`;
    const majorMatch = versionText.match(/version "(?:1\.)?(\d+)/);
    const major = majorMatch ? Number(majorMatch[1]) : NaN;
    if (major === 17) return candidate;
  }
  return "";
};

const java17Home = resolveJava17Home();
if (java17Home) {
  console.log("Using Java home:", java17Home);
} else if (process.platform === "darwin") {
  // This script runs on both Windows and macOS. The macOS-only lookup is
  // intentionally skipped on Windows, so don't warn there.
  console.warn(
    "JDK 17 not found on macOS. Install it (e.g. brew install openjdk@17) and/or set JAVA_HOME to JDK 17."
  );
}

const resolveAndroidSdkDir = () => {
  const winCandidates =
    process.platform === "win32"
      ? [
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
          process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk") : null,
          "C:\\Android\\Sdk",
        ]
      : [];

  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    "/Users/tiasmondal166/Library/Android/sdk",
    path.join(process.env.HOME || "", "Library/Android/sdk"),
    "/opt/android-sdk",
    ...winCandidates,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const adbPath = path.join(candidate, "platform-tools", isWin ? "adb.exe" : "adb");
    if (fs.existsSync(adbPath)) return candidate;
  }
  return "";
};

const sdkDir = resolveAndroidSdkDir();
if (sdkDir) {
  const escapedSdkDir = sdkDir.replace(/\\/g, "\\\\");
  fs.writeFileSync(localPropertiesPath, `sdk.dir=${escapedSdkDir}\n`, "utf8");
  console.log("Using Android SDK:", sdkDir);
} else {
  console.warn("Android SDK not found. Set ANDROID_HOME/ANDROID_SDK_ROOT or create android/local.properties with sdk.dir.");
}

const env = {
  ...process.env,
  ...(java17Home ? { JAVA_HOME: java17Home } : {}),
  ...(java17Home ? { PATH: `${path.join(java17Home, "bin")}:${process.env.PATH || ""}` } : {}),
  ...(sdkDir ? { ANDROID_HOME: sdkDir, ANDROID_SDK_ROOT: sdkDir } : {}),
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

const argv = process.argv.slice(2);
const positionalArgs = argv.filter((a) => !a.startsWith("-"));

const target = (positionalArgs[0] || "apk").toLowerCase();
const isAab = target === "aab";
const gradleTask = isAab ? "bundleRelease" : "assembleRelease";
const ext = isAab ? ".aab" : ".apk";

let reactNativeArchitectures = null;
let alias = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];

  if (a.startsWith("--arch=")) {
    reactNativeArchitectures = a.slice("--arch=".length);
  } else if (a === "--arch" && argv[i + 1]) {
    reactNativeArchitectures = argv[++i];
  } else if (a.startsWith("--reactNativeArchitectures=")) {
    reactNativeArchitectures = a.slice("--reactNativeArchitectures=".length);
  } else if (a === "--reactNativeArchitectures" && argv[i + 1]) {
    reactNativeArchitectures = argv[++i];
  } else if (a.startsWith("--alias=")) {
    alias = a.slice("--alias=".length);
  } else if (a === "--alias" && argv[i + 1]) {
    alias = argv[++i];
  }
}

const outputHint = isAab
  ? "android/app/build/outputs/bundle/release/app-release.aab"
  : "android/app/build/outputs/apk/release/app-release.apk";

const gradleArgs = [gradleTask];
if (reactNativeArchitectures) {
  // Controls which ABIs are built. Example: arm64-v8a or armeabi-v7a
  gradleArgs.push(`-PreactNativeArchitectures=${reactNativeArchitectures}`);
}

console.log(
  `Gradle task: ${gradleTask}` +
    (reactNativeArchitectures ? ` (reactNativeArchitectures=${reactNativeArchitectures})` : "") +
    ` → ${outputHint}\n`
);

const result = run(gradleArgs);

if (result.error) {
  console.error("Gradle failed to start:", result.error.message || result.error);
}

if ((result.status ?? 1) === 0) {
  const builtPath = path.join(rootDir, outputHint);
  let finalMessage = `\nDone. Output: ${builtPath}`;

  if (alias) {
    const aliasLower = alias.toLowerCase();
    const destFilename = aliasLower.endsWith(".apk") || aliasLower.endsWith(".aab") ? alias : `${alias}${ext}`;
    // Gradle may wipe the `release/` output directory between builds, which would
    // delete our copied files. Keep them in a stable variants folder instead.
    const destDir = isAab
      ? path.join(rootDir, "android", "app", "build", "outputs", "bundle", "variants")
      : path.join(rootDir, "android", "app", "build", "outputs", "apk", "variants");
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, destFilename);

    fs.copyFileSync(builtPath, destPath);
    finalMessage += `\nCopied to: ${destPath}`;
  }

  console.log(finalMessage);
}

process.exit(result.status ?? 1);
