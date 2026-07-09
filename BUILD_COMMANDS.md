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
- Output APK:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Requirements on the machine:
- **JDK 17** installed and selected (e.g. `JAVA_HOME` pointing to JDK 17).
- **Android SDK** installed, with `android/local.properties` containing:

```properties
sdk.dir=C:\\Users\\Tias\\AppData\\Local\\Android\\Sdk
```

