## Near & Now Shopkeeper - Build Commands

### 1. Play Store AAB (production build via EAS)

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

### 2. Local APK (install directly on phone)

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

