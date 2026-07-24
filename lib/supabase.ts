import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";

const url = config.SUPABASE_URL;
const anonKey = config.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  if (__DEV__) {
    console.error(
      "[supabase] SUPABASE_URL or SUPABASE_ANON_KEY is empty.\n" +
      "  In EAS builds: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY as Plain Text env vars.\n" +
      "  In local builds: ensure your .env file has these values and run: npm run build:apk"
    );
  }
}

// This app has no real Supabase Auth session (custom phone-OTP + its own
// session token instead), so every direct-from-app Supabase call — including
// writes to `products`/`categories`/`master_products` from lib/storeProducts.ts
// — used to be genuinely anonymous at the Postgres level, distinguishable from
// a random stranger with the (non-secret, bundled-in-every-install) anon key
// only by nothing at all. Injecting the shopkeeper's own session token as a
// custom header (mirroring the admin panel's x-admin-token pattern) lets a new
// RLS policy actually require a real, live shopkeeper session — see
// shopkeeper_authenticated() in supabase/migrations for the matching SQL side.
// Set via setShopkeeperAuthToken() from session.ts whenever the session
// loads/changes; a plain module-level var (not client state) since the
// client itself is a singleton created once at import time, before any
// session exists yet.
let currentShopkeeperToken: string | null = null;
export function setShopkeeperAuthToken(token: string | null) {
  currentShopkeeperToken = token;
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input: RequestInfo | URL, init: RequestInit = {}) => {
            const headers = new Headers(init.headers);
            if (currentShopkeeperToken) {
              headers.set("x-shopkeeper-token", currentShopkeeperToken);
            }
            return fetch(input, { ...init, headers });
          },
        },
      })
    : null;

export default supabase;
