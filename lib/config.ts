/**
 * App config from .env (Expo inlines EXPO_PUBLIC_* when you run "expo start").
 * Use your machine's LAN IP in .env for device testing. Same Supabase project as near-and-now.
 */

const getEnv = (key: string, fallback: string = ""): string => {
  const value = typeof process !== "undefined" && process.env?.[key];
  return typeof value === "string" ? value : fallback;
};

const defaultApi = "http://192.168.0.111:3000";

export const config = {
  /** Store owner API base URL - set EXPO_PUBLIC_API_BASE_URL in .env to your LAN IP */
  API_BASE: getEnv("EXPO_PUBLIC_API_BASE_URL") || defaultApi,

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
