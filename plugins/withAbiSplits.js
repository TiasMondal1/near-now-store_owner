/**
 * Expo config plugin — configures Android release builds so the setup survives
 * every `expo prebuild --clean` (which otherwise overwrites build.gradle,
 * gradle.properties and proguard-rules.pro with Expo's default template).
 *
 * It applies:
 *   1. ABI splits  → one APK per architecture (arm64-v8a, armeabi-v7a, x86_64)
 *      plus a universal APK.
 *   2. Per-ABI versionCode overrides so each split APK has a unique versionCode
 *      (the universal APK keeps the plain defaultConfig.versionCode).
 *   3. Release signing from NEARNOW_RELEASE_* Gradle properties / env vars,
 *      falling back to the debug keystore when they aren't provided.
 *   4. R8/Proguard + resource shrinking enabled for release (via
 *      gradle.properties) plus keep rules for React Native / Hermes / Expo.
 */
const {
  withAppBuildGradle,
  withGradleProperties,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ── Gradle snippets ────────────────────────────────────────────────────────

const SPLITS_BLOCK = `
    splits {
        abi {
            // ABI splits apply to APK (assemble*) builds only. For App Bundle
            // (bundle* / AAB) builds they must be disabled — the bundle handles
            // per-ABI delivery itself, and combining splits with resource
            // shrinking breaks bundleRelease. https://issuetracker.google.com/402800800
            enable !gradle.startParameter.taskNames.any { it.toLowerCase().contains("bundle") }
            reset()
            include "arm64-v8a", "armeabi-v7a", "x86_64"
            universalApk true
        }
    }`;

// Marker keeps this idempotent across repeated prebuilds.
const VERSION_CODE_MARKER = "NEARNOW_ABI_VERSION_CODES";
const VERSION_CODE_BLOCK = `

    // ${VERSION_CODE_MARKER}: give each per-ABI APK a unique versionCode. The
    // universal APK (no ABI filter) keeps the plain defaultConfig.versionCode.
    applicationVariants.all { variant ->
        variant.outputs.each { output ->
            def abiVersionCodes = ["armeabi-v7a": 1, "x86": 2, "arm64-v8a": 3, "x86_64": 4]
            def abiName = output.getFilter(com.android.build.OutputFile.ABI)
            def abiPrefix = abiVersionCodes.get(abiName)
            if (abiPrefix != null) {
                output.versionCodeOverride = abiPrefix * 1000000 + variant.versionCode
            }
        }
    }`;

const SIGNING_MARKER = "NEARNOW_RELEASE_STORE_FILE";
const RELEASE_SIGNING_CONFIG = `
        // ${SIGNING_MARKER}: real release keystore. Credentials come from
        // android/keystore.properties (preferred) or NEARNOW_RELEASE_* Gradle
        // props / env vars; otherwise the release build falls back to the debug
        // keystore below.
        release {
            def nnKsProps = new Properties()
            def nnKsFile = rootProject.file('keystore.properties')
            if (nnKsFile.exists()) { nnKsFile.withInputStream { nnKsProps.load(it) } }
            def nnStoreFile = nnKsProps.getProperty('storeFile') ?: System.getenv('NEARNOW_RELEASE_STORE_FILE') ?: findProperty('NEARNOW_RELEASE_STORE_FILE')
            if (nnStoreFile != null && !nnStoreFile.toString().isEmpty()) {
                storeFile file(nnStoreFile)
                storePassword nnKsProps.getProperty('storePassword') ?: System.getenv('NEARNOW_RELEASE_STORE_PASSWORD') ?: findProperty('NEARNOW_RELEASE_STORE_PASSWORD')
                keyAlias nnKsProps.getProperty('keyAlias') ?: System.getenv('NEARNOW_RELEASE_KEY_ALIAS') ?: findProperty('NEARNOW_RELEASE_KEY_ALIAS')
                keyPassword nnKsProps.getProperty('keyPassword') ?: System.getenv('NEARNOW_RELEASE_KEY_PASSWORD') ?: findProperty('NEARNOW_RELEASE_KEY_PASSWORD')
                enableV1Signing true
                enableV2Signing true
            }
        }`;

const PROGUARD_MARKER = "# NEARNOW release keep rules";
const PROGUARD_RULES = `

${PROGUARD_MARKER}
# Keep rules for R8/Proguard release builds (minifyEnabled true). React Native +
# Hermes + Expo rely heavily on reflection/JNI, so keep their cores.
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.core.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclassmembers class * { @com.facebook.common.internal.DoNotStrip *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *

# Hermes / JavaScriptCore engines
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.jni.**

# Native modules discovered via reflection
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }

# Expo modules (autolinked, resolved via reflection)
-keep class expo.modules.** { *; }
-keep class versioned.host.exp.exponent.** { *; }
-dontwarn expo.modules.**

# OkHttp / Okio networking stack
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Kotlin metadata / coroutines
-keepclassmembers class kotlin.Metadata { *; }
-dontwarn kotlinx.**
`;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Finds the closing brace of a named top-level-ish block (e.g. "androidResources {"
 * or "signingConfigs {") and returns the index just after it. Uses brace counting
 * so multi-line content is handled correctly.
 */
function indexAfterBlock(contents, marker) {
  const start = contents.indexOf(marker);
  if (start === -1) return -1;
  let depth = 0;
  for (let i = start; i < contents.length; i++) {
    if (contents[i] === "{") depth++;
    else if (contents[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Returns the index right after the opening brace of a named block. */
function indexAfterOpeningBrace(contents, marker) {
  const start = contents.indexOf(marker);
  if (start === -1) return -1;
  const brace = contents.indexOf("{", start);
  return brace === -1 ? -1 : brace + 1;
}

function patchAppBuildGradle(contents) {
  // 1. ABI splits — insert after the androidResources { } block (still inside
  //    the android { } block).
  if (!contents.includes("splits {")) {
    const at = indexAfterBlock(contents, "    androidResources {");
    if (at !== -1) {
      contents = contents.slice(0, at) + SPLITS_BLOCK + contents.slice(at);
    } else {
      console.warn("[withAbiSplits] androidResources block not found — splits not injected.");
    }
  }

  // 2. Per-ABI versionCode overrides — insert right after the splits block.
  if (!contents.includes(VERSION_CODE_MARKER)) {
    const at = indexAfterBlock(contents, "    splits {");
    if (at !== -1) {
      contents = contents.slice(0, at) + VERSION_CODE_BLOCK + contents.slice(at);
    } else {
      console.warn("[withAbiSplits] splits block not found — versionCode overrides not injected.");
    }
  }

  // 3. Release signing config — insert just inside the signingConfigs { } block.
  if (!contents.includes(SIGNING_MARKER)) {
    const at = indexAfterOpeningBrace(contents, "signingConfigs {");
    if (at !== -1) {
      contents = contents.slice(0, at) + "\n" + RELEASE_SIGNING_CONFIG + contents.slice(at);
    } else {
      console.warn("[withAbiSplits] signingConfigs block not found — release signing not injected.");
    }
  }

  // 4. Point the release build type at the conditional release signing config.
  //    Only replace the occurrence inside the release { } build type (anchored by
  //    the template's caution comment) so the debug build type is untouched.
  const releaseSignAnchor = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
  if (contents.includes(releaseSignAnchor)) {
    contents = contents.replace(
      releaseSignAnchor,
      `        release {
            // Signing: use the release keystore when android/keystore.properties
            // exists or NEARNOW_RELEASE_* is provided, else fall back to debug.
            def nnHasRelease = rootProject.file('keystore.properties').exists() || System.getenv('NEARNOW_RELEASE_STORE_FILE') || findProperty('NEARNOW_RELEASE_STORE_FILE')
            signingConfig nnHasRelease ? signingConfigs.release : signingConfigs.debug`
    );
  }

  // 5. Use the "-optimize" default config so R8 runs its full optimization
  //    passes (the plain proguard-android.txt disables them, which is why
  //    Play Console reports "optimisation isn't enabled").
  const proguardReplacement = [
    `            // Use the "-optimize" default config so R8 runs its full optimization`,
    `            // passes (the plain proguard-android.txt disables them, which is why`,
    `            // Play Console reports "optimisation isn't enabled").`,
    `            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"`,
  ].join("\n");
  contents = contents.replace(
    `            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"`,
    proguardReplacement
  );

  return contents;
}

/** Upsert a key=value entry in gradle.properties modResults. */
function setGradleProperty(config, key, value) {
  return withGradleProperties(config, (mod) => {
    const items = mod.modResults;
    const existing = items.find((i) => i.type === "property" && i.key === key);
    if (existing) {
      existing.value = value;
    } else {
      items.push({ type: "property", key, value });
    }
    return mod;
  });
}

function withProguardKeepRules(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro"
      );
      if (fs.existsSync(file)) {
        let contents = fs.readFileSync(file, "utf8");
        if (!contents.includes(PROGUARD_MARKER)) {
          contents += PROGUARD_RULES;
          fs.writeFileSync(file, contents, "utf8");
        }
      }
      return cfg;
    },
  ]);
}

// ── Plugin ──────────────────────────────────────────────────────────────────

module.exports = function withAbiSplits(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      console.warn("[withAbiSplits] Non-groovy build.gradle — skipping.");
      return mod;
    }
    mod.modResults.contents = patchAppBuildGradle(mod.modResults.contents);
    return mod;
  });

  // Enable R8 code shrinking + resource shrinking for release builds.
  config = setGradleProperty(config, "android.enableMinifyInReleaseBuilds", "true");
  config = setGradleProperty(config, "android.enableShrinkResourcesInReleaseBuilds", "true");

  config = withProguardKeepRules(config);

  return config;
};
