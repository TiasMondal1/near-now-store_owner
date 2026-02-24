/**
 * Supabase client for store owner app.
 * Uses project: https://supabase.com/dashboard/project/bfgqnsyriiuejvlqaylu
 * Same as near-and-now for shared data (orders, stores, etc.).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const url = config.SUPABASE_URL;
const anonKey = config.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
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

export default supabase;
