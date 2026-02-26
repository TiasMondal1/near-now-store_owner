# Store Owner Backend (OTP = near-and-now + Twilio)

The **Store Owner** app uses the **near-and-now** backend for **OTP (Twilio)**.

- Set **`EXPO_PUBLIC_API_BASE_URL`** to the near-and-now backend base URL, e.g. `http://YOUR_LAN_IP:3000` (port **3000**, no `/api`).

## OTP (already wired)

- **Send OTP:** `POST {API_BASE}/api/auth/send-otp` with `{ phone }` (Twilio).
- **Verify OTP:** `POST {API_BASE}/api/auth/verify-otp` with `{ phone, otp, role: "shopkeeper" }`.
  Backend returns `mode: "login"` (token + user) or `mode: "signup"` (go to store signup). App expects `app_users.role` to be `shopkeeper`.
- **Same number, different roles:** One phone number can exist with different roles (e.g. customer, shopkeeper). For this app, treat as **existing user** (return token, `mode: "login"`) **only** when the number is already registered **with role `shopkeeper`**. If the number exists with another role (e.g. only as customer), return **`mode: "signup"` and no token** so the user goes through shopkeeper registration. The app will also redirect to signup if the user has a token but no stores (e.g. backend returned token for a customer).

## Store owner registration

- **Complete registration:** `POST {API_BASE}/store-owner/signup/complete` with body:  
  `phone`, **`role: "shopkeeper"`** (app always sends this), `ownerName`, `storeName`, `storeAddress`, `radiusKm`, `email`, `latitude`, `longitude`.  
  Backend must persist **`role: "shopkeeper"`** in `app_users` (not `store_owner`). From the app the role is always **shopkeeper**; from website/localhost it may be **customer**. Create a **stores** row in Supabase. Return `{ success, token, user }` with `user.role === "shopkeeper"`.

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

## Inventory → products table (DB + API)

The app **writes to and reads from the Supabase `products` table directly** via `lib/storeProducts.ts` (Supabase client with anon key). Inventory and "Your stock" on the main page use this so data is persisted in the DB.

- **Run RLS (required for anon access):** In Supabase → SQL Editor, run `supabase/products-rls-anon.sql` so the app can SELECT/INSERT/UPDATE `products` and SELECT `master_products`. Without this, reads will be empty and writes will fail with permission denied.
- **Env:** Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` so the Supabase client is configured.
- If Supabase is unavailable or returns no data, the app falls back to the backend API and local cache.

## Inventory → products table (required flow – backend API)

**Flow:** `master_products` holds the full catalog. The store owner selects which products are available and sets stock quantity in **Inventory** (and in Add product → Catalog). That data must be stored in a **products** table linked to the store via **stores.id**, so the same products appear in Inventory and anywhere else the store’s products are shown.

- **master_products** – All products (catalog). Filled by admin/seed; store owner does not create rows here.
- **products** – Store-level availability and stock. One row per (store, master_product) (or per custom product). Must be linked to **stores.id** (`store_id`).
- When the store owner sets quantity in Inventory (or adds from Catalog), the backend must **insert or update** rows in **products** with that `store_id`, so those products show up in the products table for that store.

### API contract (backend must implement)

All of these must read/write the **products** table (linked to `stores.id`):

| Method | Endpoint | Purpose |
|--------|----------|--------|
| GET | `{API_BASE}/api/products/master-products?isActive=true` | List all master products (catalog). No auth. |
| GET | `{API_BASE}/store-owner/stores/:storeId/products` | List **products** for that store (join with master_products for name, image, etc.). Return `{ products: [ { id, master_product_id, quantity, is_active, in_stock, ... } ] }`. Price can come from master_products. |
| POST | `{API_BASE}/store-owner/stores/:storeId/products/bulk-from-master` | Body: `{ items: [ { masterProductId, price, quantity } ] }`. For each item, **upsert** into **products** with `store_id = storeId`, `master_product_id`, `quantity` (set `is_active = true`, `in_stock` as needed). So products added from Inventory or Catalog appear in the products table. |
| PATCH | `{API_BASE}/store-owner/products/:id` | Body: `{ quantity }`. Update the **products** row so Inventory and product list stay in sync. Optionally set `in_stock` from `quantity > 0`. |
| POST | `{API_BASE}/store-owner/stores/:storeId/products/custom` | Custom products (no master) may use a different table or flow; your **products** table has `master_product_id` NOT NULL. |

The app sends `storeId` and expects the backend to persist and return data from the **products** table keyed by **stores.id**.

### Current Supabase schema (products table)

Your existing **products** table (linked to **stores.id**):

- **products**: `id` (uuid, PK), `store_id` (uuid, FK → stores.id), `master_product_id` (uuid, FK → master_products.id, NOT NULL), `quantity` (numeric, ≥ 0), `is_active` (boolean, default true), `in_stock` (boolean, default true), `created_at`, `updated_at`. Unique on `(store_id, master_product_id)`. Trigger updates `updated_at`.
- Indexes: `store_id`, `master_product_id`, `is_active`, `(store_id, is_active)` where `is_active = true`.

Backend should read/write this table for Inventory and Catalog flows. Price for display can come from **master_products** (e.g. `base_price`).

## Other store-owner APIs (stores, orders, inventory)

Routes like `/store-owner/stores`, `/store-owner/orders`, etc. are **not** in the near-and-now backend yet. When you add them, host them on the same backend (or another) and keep using the same `API_BASE` (or a separate env var) in the app. Implement the **Inventory → products table** endpoints above so products set in Inventory are stored in the products table linked to **stores.id**.
