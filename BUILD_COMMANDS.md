## Near & Now Shopkeeper - Build Commands

### 1. Local AAB (Play Store upload, built on this machine — no EAS)

From project root, after native prebuild is done once:

```bash
npm run prebuild:android     # only needed after js/config changes that affect native
npm run build:aab
```

Raw Gradle command (if you want to bypass the Node helper):

```bash
cd android
.\gradlew.bat bundleRelease   # Windows
# or:
./gradlew bundleRelease       # macOS/Linux
```

- Script: `build:aab` → `node scripts/build-apk-with-env.js aab`
- That script:
  - Loads `.env` so `EXPO_PUBLIC_API_BASE_URL` (and other `EXPO_PUBLIC_*`/Supabase/Maps keys) are baked into the bundle.
  - Auto-detects JDK 17 and the Android SDK path on macOS/Windows.
  - Runs `gradlew bundleRelease` under `android/`.
- Output (**single `.aab` file, not a zip**):

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Gradle's `bundleRelease` task always emits exactly one `app-release.aab` file at that path — no zip wrapper. Upload that file directly to Play Console. (If your OS file browser offers to "compress"/"zip" the file when copying it out, decline — Play Console only accepts the raw `.aab`.)

Requirements on the machine:
- **JDK 17** installed (auto-detected via `/usr/libexec/java_home -v 17` or Homebrew `openjdk@17` on macOS; set `JAVA_HOME` manually on other platforms/CI).
- **Android SDK** installed, with `android/local.properties` containing:

```properties
sdk.dir=/Users/<you>/Library/Android/sdk        # macOS
# sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk   # Windows
```

### 2. Play Store AAB (production build via EAS)

From project root:

```bash
npm run build:android
```

- Script: `build:android` → `npx eas-cli build --platform android --profile production`
- Output: **AAB** file downloadable from the EAS build page (Expo website).

Prerequisites:
- Logged into Expo (`eas login` once).
- EAS project linked (already configured in this repo).
- Production API URL set via `EXPO_PUBLIC_API_BASE_URL` (in `.env` or EAS env).

Equivalent raw command (without npm script):

```bash
npx eas-cli build --platform android --profile production
```

### 3. Local APK (install directly on phone)

From project root, after native prebuild is done once:

```bash
npm run prebuild:android     # only needed after js/config changes that affect native
npm run build:apk
```

Raw Gradle command (if you want to bypass the Node helper):

```bash
cd android
.\gradlew.bat assembleRelease   # Windows
# or:
./gradlew assembleRelease       # macOS/Linux
```

- Script: `build:apk` → `node scripts/build-apk-with-env.js`
- That script:
  - Loads `.env` so `EXPO_PUBLIC_API_BASE_URL` is baked into the bundle.
  - Runs `gradlew assembleRelease` under `android/`.
- Output APKs (ABI splits are enabled, so `assembleRelease` emits one APK per
  architecture **plus** a universal APK):

```text
android/app/build/outputs/apk/release/app-arm64-v8a-release.apk     # most modern phones
android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk   # older 32-bit phones
android/app/build/outputs/apk/release/app-x86_64-release.apk        # emulators / x86 devices
android/app/build/outputs/apk/release/app-universal-release.apk     # runs on any device (largest)
```

- Each per-ABI APK gets a distinct `versionCode` (prefixed by ABI) so upgrades
  install the correct build; the universal APK keeps the plain `versionCode`.
- To share a single APK that installs anywhere, distribute `app-universal-release.apk`.
- To build only one architecture (smaller/faster), pass the arch through:

```bash
npm run build:apk -- --arch=arm64-v8a
```

> **Prebuild-safe:** ABI splits, per-ABI versionCodes, release signing, R8/resource
> shrinking, and the Proguard keep rules are all injected by the Expo config plugin
> `plugins/withAbiSplits.js` (registered in `app.config.js`). This means they are
> re-applied automatically on every `expo prebuild --clean`, so editing the
> generated `android/` files by hand is not required.

> **APK vs AAB:** ABI splits apply to APK (`assembleRelease`) builds only. For the
> Play Store **AAB** (`bundleRelease`) the splits are auto-disabled — the App
> Bundle already delivers per-ABI slices itself, and combining splits with
> resource shrinking makes `bundleRelease` fail
> ([issuetracker 402800800](https://issuetracker.google.com/402800800)). So
> `npm run build:aab` produces a single optimized `app-release.aab` and
> `npm run build:apk` produces the four APKs — no config change needed between them.

### Release signing

Release builds are signed with your release keystore when these are provided
(via `~/.gradle/gradle.properties`, `-P` flags, or environment variables);
otherwise they fall back to the debug keystore so local builds still succeed:

```properties
NEARNOW_RELEASE_STORE_FILE=/absolute/path/to/near-now-release.keystore
NEARNOW_RELEASE_STORE_PASSWORD=********
NEARNOW_RELEASE_KEY_ALIAS=near-now
NEARNOW_RELEASE_KEY_PASSWORD=********
```

Generate a release keystore once (keep it safe and out of git):

```bash
keytool -genkeypair -v -keystore near-now-release.keystore -alias near-now \
  -keyalg RSA -keysize 2048 -validity 10000
```

### Sentry source maps

Release builds run Sentry's source-map upload automatically after JS bundling.
The local build script **auto-skips** this upload unless all three of these are
set (in `.env`, or your shell environment), so builds don't fail without Sentry:

```properties
SENTRY_AUTH_TOKEN=****
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
```

- If they're all set, source maps upload automatically.
- If any is missing, the build prints "skipping source map upload" and continues.
- Force either behavior with `SENTRY_DISABLE_AUTO_UPLOAD=true|false`.

### APK size optimization

Release builds enable R8/Proguard (`minifyEnabled`) and resource shrinking by
default. To temporarily disable for debugging a release build:

```bash
npm run build:apk -- --arch=arm64-v8a
cd android && ./gradlew assembleRelease -Pandroid.enableMinifyInReleaseBuilds=false
```

Requirements on the machine:
- **JDK 17** installed and selected (e.g. `JAVA_HOME` pointing to JDK 17).
- **Android SDK** installed, with `android/local.properties` containing:

```properties
sdk.dir=C:\\Users\\Tias\\AppData\\Local\\Android\\Sdk
```

