import { config } from "./config";

export type PlacePrediction = { description: string; place_id: string };

function apiKey(): string {
  return (config.GOOGLE_MAPS_API_KEY || "").trim();
}

/** Google Places Autocomplete (legacy REST). Requires Places API enabled for the key. */
export async function fetchPlaceAutocomplete(
  input: string,
  signal?: AbortSignal
): Promise<PlacePrediction[]> {
  const key = apiKey();
  if (!key || input.trim().length < 2) return [];
  const url =
    "https://maps.googleapis.com/maps/api/place/autocomplete/json?" +
    `input=${encodeURIComponent(input.trim())}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal });
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    return [];
  }
  return (json.predictions ?? []).map((p: { description: string; place_id: string }) => ({
    description: p.description,
    place_id: p.place_id,
  }));
}

/** Resolve a place_id to coordinates (Place Details). */
export async function fetchPlaceLatLng(
  placeId: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number } | null> {
  const key = apiKey();
  if (!key) return null;
  const url =
    "https://maps.googleapis.com/maps/api/place/details/json?" +
    `place_id=${encodeURIComponent(placeId)}&fields=geometry&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal });
  const json = await res.json();
  const loc = json.result?.geometry?.location;
  if (loc == null || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
  return { lat: loc.lat, lng: loc.lng };
}
