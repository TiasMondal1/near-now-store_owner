/**
 * Supabase client for store owner app.
 * Uses project: https://supabase.com/dashboard/project/bfgqnsyriiuejvlqaylu
 * Same as near-and-now for shared data (orders, stores, etc.).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const url = config.SUPABASE_URL;
const anonKey = config.SUPABASE_ANON_KEY;

console.log("=== Supabase Initialization ===");
console.log("URL:", url ? `${url.substring(0, 30)}...` : "MISSING");
console.log("Anon Key:", anonKey ? `${anonKey.substring(0, 20)}...` : "MISSING");

if (!url || !anonKey) {
  console.error(
    "❌ [supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
  console.error("Check your .env file has these variables set correctly");
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: undefined, // use custom session (AsyncStorage) if needed
          autoRefreshToken: true,
          persistSession: true,
        },
      })
    : null;

if (supabase) {
  console.log("✅ [supabase] Client initialized successfully");
} else {
  console.error("❌ [supabase] Client NOT initialized - check .env variables");
}

export default supabase;
