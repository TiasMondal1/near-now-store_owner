import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const url = config.SUPABASE_URL;
const anonKey = config.SUPABASE_ANON_KEY;

if (__DEV__ && (!url || !anonKey)) {
  console.warn("[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: undefined,
          autoRefreshToken: true,
          persistSession: true,
        },
      })
    : null;

export default supabase;
