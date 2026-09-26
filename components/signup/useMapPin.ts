/**
 * Map-pin state for the store-details form: GPS on first open, Places
 * autocomplete, geocoding search, recenter, and the `coordsConfirmed` guard
 * that stops a denied location permission from silently registering every
 * store at the default Kolkata point.
 *
 * Presentation lives in `MapPinPicker`; this hook owns every side effect so
 * the screen only reads `coords` / `coordsConfirmed` for validation and the
 * submit payload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type MapView from "react-native-maps";
import type { Region } from "react-native-maps";
import * as Location from "expo-location";
import { config } from "../../lib/config";
import { fetchPlaceAutocomplete, fetchPlaceLatLng, type PlacePrediction } from "../../lib/googlePlaces";

const GOOGLE_MAPS_API_KEY = config.GOOGLE_MAPS_API_KEY;

const DEFAULT_LAT = 22.5726;
const DEFAULT_LNG = 88.3639;
const PIN_DELTA = 0.003;
const MAX_PREDICTIONS = 8;
const AUTOCOMPLETE_DEBOUNCE_MS = 350;
const SEARCH_BLUR_DELAY_MS = 300;

export type LatLng = { latitude: number; longitude: number };

export type MapPinNotice = { title: string; message: string };

export type UseMapPinOptions = {
  mapsEnabled: boolean;
  /** The map is on screen (search/autocomplete/GPS only run while expanded). */
  expanded: boolean;
  /** Non-blocking failure feedback (the screen shows a Toast). */
  onNotice: (notice: MapPinNotice) => void;
};

export type MapPinController = {
  mapRef: React.RefObject<MapView | null>;
  coords: LatLng;
  coordsConfirmed: boolean;
  region: Region;
  locating: boolean;
  isMoving: boolean;
  recentering: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchLoading: boolean;
  predictions: PlacePrediction[];
  predictionsLoading: boolean;
  searchFocused: boolean;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  handleSearch: () => Promise<void>;
  selectPrediction: (item: PlacePrediction) => Promise<void>;
  handleRecenterOnDevice: () => Promise<void>;
  handleRegionChange: () => void;
  handleRegionChangeComplete: (r: Region) => void;
};

