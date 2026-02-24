# Store Owner Backend (OTP = near-and-now + Twilio)

The **Store Owner** app uses the **near-and-now** backend for **OTP (Twilio)**.

- Set **`EXPO_PUBLIC_API_BASE_URL`** to the near-and-now backend base URL, e.g. `http://YOUR_LAN_IP:3000` (port **3000**, no `/api`).

## OTP (already wired)

- **Send OTP:** `POST {API_BASE}/api/auth/send-otp` with `{ phone }` (Twilio).
- **Verify OTP:** `POST {API_BASE}/api/auth/verify-otp` with `{ phone, otp, role: "store_owner" }`.  
  Backend returns `mode: "login"` (token + user) or `mode: "signup"` (go to store signup).

## Store owner registration

- **Complete registration:** `POST {API_BASE}/store-owner/signup/complete` with body:  
  `phone`, `ownerName`, `storeName`, `storeAddress`, `radiusKm`, `email`, `latitude`, `longitude`.  
  Backend creates an **app_users** row with **role `store_owner`** and a **stores** row in Supabase, then returns `{ success, token, user }`.

**Supabase (run in SQL Editor if needed):**

1. **Enum:** If signup fails with "invalid input value for enum user_role", run:  
   `near-and-now/supabase/add-store-owner-role.sql`
2. **Stores table:** If you get **"permission denied for table stores"**, run:  
   `near-and-now/supabase/grant-stores-insert.sql`  
   This grants `INSERT` (and `SELECT`, `UPDATE`) on `stores` to `service_role` so the backend can create stores on signup.
3. **Backend .env:** Set `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Settings → API) so the backend uses the service role client; otherwise it falls back to anon and may hit permission errors.

## Run the near-and-now backend (for OTP)

From the **near-and-now** project:

```bash
cd ../near-and-now/backend
npm install
# Put Twilio keys in .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SERVICE_SID
npm run dev
```

Server runs at `http://0.0.0.0:3000` so your phone can reach it. Same Wi‑Fi and `EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:3000` in the store owner app `.env`.

## Other store-owner APIs (stores, orders, inventory)

Routes like `/store-owner/stores`, `/store-owner/orders`, etc. are **not** in the near-and-now backend yet. When you add them, host them on the same backend (or another) and keep using the same `API_BASE` (or a separate env var) in the app.
