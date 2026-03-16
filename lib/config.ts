/**
 * App config from .env (Expo inlines EXPO_PUBLIC_* when you run "expo start").
 * Use your machine's LAN IP in .env for device testing. Same Supabase project as near-and-now.
 */

const getEnv = (key: string, fallback: string = ""): string => {
  const value = typeof process !== "undefined" && process.env?.[key];
  return typeof value === "string" ? value : fallback;
};

// Fallback API URL if EXPO_PUBLIC_API_BASE_URL is not set.
// Use production backend by default so release builds never hit localhost.
const defaultApi = "https://near-and-now-backend-production.up.railway.app/";

export const config = {
  /** Store owner API base URL - set EXPO_PUBLIC_API_BASE_URL in .env.
   * We strip trailing slashes to avoid URLs like //api/auth/...
   */
  API_BASE: (getEnv("EXPO_PUBLIC_API_BASE_URL") || defaultApi).replace(/\/+$/, ""),

  /** Supabase project URL */
  SUPABASE_URL:
    getEnv("EXPO_PUBLIC_SUPABASE_URL") || getEnv("VITE_SUPABASE_URL") || "",

  /** Supabase anon key for client */
  SUPABASE_ANON_KEY:
    getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY") || "",

  /** Google Maps API key (for map picker in signup, etc.) */
  GOOGLE_MAPS_API_KEY:
    getEnv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY") || getEnv("VITE_GOOGLE_MAPS_API_KEY") || "",
} as const;

export default config;
