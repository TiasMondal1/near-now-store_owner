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

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export default supabase;
