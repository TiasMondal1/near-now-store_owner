/**
 * App config — three-layer fallback chain for every value:
 *
 * 1. process.env.EXPO_PUBLIC_* (static literal access)
 *    Metro/Babel can only inline env vars when they are accessed as static property
 *    expressions — process.env.EXPO_PUBLIC_FOO. Dynamic access like process.env[key]
 *    is never inlined and always returns undefined at runtime in a built app.
 *    So we access every key directly here.
 *
 * 2. Constants.expoConfig.extra
 *    app.config.js runs in the EAS/Expo CLI process (which has access to all env vars
 *    including .env file). Values in `extra` are baked into the app manifest and
 *    available via Constants.expoConfig.extra regardless of Metro env inlining.
 *    This is the reliable fallback for production/local Gradle builds.
 *
 * 3. Hardcoded defaults (only for non-sensitive values like the API base URL).
 */

import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const defaultApi = "https://near-and-now-backend-production.up.railway.app/";

export const config = {
  /** Store owner REST API base URL */
  API_BASE: (
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    extra.apiBaseUrl ||
    defaultApi
  ).replace(/\/+$/, ""),

  /** Supabase project URL */
  SUPABASE_URL: (
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    extra.supabaseUrl ||
    ""
  ).replace(/\/+$/, ""),

  /** Supabase anon (public) key */
  SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    extra.supabaseAnonKey ||
    "",

  /** Google Maps API key */
  GOOGLE_MAPS_API_KEY:
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    extra.googleMapsApiKey ||
    "",
} as const;

export default config;
