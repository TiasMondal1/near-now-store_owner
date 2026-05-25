/**
 * Expo config plugin — injects ABI split APK config into the generated
 * android/app/build.gradle after every `expo prebuild --clean`.
 *
 * Without this, expo prebuild overwrites build.gradle with its default
 * template, which has no splits block, producing only one universal APK.
 */
const { withAppBuildGradle } = require("@expo/config-plugins");

const SPLITS_BLOCK = `
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a", "x86_64"
            universalApk true
        }
    }`;


/**
 * Finds the closing brace of the `androidResources { }` block and inserts
 * text immediately after it (still inside the `android { }` block).
 * Uses brace counting so it handles multi-line content correctly.
 */
function insertAfterAndroidResourcesBlock(contents, toInsert) {
  const marker = "    androidResources {";
  const start = contents.lastIndexOf(marker);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < contents.length; i++) {
    if (contents[i] === "{") depth++;
    else if (contents[i] === "}") {
      depth--;
      if (depth === 0) {
        return contents.slice(0, i + 1) + toInsert + contents.slice(i + 1);
      }
    }
  }
  return null;
}

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // ── Idempotent: skip if already patched ──────────────────────────────────
    if (contents.includes("splits {")) return mod;

    // ── 1. Inject splits block inside android { } ────────────────────────────
    const withSplits = insertAfterAndroidResourcesBlock(contents, SPLITS_BLOCK);
    if (withSplits) {
      contents = withSplits;
    } else {
      // androidResources block not found (future Expo template change).
      // Fall back to inserting before the dependencies block.
      console.warn("[withAbiSplits] Could not find androidResources block — splits not injected.");
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
