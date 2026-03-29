import { config } from "./config";

/**
 * Google MapView, Geocoding API, and GPS-based pin are enabled only in release builds
 * with EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_MAPS_API_KEY via config).
 * Development (__DEV__) never loads map UI or calls the Geocoding API.
 */
export function isMapsProductionEnabled(): boolean {
  if (__DEV__) return false;
  const k = (config.GOOGLE_MAPS_API_KEY || "").trim();
  return k.length > 0;
}
