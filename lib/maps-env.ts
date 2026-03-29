import { config } from "./config";

/**
 * MapView, Places Autocomplete, Geocoding, and GPS are enabled whenever a non-empty
 * Google Maps API key is configured (dev and production). Enable Places API + Geocoding
 * + Maps SDK for Android/iOS on that key in Google Cloud.
 */
export function isMapsEnabled(): boolean {
  return (config.GOOGLE_MAPS_API_KEY || "").trim().length > 0;
}
