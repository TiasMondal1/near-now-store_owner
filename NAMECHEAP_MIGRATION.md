# Backend Migration: Railway → Namecheap Shared Hosting (cPanel)

**Project:** Near & Now  
**Backend stack:** Node.js / Express  
**Current host:** Railway (`https://near-and-now-backend-production.up.railway.app`)  
**cPanel URL:** `https://server216.web-hosting.com:2083`  
**Database:** Supabase — stays where it is, no migration needed  
**OTP:** Twilio — stays where it is, no migration needed

---

## How Namecheap Shared Hosting Runs Node.js

Before starting, understand this key difference from Railway or a VPS:

Namecheap shared hosting does **not** let you run `node server.js` directly on a terminal like a normal server. Instead it uses a system called **Phusion Passenger**, which is a web server extension that sits between Nginx (the web server) and your Node.js app. Passenger starts and stops your app automatically — you don't manage processes yourself.

This means:
- You do **not** use `pm2`, `forever`, or `node` commands to start the app
- You do **not** pick a port like `3000` — Passenger assigns the port internally
- You **do** need to export your Express app so Passenger can load it
- The cPanel dashboard gives you a GUI to configure and restart the app

---

## Step 1 — Create a Subdomain for the API

Your API needs its own URL (e.g. `api.yourdomain.com`). This is separate from your main website domain. Do this first so cPanel creates the folder structure for you.

> **Note:** The cPanel Jupiter theme (what you have) does not have a separate "Subdomains" button. Subdomain creation is now inside the main Domains page.

1. Log in to cPanel at `https://server216.web-hosting.com:2083`
2. In the **Domains** section, click **Domains** (the main Domains link)
3. On the Domains page, click **"Create A New Domain"**
4. In the domain field, type the full subdomain — e.g. `api.yourdomain.com`
5. **Uncheck** "Share document root" if it is ticked — you want the subdomain to have its own dedicated folder
6. Click **Submit**

cPanel will now create a folder at `/home/yourusername/api.yourdomain.com` on the server. This is where your backend files will live.

---

## Step 2 — Upload Your Backend Files

You need to get the files from your local machine at:
```
/Users/tiasmondal166/projects/near-and-now/backend
```
...onto the server at:
```
/home/yourusername/api.yourdomain.com/
```

### Option A — File Manager (easiest, no extra software)

1. In cPanel, go to **Files → File Manager**
2. Navigate into the `api.yourdomain.com` folder in the left panel
3. On your local machine, zip the entire `backend` folder into `backend.zip`
4. In File Manager, click **Upload** in the toolbar
5. Upload `backend.zip`
6. Once uploaded, right-click the zip file → **Extract** → extract into the current directory
7. Make sure the extracted files land directly inside `api.yourdomain.com/`, not inside a subfolder like `api.yourdomain.com/backend/`. If they do, move them up one level.

The final structure should look like:
```
/home/yourusername/api.yourdomain.com/
├── index.js          ← or server.js — your main entry point
├── package.json
├── package-lock.json
├── routes/
├── middleware/
└── ...
```

### Option B — SFTP with FileZilla (better for large projects)

1. In cPanel, go to **Files → FTP Accounts**
2. Create an FTP account or use your main cPanel username
3. Open FileZilla on your computer
4. Connect with:
   - Host: `server216.web-hosting.com`
   - Username: your cPanel username
   - Password: your cPanel password
   - Port: `21` (FTP) or `22` (SFTP — more secure)
5. On the right panel (remote), navigate to `api.yourdomain.com/`
6. On the left panel (local), navigate to your backend folder
7. Drag and drop all backend files to the right panel

---

## Step 3 — Modify the Entry Point for Passenger

This is the most important code change. Passenger loads your app differently from how Railway does. On Railway your app calls `app.listen(3000)` and stays alive. With Passenger, it **imports** your app as a module and handles the listening itself.

Open your backend's `index.js` (or `server.js`) and find the section that starts the server. It probably looks like this:

