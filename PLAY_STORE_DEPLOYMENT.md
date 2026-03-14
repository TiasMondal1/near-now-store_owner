# Deploy Near&Now Store Owner to Google Play Store

Step-by-step guide to publish your Expo app on the Play Store.

---

## Prerequisites

1. **Google Play Developer account**  
   - Sign up at [Google Play Console](https://play.google.com/console)  
   - One-time fee: **$25**  
   - Allow 24–48 hours for account approval  

2. **Expo account**  
   - Create at [expo.dev](https://expo.dev) (free)  
   - You’ll use it for EAS Build and (optionally) EAS Submit  

3. **Production readiness**  
   - Finish critical items in `PRODUCTION_READINESS.md` (e.g. remove OTP bypass, production API URL, privacy policy).  
   - Play Store requires a **privacy policy URL** and may reject apps with obvious dev backdoors.

---

## Step 1: Configure the app for production

### 1.1 Package name (recommended)

Your `app.json` currently has `"package": "com.anonymous.nearandnowstoreowner"`. For a real release, use a proper package name, e.g.:

- `com.nearandnow.storeowner`  
- Or `com.yourcompany.nearandnowstoreowner`

Edit `app.json` → `expo.android.package`:

```json
"android": {
  "package": "com.nearandnow.storeowner",
  "versionCode": 1,
  ...
}
```

**Important:** After you publish once, you cannot change the package name. Choose it carefully.

### 1.2 Version and build number

- **version** (e.g. `"1.0.0"`): user-visible version in `app.json` → `expo.version`.  
- **versionCode** (Android only): integer that must increase for each Play Store upload. Set in `app.json` → `expo.android.versionCode` (or EAS can auto-increment).

Example:

```json
"version": "1.0.0",
"android": {
  "versionCode": 1,
  ...
}
```

### 1.3 Privacy policy (required by Play Store)

- Host a privacy policy page (e.g. on your website or GitHub Pages).  
- Add the URL in Play Console (see Step 4).  
- Optionally add it in the app (e.g. in Settings/About) and in `app.json` / store listing.

---

## Step 2: Set up EAS Build

EAS Build (Expo Application Services) builds your Expo app into a signed AAB/APK for the Play Store.

### 2.1 Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

### 2.2 Configure EAS in the project

From the project root:

```bash
eas build:configure
```

This creates `eas.json` with build profiles (e.g. `development`, `preview`, `production`).

### 2.3 (Recommended) Add Android `versionCode` in app config

In `app.json`, under `expo.android`, add:

```json
"versionCode": 1
```

For later releases, bump this number (e.g. 2, 3) for each new upload. You can also use EAS auto-increment.

### 2.4 Create a production Android build

```bash
eas build --platform android --profile production
```

- EAS will build in the cloud and prompt for any missing credentials (e.g. keystore).  
- First time: choose “Let EAS create a keystore” so you get a signed build.  
- When the build finishes, you get a download link for an **AAB** (Android App Bundle). Use the AAB for Play Store; APK is for testing only if needed.

---

## Step 3: Create the app in Google Play Console

1. Go to [Google Play Console](https://play.google.com/console).  
2. Click **Create app**.  
3. Fill in:
   - App name  
   - Default language  
   - App or game  
   - Free or paid  
4. Accept declarations (e.g. policies, export compliance).  
5. Create the app. You’ll land in the dashboard.

---

## Step 4: Complete required Play Console setup

Before you can publish, you must complete the items in the left sidebar (dashboard will show what’s missing).

### 4.1 Store listing

- **App name**, **short description**, **full description**.  
- **App icon**: 512×512 PNG.  
- **Feature graphic**: 1024×500 (required).  
- **Screenshots**: at least 2 (phone); 7″ and 10″ if you support tablets.  
- **Privacy policy URL** (required): your hosted privacy policy link.  
- **Category** (e.g. Business).  
- **Contact details**: email (and optionally phone).

### 4.2 App content

- **Privacy policy**: same URL as in store listing.  
- **App access**: if login required, provide test credentials or “All functionality available without login.”  
- **Ads**: declare if your app shows ads (yes/no).  
- **Content rating**: complete the questionnaire and get a rating (e.g. Everyone, Teen).  
- **Target audience**: age groups.  
- **News app**: if applicable.  
- **COVID-19 contact tracing / status**: if applicable.  
- **Data safety**: declare what data you collect (e.g. email, location) and how it’s used. This is mandatory.

### 4.3 Release and signing

- **App signing by Google Play**: recommended. Google will manage the Play signing key; you upload builds signed with your upload key (EAS can create and use this).  
- First release: create a **Production** (or **Internal testing**) release and upload your first AAB.

### 4.4 Upload the AAB

- In Play Console go to **Release** → **Production** (or **Testing** → **Internal testing**).  
- Create a new release.  
- Upload the **AAB** you downloaded from EAS Build.  
- Add release notes (e.g. “Initial release”).  
- Save and then start rollout (or send for review in case of testing tracks).

---

## Step 5: Submit for review

- After the release is submitted, Google reviews the app (often 1–7 days).  
- They may request changes; fix and resubmit.  
- Once approved, the app goes live according to the release you chose (e.g. production or internal test).

---

## Step 6 (Optional): Use EAS Submit to upload builds

Instead of downloading the AAB and uploading manually, you can use EAS Submit:

### 6.1 First-time: link to Play Console

- In Play Console: **Setup** → **App signing** (or **Release** → **Setup**).  
- Create or use a **service account** with access to your app, and download the JSON key.  
- In [expo.dev](https://expo.dev) → your project → **Credentials** / **Google Service Account**, upload the key (or set the path in EAS).  
- In EAS / `eas.json`, configure submission to use this credential.

### 6.2 Submit the last build

```bash
eas submit --platform android --latest
```

Or submit a specific build:

```bash
eas submit --platform android --id <build-id>
```

EAS will upload the AAB to the release track you configured (e.g. internal or production). You still need to complete store listing, content rating, data safety, and start the release in Play Console.

---

## Quick command summary

| Step                    | Command |
|-------------------------|--------|
| Configure EAS          | `eas build:configure` |
| Production Android build| `eas build --platform android --profile production` |
| Submit latest build     | `eas submit --platform android --latest` |

---

## Checklist before first submission

- [ ] Google Play Developer account ($25)  
- [ ] Expo account + `eas login`  
- [ ] `eas build:configure` and `eas.json` in project  
- [ ] Package name set (and not `com.anonymous.*`)  
- [ ] `version` and `versionCode` set in `app.json`  
- [ ] Production API URL and no dev bypass (see `PRODUCTION_READINESS.md`)  
- [ ] Privacy policy URL hosted and linked in Play Console  
- [ ] Store listing: icon, feature graphic, screenshots, descriptions  
- [ ] Content rating and Data safety form completed  
- [ ] AAB built with `eas build --platform android --profile production`  
- [ ] AAB uploaded to a release in Play Console (or via `eas submit`)  
- [ ] Release submitted for review  

---

## Useful links

- [Expo: Build for Android](https://docs.expo.dev/build-reference/android-builds/)  
- [Expo: Submit to Play Store](https://docs.expo.dev/submit/android/)  
- [Google Play Console](https://play.google.com/console)  
- [Play Store launch checklist (Google)](https://support.google.com/googleplay/android-developer/answer/9859152)