export function useMapPin({ mapsEnabled, expanded, onNotice }: UseMapPinOptions): MapPinController {
  const [coords, setCoords] = useState<LatLng>({ latitude: DEFAULT_LAT, longitude: DEFAULT_LNG });
  // The coords above are only a map *starting point*. Nothing may be
  // submitted until they have been set by GPS, a place search or the owner
  // moving the pin.
  const [coordsConfirmed, setCoordsConfirmed] = useState(false);
  const [region, setRegion] = useState<Region>({
    latitude: DEFAULT_LAT,
    longitude: DEFAULT_LNG,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [locating, setLocating] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [recentering, setRecentering] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const skipAutocompleteRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsAttemptedRef = useRef(false);

  const mapRef = useRef<MapView | null>(null);

  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  // ── Places Autocomplete (debounced) while typing ───────────────────────────
  useEffect(() => {
    if (!mapsEnabled || !expanded) {
      setPredictions([]);
      return;
    }
    if (skipAutocompleteRef.current) {
      skipAutocompleteRef.current = false;
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      setPredictions([]);
      setPredictionsLoading(false);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setPredictionsLoading(true);
      fetchPlaceAutocomplete(q, ac.signal)
        .then((list) => {
          if (!ac.signal.aborted) setPredictions(list.slice(0, MAX_PREDICTIONS));
        })
        .catch(() => {
          if (!ac.signal.aborted) setPredictions([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setPredictionsLoading(false);
        });
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [searchQuery, mapsEnabled, expanded]);

  // ── GPS on first map open ──────────────────────────────────────────────────
  // Runs once per mount: collapsing and re-expanding the map must not yank a
  // pin the owner has already placed back to the device location.
  useEffect(() => {
    if (!expanded || !mapsEnabled || gpsAttemptedRef.current) return;
    gpsAttemptedRef.current = true;
    let cancelled = false;
    let finished = false;
    (async () => {
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const last = await Location.getLastKnownPositionAsync();
        const cur = last ?? (await Location.getCurrentPositionAsync().catch(() => null));
        if (cur && !cancelled) {
          const lat = cur.coords.latitude;
          const lng = cur.coords.longitude;
          const newRegion = { latitude: lat, longitude: lng, latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA };
          setCoords({ latitude: lat, longitude: lng });
          setCoordsConfirmed(true);
          setRegion(newRegion);
          mapRef.current?.animateToRegion(newRegion, 0);
        }
      } catch {
        /* location unavailable — the owner can still search or drag the pin */
      } finally {
        finished = true;
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
      // Collapsed mid-fetch: clear the spinner state now (the `finally` above
      // skips it once cancelled) and let the next expansion try again.
      if (!finished) {
        gpsAttemptedRef.current = false;
        setLocating(false);
      }
    };
  }, [expanded, mapsEnabled]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  // ── Map pan handlers ───────────────────────────────────────────────────────
  const handleRegionChange = useCallback(() => {
    setIsMoving((m) => (m ? m : true));
  }, []);

  const handleRegionChangeComplete = useCallback((r: Region) => {
    setIsMoving(false);
    setCoords({ latitude: r.latitude, longitude: r.longitude });
    setCoordsConfirmed(true);
    // Remembered so the map re-opens where the owner left it after a collapse.
    setRegion(r);
  }, []);

  const applyLatLngToMap = useCallback((lat: number, lng: number, duration = 400) => {
    const newRegion = { latitude: lat, longitude: lng, latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA };
    setRegion(newRegion);
    setCoords({ latitude: lat, longitude: lng });
    setCoordsConfirmed(true);
    mapRef.current?.animateToRegion(newRegion, duration);
  }, []);

  const selectPrediction = useCallback(
    async (item: PlacePrediction) => {
      if (!mapsEnabled || searchLoading) return;
      skipAutocompleteRef.current = true;
      setPredictions([]);
      setSearchFocused(false);
      setSearchQuery(item.description);
      try {
        setSearchLoading(true);
        const ll = await fetchPlaceLatLng(item.place_id);
        if (!ll) {
          noticeRef.current({ title: "Not found", message: "Could not load that place. Try another suggestion." });
          return;
        }
        applyLatLngToMap(ll.lat, ll.lng, 450);
      } catch {
        noticeRef.current({ title: "Error", message: "Could not load place details. Check your connection." });
      } finally {
        setSearchLoading(false);
      }
    },
    [mapsEnabled, searchLoading, applyLatLngToMap]
  );

  // ── Geocoding search (keyboard / search button) ────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!mapsEnabled) return;
    const q = searchQuery.trim();
    if (!q || searchLoading) return;
    setPredictions([]);
    setSearchFocused(false);
    try {
      setSearchLoading(true);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.results?.length) {
        noticeRef.current({
          title: "Not found",
          message: "No results for that search. Try a more specific address or landmark.",
        });
        return;
      }
      const loc = json.results[0].geometry.location;
      applyLatLngToMap(loc.lat, loc.lng, 0);
    } catch {
      noticeRef.current({ title: "Error", message: "Could not search for that address. Check your connection." });
    } finally {
      setSearchLoading(false);
    }
  }, [mapsEnabled, searchQuery, searchLoading, applyLatLngToMap]);

  const handleRecenterOnDevice = useCallback(async () => {
    if (!mapsEnabled || locating) return;
    setRecentering(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // OS-permission explanation — the one case the design system keeps on Alert.
        Alert.alert("Location", "Allow location to move the map to where you are.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      applyLatLngToMap(pos.coords.latitude, pos.coords.longitude, 500);
    } catch {
      noticeRef.current({ title: "Location", message: "Could not get your current position." });
    } finally {
      setRecentering(false);
    }
  }, [mapsEnabled, locating, applyLatLngToMap]);

  const onSearchFocus = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    setSearchFocused(true);
  }, []);

  // Delayed so a tap on a suggestion lands before the list is hidden.
  const onSearchBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setSearchFocused(false), SEARCH_BLUR_DELAY_MS);
  }, []);

  return {
    mapRef,
    coords,
    coordsConfirmed,
    region,
    locating,
    isMoving,
    recentering,
    searchQuery,
    setSearchQuery,
    searchLoading,
    predictions,
    predictionsLoading,
    searchFocused,
    onSearchFocus,
    onSearchBlur,
    handleSearch,
    selectPrediction,
    handleRecenterOnDevice,
    handleRegionChange,
    handleRegionChangeComplete,
  };
}