```js
// Current code — works on Railway, breaks on Passenger
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Change it to this:

```js
// Works on both Passenger (production) and local development
if (require.main === module) {
  // Only runs when you start the file directly with: node index.js
  // This lets you still test locally as normal
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Passenger needs this line — it imports the app and handles the port itself
module.exports = app;
```

**Why this works:** The `require.main === module` check means "only run `app.listen()` if this file was started directly." When Passenger loads your app, it `require()`s the file as a module, so `require.main !== module` — it skips `listen()` and uses the exported `app` instead. When you run `node index.js` locally, it still starts normally.

After making this change, upload the updated `index.js` to the server via File Manager (overwrite the existing file).

---

## Step 4 — Set Up the Node.js App in cPanel

This is where you tell Passenger about your app.

1. In cPanel, scroll to the **Software** section and click **Setup Node.js App**
2. Click the **Create Application** button (top right)
3. Fill in the form:

| Field | What to enter |
|---|---|
| **Node.js version** | Select `20.x` or the highest version available |
| **Application mode** | Select `Production` |
| **Application root** | `api.yourdomain.com` — this is the folder name, not the full path |
| **Application URL** | Select `api.yourdomain.com` from the dropdown |
| **Application startup file** | `index.js` — or `server.js`, whatever your main file is called |

4. Leave **Passenger log file** as default
5. Click **Create**

cPanel will create the Passenger configuration and display an activation command. It looks something like:
```
source /home/yourusername/nodevenv/api.yourdomain.com/20/bin/activate && cd /home/yourusername/api.yourdomain.com
```
**Copy this command** — you need it in the next step.

---

## Step 5 — Install npm Dependencies on the Server

Your `node_modules` folder should **not** be uploaded — it's too large and platform-specific. You need to install packages directly on the server.

1. In cPanel, scroll to **Advanced** and click **Terminal**
   - (If Terminal is not available, contact Namecheap support to enable it)
2. Paste and run the activation command you copied in Step 4, for example:
   ```bash
   source /home/yourusername/nodevenv/api.yourdomain.com/20/bin/activate && cd /home/yourusername/api.yourdomain.com
   ```
   This activates the Node.js virtual environment for your app.
3. Now install the packages:
   ```bash
   npm install --omit=dev
   ```
   The `--omit=dev` flag skips development-only packages (like testing libraries), keeping the install lean.
4. Wait for it to finish — it may take 1–3 minutes depending on how many packages you have.
5. Confirm it worked:
   ```bash
   ls node_modules | head -20
   ```
   You should see a list of package folders.

---

## Step 6 — Add Environment Variables

Your backend needs secret keys to connect to Supabase and Twilio. On Railway these were set in the Railway dashboard. On Namecheap, you set them in the Setup Node.js App panel.

1. Go back to **Software → Setup Node.js App**
2. Click the **Edit** button (pencil icon) next to your app
3. Scroll down to the **Environment Variables** section
4. Click **Add Variable** for each one below:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | *(your Supabase project URL)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(your Supabase service role JWT key)* |
| `TWILIO_ACCOUNT_SID` | *(your Twilio Account SID — from Twilio console)* |
| `TWILIO_AUTH_TOKEN` | *(your Twilio Auth Token — from Twilio console)* |
| `TWILIO_SERVICE_SID` | *(your Twilio Verify Service SID — from Twilio console)* |

> **Do not** add a `PORT` variable. Passenger sets the port internally — if you override it, the app will fail to start.

5. Click **Save** at the bottom of the page

---

## Step 7 — Enable SSL (HTTPS) on the Subdomain

Your app must be accessible over HTTPS, not plain HTTP. Namecheap provides free SSL certificates via Let's Encrypt, applied automatically through a feature called AutoSSL.

1. In cPanel, go to **Security → SSL/TLS Status**
2. Look for `api.yourdomain.com` in the list of domains
3. If it shows a padlock icon with a green tick, SSL is already active — skip to Step 8
4. If it shows a warning or is missing, tick the checkbox next to `api.yourdomain.com`
5. Click **Run AutoSSL** at the top of the page
6. Wait 2–10 minutes, then refresh the page — it should now show a green padlock
7. Test it in your browser: go to `https://api.yourdomain.com` — you should not get any certificate warning

---

## Step 8 — Start and Test the App

1. Go to **Software → Setup Node.js App**
2. Find your app in the list
3. Click the **Start** button (or **Restart** if it's already running)
4. The status indicator should turn green

Test that the backend is responding by opening a browser or running:
```bash
curl https://api.yourdomain.com/health
```
Replace `/health` with a real route your backend exposes. You should get a valid response, not an error page.

If you get a 503 or application error:
- Click **Restart** in the Node.js App panel
- Then check the Passenger error log: in File Manager, look for `passenger.log` or `stderr.log` inside `api.yourdomain.com/logs/`
- The most common cause is a missing `module.exports = app` line (Step 3) or a failed `npm install` (Step 5)

---

## Step 9 — Update the API URL in the Mobile App

Now that the backend has a new address, the Expo app needs to know about it.

Open `.env` in this project (`near-now-store_owner`) and change:

```env
# Old — Railway
EXPO_PUBLIC_API_BASE_URL=https://near-and-now-backend-production.up.railway.app

# New — Namecheap
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

Then rebuild the Expo app:
```bash
npx expo start --clear
```

Or if building for production:
```bash
npx expo build:android
npx expo build:ios
```

---

## Step 10 — Run Full Smoke Tests

Before turning off Railway, verify every backend endpoint the app uses:

```bash
# Replace YOUR_TOKEN with a real session token from the app

# 1. Fetch stores for a shopkeeper
curl -s https://api.yourdomain.com/store-owner/stores \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Toggle store online
curl -s -X PATCH https://api.yourdomain.com/store-owner/stores/STORE_ID/online \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": true}'

# 3. Update product quantity
curl -s -X PATCH https://api.yourdomain.com/store-owner/products/PRODUCT_ID/quantity \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'
```

Also test OTP login through the app itself on a real device to confirm Twilio is working end-to-end.

---

## Step 11 — Decommission Railway

Only do this after the smoke tests pass and you have used the app on Namecheap for at least one full session.

1. Go to [railway.app](https://railway.app) and log in
2. Open your backend project
3. Click on the backend service
4. Go to **Settings** (gear icon)
5. Scroll to **Danger Zone**
6. Click **Delete Service** and confirm

This stops the Railway charges immediately.

---

## How to Deploy Future Updates

Every time you change the backend code, do the following:

1. Make and test your changes locally
2. Upload the changed files to `/home/yourusername/api.yourdomain.com/` via File Manager or SFTP (overwrite existing files)
3. If you added new npm packages, open the cPanel Terminal, activate the environment, and run `npm install --omit=dev`
4. Go to **Software → Setup Node.js App** → click **Restart**
5. Test the affected endpoints

---

## Troubleshooting

### App returns 503 / "Application Error"
- The app crashed on startup. Go to File Manager → `api.yourdomain.com/logs/` and read `passenger.log`
- Most likely cause: `module.exports = app` is missing, or `npm install` was not run

### App starts but API calls return 404
- Your routes are probably correct but the subdomain DNS hasn't propagated yet — wait 10–30 minutes
- Or the `Application URL` in Setup Node.js App is set to the wrong domain

### Environment variables not working
- Make sure you clicked **Save** after adding them in Setup Node.js App
- Restart the app after saving — Passenger only reads env vars at startup

### SSL certificate missing
- Re-run AutoSSL from **Security → SSL/TLS Status**
- If your subdomain was created very recently, wait 30 minutes and try again

### `npm install` fails in Terminal
- Make sure you ran the activation command first (the `source ...` line from Step 4)
- Without it, `npm` points to the wrong Node version

---

## Quick Reference

| Item | Value |
|---|---|
| cPanel login | `https://server216.web-hosting.com:2083` |
| Node.js runner | Phusion Passenger (managed by cPanel) |
| App folder on server | `/home/yourusername/api.yourdomain.com/` |
| Public API URL | `https://api.yourdomain.com` |
| SSL | AutoSSL via Let's Encrypt (free, auto-renews) |
| Database | Supabase — no change |
| OTP | Twilio — no change |
| `.env` key to update | `EXPO_PUBLIC_API_BASE_URL` |
