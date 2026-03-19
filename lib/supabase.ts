import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const url = config.SUPABASE_URL;
const anonKey = config.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Log in both dev and production — this is critical missing config, not noise.
  console.error(
    "[supabase] ❌ SUPABASE_URL or SUPABASE_ANON_KEY is empty.\n" +
    `  url="${url}" anonKey="${anonKey ? anonKey.slice(0, 20) + "…" : ""}"\n` +
    "  In EAS builds: ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY\n" +
    "  are set as Plain Text (not Secret) in expo.dev → Project → Environment Variables.\n" +
    "  In local builds: ensure your .env file has these values and run: npm run build:apk"
  );
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
