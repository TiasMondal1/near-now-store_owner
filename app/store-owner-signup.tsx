import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { clearSession, getSession, saveSession } from "../session";
import { notificationService } from "../lib/notifications";
import { config } from "../lib/config";
import { fetchPlaceAutocomplete, fetchPlaceLatLng, type PlacePrediction } from "../lib/googlePlaces";
import { coalesceEmail, isPlausibleEmail, normalizeSignupEmail } from "../lib/emailForApi";
import { isMapsEnabled } from "../lib/maps-env";
import { normalizeToShopkeeperRole } from "../lib/shopkeeperRole";
import { colors, radius, spacing } from "../lib/theme";
import { peekStores, fetchStoresCached, clearStoreCache, persistStores, type CachedStore } from "../lib/appCache";
import { uploadOwnerImage, OWNER_IMAGE_KEY } from "../lib/storage";
import { fetchVerificationDocuments, type VerificationDocument } from "../lib/verificationDocuments";
import VerificationNavBar from "../components/VerificationNavBar";

const API_BASE = config.API_BASE;
const GOOGLE_MAPS_API_KEY = config.GOOGLE_MAPS_API_KEY;

const PIN_SIZE = 42;
// justifyContent:center places the icon's CENTER at the map center.
// Shift up by half the icon height so the TIP (bottom edge) lands exactly at the map center.
const PIN_REST_Y = -(PIN_SIZE / 2);

export default function StoreOwnerSignupScreen() {
  const mapsEnabled = isMapsEnabled();
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const signupTicket = typeof params.signupTicket === "string" ? params.signupTicket : "";

  // ── Form fields ──────────────────────────────────────────────────────────────
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const radiusKm = "3";
  const [email, setEmail] = useState("");
  const [house, setHouse] = useState("");
  const [street, setStreet] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // ── Map state ────────────────────────────────────────────────────────────────
  const [coords, setCoords] = useState({ latitude: 22.5726, longitude: 88.3639 });
  const [region, setRegion] = useState({
    latitude: 22.5726,
    longitude: 88.3639,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [mapExpanded, setMapExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Reached via direct navigation (the verification nav bar, or the back
  // button from documents/pending-verification) rather than fresh off OTP —
  // unlike the rider app, this app never saves a session before signup
  // completes (see otp.tsx: no saveSession() call in the mode==="signup"
  // branch), so a session existing with no `phone` param already means
  // signup is done. Shows the submitted details read-only instead of the
  // full editable map/address form.
  //
  // `phone` (route param) is available synchronously, so viewOnly is
  // decided on the very first render instead of waiting on an async session
  // check — that's what let Documents/Status render instantly while this
  // screen still sat behind a blank spinner. Seeded from the shared store
  // cache (appCache.ts's peekStores, already warm if the shopkeeper hit
  // Documents/Status first this session) the same way, so store name/address
  // also appear immediately; only the owner's own name/phone/email (session
  // data, not in that cache) fill in a moment later without blocking the
  // rest of the page.
  const cachedStore = !phone ? peekStores()?.[0] ?? null : null;
  const [viewOnly, setViewOnly] = useState(!phone);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existingStore, setExistingStore] = useState<CachedStore | null>(cachedStore);
  const [storeLoadFailed, setStoreLoadFailed] = useState(false);
  // Tracks whether loadStore has ever succeeded — lets the useFocusEffect
  // below self-heal a failed (or not-yet-attempted) first fetch the moment
  // this screen regains focus, instead of relying on the shopkeeper
  // discovering the manual "tap to retry" banner. Mirrors the rider app's
  // signup.tsx profileFetchedRef fix for the identical symptom (cold-start
  // network failure right after signup leaving Details stuck on "—").
  const storeFetchedRef = useRef(!!cachedStore);
  // A returning unapproved owner now lands here (Details) instead of Status
  // — without this, a store that was suspended (an Aadhaar/PAN document
  // rejected post-approval) would have no way to learn why until they
  // manually tapped the Status tab. Suspension always pairs with a rejected
  // onboarding document server-side (see suspendStoreIfApprovedAndGetName),
  // so surfacing rejected docs here restores that visibility regardless of
  // which tab the owner lands on first.
  const [rejectedDocs, setRejectedDocs] = useState<VerificationDocument[]>([]);
  const [ownerName2, setOwnerName2] = useState(""); // read-only display copies, kept separate from the editable form's own state above
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerImageUri, setOwnerImageUri] = useState<string | null>(null);
  const [uploadingOwnerImage, setUploadingOwnerImage] = useState(false);
  // Set only on the fresh (pre-signup) form — there's no account/store yet to
  // attach the photo to, so the actual upload is deferred until handleNext
  // succeeds and a real user id exists (see there for the upload call).
  const [pendingOwnerImageUri, setPendingOwnerImageUri] = useState<string | null>(null);

  // Identity fields (store name/address) must always be authoritative —
  // unlike the home tab's own use of fetchStoresCached (a 10-minute cache,
  // fine for read-heavy dashboard fields), this screen bypasses that cache
  // and hits the network directly every time, then re-persists the fresh
  // result so the rest of the app also gets corrected data. A prior stale/
  // wrong cache entry (e.g. from right after signup) would otherwise keep
  // showing blank/incorrect store name indefinitely for up to 10 minutes.
  const loadStore = async (session: { token: string }) => {
    setStoreLoadFailed(false);
    try {
      const res = await fetch(`${API_BASE}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const json = await res.json().catch(() => null);
      const stores: CachedStore[] = json?.stores ?? [];
      if (stores[0]) {
        storeFetchedRef.current = true;
        setExistingStore(stores[0]);
        await persistStores(stores);
        // Always prefer the server's own owner_image_url over whatever's
        // cached in AsyncStorage from line ~134 above — that read is only a
        // same-mount-tick optimistic placeholder and, on a shared device,
        // can otherwise still be a *previous* shopkeeper's photo left over
        // from before logout. This is the authoritative reconciliation.
        if (stores[0].owner_image_url) {
          setOwnerImageUri(stores[0].owner_image_url);
          AsyncStorage.setItem(OWNER_IMAGE_KEY, stores[0].owner_image_url).catch(() => {});
        } else {
          setOwnerImageUri(null);
          AsyncStorage.removeItem(OWNER_IMAGE_KEY).catch(() => {});
        }
        try {
          const docs = await fetchVerificationDocuments(session.token, stores[0].id);
          setRejectedDocs(docs.filter((d) => d.status === "rejected"));
        } catch {
          /* non-fatal — banner just doesn't show */
        }
      } else {
        storeFetchedRef.current = false;
        setStoreLoadFailed(true);
      }
    } catch {
      storeFetchedRef.current = false;
      setStoreLoadFailed(true);
    }
  };

  useEffect(() => {
    (async () => {
      const savedOwnerImg = await AsyncStorage.getItem(OWNER_IMAGE_KEY);
      if (savedOwnerImg) setOwnerImageUri(savedOwnerImg);

      if (phone) return; // fresh from OTP verify — editable mode, nothing else to load
      const session = await getSession();
      if (!session?.token) {
        setViewOnly(false);
        return;
      }

      setViewOnly(true);
      setOwnerName2(session.user?.name || "");
      setOwnerPhone(session.user?.phone || "");
      setOwnerEmail(session.user?.email || "");

      // Only show a blocking spinner if nothing was available from cache —
      // otherwise the page already has real content on screen and this call
      // just refreshes it in the background.
      if (!cachedStore) setLoadingExisting(true);
      try {
        await loadStore(session);
      } finally {
        setLoadingExisting(false);
      }
    })();
    // `cachedStore` is intentionally read only once at mount to decide
    // whether to show a spinner, not re-evaluated reactively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Self-heals a failed (or not-yet-attempted) first fetch the moment this
  // screen regains focus — e.g. the shopkeeper switching to Status/Documents
  // and back, which is exactly the manual workaround that used to be
  // required to see Store Name/Address populate after a transient
  // cold-start network failure right after signup.
  useFocusEffect(
    React.useCallback(() => {
      if (viewOnly && !storeFetchedRef.current) {
        (async () => {
          const session = await getSession();
          if (session?.token) {
            if (!existingStore) setLoadingExisting(true);
            try {
              await loadStore(session);
            } finally {
              setLoadingExisting(false);
            }
          }
        })();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewOnly])
  );

  const patchExistingStore = async (fields: Record<string, string>) => {
    if (!existingStore?.id) return;
    const session = await getSession();
    if (!session?.token) return;
    try {
      await fetch(`${API_BASE}/store-owner/stores/${existingStore.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      clearStoreCache();
    } catch {
      /* non-fatal */
    }
  };

  const pickOwnerImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;

    if (!viewOnly) {
      // Fresh, pre-signup form — no account/store exists yet to upload
      // against. Just preview it locally; handleNext uploads it for real
      // once signup succeeds and a user id exists.
      setPendingOwnerImageUri(uri);
      setOwnerImageUri(uri);
      return;
    }
    if (ownerImageUri) return; // already set — read-only from here on, mirrors the rider app

    const session = await getSession();
    if (!session?.user?.id) {
      Alert.alert("Can't upload yet", "Your session is still loading — try again in a moment.");
      return;
    }
    setOwnerImageUri(uri);
    setUploadingOwnerImage(true);
    try {
      const res = await uploadOwnerImage(session.user.id, uri);
      if (res.ok) {
        await AsyncStorage.setItem(OWNER_IMAGE_KEY, res.url);
        setOwnerImageUri(res.url);
        await patchExistingStore({ owner_image_url: res.url });
      } else {
        await AsyncStorage.setItem(OWNER_IMAGE_KEY, uri);
      }
    } finally {
      setUploadingOwnerImage(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await notificationService.unregister();
          await clearSession();
          router.replace("/landing");
        },
      },
    ]);
  };

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentering, setRecentering] = useState(false);
  const skipAutocompleteRef = useRef(false);

  // ── Submit state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const mapRef = useRef<MapView>(null);

  // ── Places Autocomplete (debounced) while typing ─────────────────────────────
  useEffect(() => {
    if (!mapsEnabled || !mapExpanded) {
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
          if (!ac.signal.aborted) setPredictions(list.slice(0, 8));
        })
        .catch(() => {
          if (!ac.signal.aborted) setPredictions([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setPredictionsLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [searchQuery, mapsEnabled, mapExpanded]);

  // ── GPS on first map open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapExpanded || !mapsEnabled) return;
    let cancelled = false;
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
          const newRegion = { latitude: lat, longitude: lng, latitudeDelta: 0.003, longitudeDelta: 0.003 };
          setCoords({ latitude: lat, longitude: lng });
          setRegion(newRegion);
          mapRef.current?.animateToRegion(newRegion, 0);
        }
      } catch {
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mapExpanded, mapsEnabled]);

  // ── Map pan handlers ─────────────────────────────────────────────────────────
  const handleRegionChange = () => {
    if (!isMoving) setIsMoving(true);
  };

  const handleRegionChangeComplete = (r: Region) => {
    setIsMoving(false);
    setCoords({ latitude: r.latitude, longitude: r.longitude });
  };

  const applyLatLngToMap = (lat: number, lng: number, duration = 400) => {
    const newRegion = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    };
    setRegion(newRegion);
    setCoords({ latitude: lat, longitude: lng });
    mapRef.current?.animateToRegion(newRegion, duration);
  };

  const selectPrediction = async (item: PlacePrediction) => {
    if (!mapsEnabled || searchLoading) return;
    skipAutocompleteRef.current = true;
    setPredictions([]);
    setSearchFocused(false);
    setSearchQuery(item.description);
    try {
      setSearchLoading(true);
      const ll = await fetchPlaceLatLng(item.place_id);
      if (!ll) {
        Alert.alert("Not found", "Could not load that place. Try another suggestion.");
        return;
      }
      applyLatLngToMap(ll.lat, ll.lng, 450);
    } catch {
      Alert.alert("Error", "Could not load place details. Check your connection.");
    } finally {
      setSearchLoading(false);
    }
  };

  // ── Geocoding search (keyboard / search button) ─────────────────────────────
  const handleSearch = async () => {
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
        Alert.alert("Not found", "No results for that search. Try a more specific address or landmark.");
        return;
      }
      const loc = json.results[0].geometry.location;
      applyLatLngToMap(loc.lat, loc.lng, 0);
    } catch {
      Alert.alert("Error", "Could not search for that address. Check your connection.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRecenterOnDevice = async () => {
    if (!mapsEnabled || locating) return;
    setRecentering(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location", "Allow location to move the map to where you are.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      applyLatLngToMap(pos.coords.latitude, pos.coords.longitude, 500);
    } catch {
      Alert.alert("Location", "Could not get your current position.");
    } finally {
      setRecentering(false);
    }
  };

  // ── Validation ───────────────────────────────────────────────────────────────
  const hasAddressFields =
    house.trim().length > 0 ||
    street.trim().length > 0 ||
    area.trim().length > 0 ||
    city.trim().length > 0 ||
    stateName.trim().length > 0 ||
    postalCode.trim().length > 0;

  const emailNormalized = normalizeSignupEmail(email);
  const emailValid = isPlausibleEmail(emailNormalized);

  const isValid =
    ownerName.trim().length > 0 &&
    storeName.trim().length > 0 &&
    emailValid &&
    hasAddressFields &&
    coords.latitude != null &&
    coords.longitude != null;

  const buildAddressString = () =>
    [house, street, area, city, stateName, postalCode]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleNext = async () => {
    if (!isValid || loading) return;
    if (!phone) {
      Alert.alert("Error", "Missing phone.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/store-owner/signup/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          signupTicket,
          role: "shopkeeper",
          ownerName: ownerName.trim(),
          storeName: storeName.trim(),
          storeAddress: buildAddressString(),
          radiusKm: radiusKm.trim(),
          email: emailNormalized,
          ownerEmail: emailNormalized,
          owner_email: emailNormalized,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      const raw = await res.text();
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        if (!res.ok) {
          Alert.alert("Error", `Server error ${res.status}. Backend may be down or URL wrong.`);
          return;
        }
      }
      if (!res.ok) {
        Alert.alert("Error", json?.error || json?.message || `Server error ${res.status}`);
        return;
      }
      if (!json.success || !json.token || !json.user) {
        Alert.alert("Error", json?.error || json?.message || "Invalid response from server.");
        return;
      }
      const sessionEmail = coalesceEmail(json.user?.email, emailNormalized);
      await saveSession({
        token: json.token,
        user: {
          id: json.user.id,
          name: json.user.name,
          role: normalizeToShopkeeperRole(json.user.role),
          isActivated: json.user.isActivated ?? json.user.is_activated ?? false,
          phone: json.user.phone ?? phone,
          email: sessionEmail || undefined,
        },
      });

      // Best-effort, fire-and-forget — a photo picked before the account
      // existed gets uploaded and attached to the just-created store now
      // that a real user id/token exists. Doesn't block navigation; if it
      // fails, the owner can still add it later from Details or Profile.
      if (pendingOwnerImageUri) {
        (async () => {
          try {
            const uploadRes = await uploadOwnerImage(json.user.id, pendingOwnerImageUri);
            if (!uploadRes.ok) return;
            await AsyncStorage.setItem(OWNER_IMAGE_KEY, uploadRes.url);
            const stores = await fetchStoresCached(json.token, json.user.id);
            const newStore = stores[0];
            if (newStore?.id) {
              await fetch(`${API_BASE}/store-owner/stores/${newStore.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${json.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ owner_image_url: uploadRes.url }),
              });
              clearStoreCache();
            }
          } catch {
            /* non-fatal */
          }
        })();
      }

      router.replace("/registration-success");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const isNetwork = /network|fetch|failed to connect|connection refused/i.test(msg);
      Alert.alert(
        "Error",
        isNetwork
          ? `Cannot reach the server. Make sure the backend is running at ${API_BASE} and try again.`
          : msg || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Render (view-only, post-signup) ──────────────────────────────────────────
  if (viewOnly) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ animation: "fade" }} />
        <ScrollView contentContainerStyle={styles.viewOnlyScroll}>
          <View>
            <VerificationNavBar active="details" />

            <View style={viewOnlyStyles.avatarSection}>
              <TouchableOpacity
                style={viewOnlyStyles.avatarTouch}
                onPress={pickOwnerImage}
                disabled={uploadingOwnerImage || !!ownerImageUri}
                activeOpacity={ownerImageUri ? 1 : 0.8}
              >
                {uploadingOwnerImage ? (
                  <View style={viewOnlyStyles.avatar}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : ownerImageUri ? (
                  <Image source={{ uri: ownerImageUri }} style={viewOnlyStyles.avatar} />
                ) : (
                  <View style={viewOnlyStyles.avatar}>
                    <Ionicons name="person" size={32} color={colors.primary} />
                  </View>
                )}
                {ownerImageUri ? (
                  <View style={viewOnlyStyles.lockBadge}>
                    <Ionicons name="lock-closed" size={11} color="#fff" />
                  </View>
                ) : (
                  <View style={viewOnlyStyles.camBadge}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={viewOnlyStyles.avatarHint}>
                {ownerImageUri ? "Photo already on file — locked" : "Tap to add your photo"}
              </Text>
            </View>
            <Text style={viewOnlyStyles.title}>Your Details</Text>
            <Text style={viewOnlyStyles.subtitle}>Submitted — shown read-only until you&apos;re verified</Text>

            {rejectedDocs.length > 0 && (
              <View style={viewOnlyStyles.rejectionBanner}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={viewOnlyStyles.rejectionBannerTitle}>Action needed — a document was rejected</Text>
                  {rejectedDocs.map((doc) => (
                    <Text key={doc.doc_type} style={viewOnlyStyles.rejectionBannerText}>
                      {doc.doc_type.replace(/_/g, " ")}
                      {doc.rejection_reason ? ` — ${doc.rejection_reason}` : ""}
                    </Text>
                  ))}
                  <TouchableOpacity
                    style={viewOnlyStyles.rejectionBannerBtn}
                    onPress={() => router.push("/upload-documents")}
                    activeOpacity={0.8}
                  >
                    <Text style={viewOnlyStyles.rejectionBannerBtnText}>Go to Documents</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {loadingExisting ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : (
              <>
                <View style={viewOnlyStyles.card}>
                  <Text style={viewOnlyStyles.label}>Phone</Text>
                  <View style={viewOnlyStyles.readOnlyField}>
                    <Ionicons name="call-outline" size={18} color={colors.textTertiary} />
                    <Text style={viewOnlyStyles.readOnlyText}>{ownerPhone || "—"}</Text>
                  </View>

                  <Text style={viewOnlyStyles.label}>Your Name</Text>
                  <TextInput
                    style={[viewOnlyStyles.input, viewOnlyStyles.inputReadOnly]}
                    value={ownerName2 || "—"}
                    editable={false}
                  />

                  <Text style={viewOnlyStyles.label}>Store Name</Text>
                  <TextInput
                    style={[viewOnlyStyles.input, viewOnlyStyles.inputReadOnly]}
                    value={existingStore?.name || (storeLoadFailed ? "Couldn't load" : "—")}
                    editable={false}
                  />

                  <Text style={viewOnlyStyles.label}>Email</Text>
                  <TextInput
                    style={[viewOnlyStyles.input, viewOnlyStyles.inputReadOnly]}
                    value={ownerEmail || "—"}
                    editable={false}
                  />

                  <Text style={viewOnlyStyles.label}>Store Address</Text>
                  <TextInput
                    style={[viewOnlyStyles.input, viewOnlyStyles.inputReadOnly, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
                    value={existingStore?.address || (storeLoadFailed ? "Couldn't load" : "—")}
                    editable={false}
                    multiline
                  />

                  {storeLoadFailed && (
                    <TouchableOpacity
                      style={viewOnlyStyles.retryBtn}
                      onPress={async () => {
                        const session = await getSession();
                        if (session?.token) await loadStore(session);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={14} color={colors.primary} />
                      <Text style={viewOnlyStyles.retryBtnText}>Couldn&apos;t load store details — tap to retry</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={viewOnlyStyles.nextStepCard}>
                  <View style={viewOnlyStyles.nextStepIcon}>
                    <Ionicons name="lock-closed-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={viewOnlyStyles.nextStepCopy}>
                    <Text style={viewOnlyStyles.nextStepTitle}>These details are locked for now</Text>
                    <Text style={viewOnlyStyles.nextStepText}>
                      Name, store name, and address can&apos;t be changed here. Once you&apos;re verified, update them from your Profile page.
                    </Text>
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity style={viewOnlyStyles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={viewOnlyStyles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render (fresh signup form) ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ animation: "fade" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        // Android already resizes via AndroidManifest's
        // windowSoftInputMode="adjustResize" — stacking "height" behavior on
        // top of that double-shrinks the content on Android.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={scrollEnabled}
            nestedScrollEnabled
          >
            <View style={styles.header}>
              <Text style={styles.tag}>Near&Now · Shopkeeper</Text>
              <Text style={styles.title}>Set up your store</Text>
              <Text style={styles.subtitle}>
                {mapsEnabled
                  ? "Pan the map to drop the pin on your shop entrance, pick a search suggestion, or use the current-location button. Then fill in your address below."
                  : "Enter your store address below. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to your .env (dev) or build env (release) to enable the map, suggestions, and GPS."}
              </Text>
            </View>

            <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
              <TouchableOpacity
                style={viewOnlyStyles.avatarTouch}
                onPress={pickOwnerImage}
                disabled={uploadingOwnerImage}
                activeOpacity={0.8}
              >
                {uploadingOwnerImage ? (
                  <View style={viewOnlyStyles.avatar}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : ownerImageUri ? (
                  <Image source={{ uri: ownerImageUri }} style={viewOnlyStyles.avatar} />
                ) : (
                  <View style={viewOnlyStyles.avatar}>
                    <Ionicons name="person" size={32} color={colors.primary} />
                  </View>
                )}
                <View style={viewOnlyStyles.camBadge}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={viewOnlyStyles.avatarHint}>
                {ownerImageUri ? "Tap to change your photo" : "Add your photo (optional)"}
              </Text>
            </View>

            <View style={styles.form}>
              {/* Owner + Store name */}
              <View style={styles.row}>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Your name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={ownerName}
                    onChangeText={setOwnerName}
                    placeholder="Full name"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Store name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={storeName}
                    onChangeText={setStoreName}
                    placeholder="Fresh Mart"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              {/* Phone (read-only) */}
              <View style={styles.inputBlock}>
                <Text style={styles.label}>Phone</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>{phone || "+91 ••••••••••"}</Text>
                </View>
              </View>

              {/* Email */}
              <View style={styles.inputBlock}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@store.com"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                {!emailValid && emailNormalized.length > 0 && (
                  <Text style={styles.errorText}>Please enter a valid email address.</Text>
                )}
              </View>

              {/* ── MAP SECTION ──────────────────────────────────────────────── */}
              <View style={styles.inputBlock}>
                <Text style={styles.label}>Store location</Text>

                {!mapExpanded ? (
                  <TouchableOpacity
                    style={styles.mapTriggerBox}
                    onPress={() => setMapExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="location-outline" size={28} color={colors.primary} />
                    <Text style={styles.mapTriggerText}>
                      {mapsEnabled ? "Tap to pin your store on the map" : "Tap to enter store location & address"}
                    </Text>
                    <Text style={styles.mapTriggerSub}>
                      {mapsEnabled
                        ? "Pan the map to place the pin exactly"
                        : "Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable map, live suggestions, and GPS."}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {mapsEnabled && (
                      <View style={styles.searchWrap}>
                        <View style={styles.searchRow}>
                          <TextInput
                            style={styles.searchInput}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search area, street or landmark…"
                            placeholderTextColor={colors.textTertiary}
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => {
                              setTimeout(() => setSearchFocused(false), 300);
                            }}
                          />
                          <TouchableOpacity
                            style={styles.searchButton}
                            onPress={handleSearch}
                            disabled={searchLoading}
                            activeOpacity={0.85}
                          >
                            {searchLoading ? (
                              <ActivityIndicator size="small" color={colors.surface} />
                            ) : (
                              <Ionicons name="search" size={18} color={colors.surface} />
                            )}
                          </TouchableOpacity>
                        </View>
                        {searchFocused && (predictions.length > 0 || predictionsLoading) && (
                          <View style={styles.suggestionsBox}>
                            {predictionsLoading ? (
                              <View style={styles.suggestionsLoading}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={styles.suggestionsLoadingText}>Finding places…</Text>
                              </View>
                            ) : (
                              predictions.map((p) => (
                                <Pressable
                                  key={p.place_id}
                                  style={({ pressed }) => [
                                    styles.suggestionRow,
                                    pressed && styles.suggestionRowPressed,
                                  ]}
                                  onPress={() => selectPrediction(p)}
                                >
                                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                                  <Text style={styles.suggestionText} numberOfLines={2}>
                                    {p.description}
                                  </Text>
                                </Pressable>
                              ))
                            )}
                          </View>
                        )}
                      </View>
                    )}

                    <View
                      style={styles.mapContainer}
                      collapsable={false}
                      onTouchStart={mapsEnabled ? () => setScrollEnabled(false) : undefined}
                      onTouchEnd={mapsEnabled ? () => setScrollEnabled(true) : undefined}
                      onTouchCancel={mapsEnabled ? () => setScrollEnabled(true) : undefined}
                    >
                      {!mapsEnabled ? (
                        <View style={styles.devMapPlaceholder}>
                          <Ionicons name="map-outline" size={40} color={colors.textTertiary} />
                          <Text style={styles.devMapPlaceholderText}>
                            Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in your .env or build environment. Until then, default
                            coordinates are used — fill the address below. Enable Places API on the key for search
                            suggestions.
                          </Text>
                        </View>
                      ) : locating ? (
                        <View style={styles.mapPlaceholderCenter}>
                          <ActivityIndicator />
                          <Text style={styles.locatingText}>Fetching location…</Text>
                        </View>
                      ) : (
                        <>
                          <MapView
                            ref={mapRef}
                            style={styles.map}
                            provider={PROVIDER_GOOGLE}
                            initialRegion={region}
                            userInterfaceStyle="light"
                            onRegionChange={handleRegionChange}
                            onRegionChangeComplete={handleRegionChangeComplete}
                            scrollEnabled
                            zoomEnabled
                            moveOnMarkerPress={false}
                            {...(Platform.OS === "android"
                              ? { poiClickEnabled: false }
                              : {})}
                          />

                          <View style={styles.pinOverlay} pointerEvents="none">
                            <View style={styles.pinCenterLayer}>
                              <View style={{ transform: [{ translateY: PIN_REST_Y }] }}>
                                <Ionicons name="location-sharp" size={PIN_SIZE} color="#E53935" />
                              </View>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.recenterButton}
                            onPress={handleRecenterOnDevice}
                            disabled={recentering || locating}
                            activeOpacity={0.85}
                            accessibilityLabel="Center map on my location"
                          >
                            {recentering ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Ionicons name="navigate" size={22} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </View>

                    <View style={styles.coordsRow}>
                      <Ionicons
                        name={mapsEnabled && isMoving ? "locate-outline" : "checkmark-circle"}
                        size={14}
                        color={mapsEnabled && isMoving ? colors.textTertiary : colors.primary}
                      />
                      <Text style={[styles.coordsLabel, mapsEnabled && isMoving && styles.coordsMoving]}>
                        {!mapsEnabled
                          ? `  Default pin: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                          : isMoving
                            ? "  Moving…"
                            : `  ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* ── ADDRESS FORM ─────────────────────────────────────────────── */}
              {mapExpanded && (
                <View style={styles.addressSection}>
                  <Text style={styles.addressSectionTitle}>Store address</Text>
                  <Text style={styles.addressSectionHint}>
                    Fill in manually — this is the address shown to customers.
                  </Text>
                  <View style={styles.twoColumnRow}>
                    <View style={styles.halfInputBlock}>
                      <Text style={styles.label}>Shop / House no.</Text>
                      <TextInput
                        style={styles.textInput}
                        value={house}
                        onChangeText={setHouse}
                        placeholder="Shop no."
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <View style={styles.halfInputBlock}>
                      <Text style={styles.label}>Street</Text>
                      <TextInput
                        style={styles.textInput}
                        value={street}
                        onChangeText={setStreet}
                        placeholder="Street / road"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                  </View>
                  <View style={styles.twoColumnRow}>
                    <View style={styles.halfInputBlock}>
                      <Text style={styles.label}>Area / Locality</Text>
                      <TextInput
                        style={styles.textInput}
                        value={area}
                        onChangeText={setArea}
                        placeholder="Area / locality"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <View style={styles.halfInputBlock}>
                      <Text style={styles.label}>City</Text>
                      <TextInput
                        style={styles.textInput}
                        value={city}
                        onChangeText={setCity}
                        placeholder="City"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                  </View>
                  <View style={styles.twoColumnRow}>
                    <View style={styles.halfInputBlock}>
                      <Text style={styles.label}>State</Text>
                      <TextInput
                        style={styles.textInput}
                        value={stateName}
                        onChangeText={setStateName}
                        placeholder="State"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <View style={styles.halfInputBlock}>
                      <Text style={styles.label}>PIN code</Text>
                      <TextInput
                        style={styles.textInput}
                        value={postalCode}
                        onChangeText={setPostalCode}
                        placeholder="PIN code"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.bottomSection}>
            <TouchableOpacity
              activeOpacity={isValid && !loading ? 0.85 : 1}
              onPress={handleNext}
              disabled={!isValid || loading}
              style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{loading ? "Saving..." : "Complete registration"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backRow} onPress={() => router.replace("/landing")}>
              <Text style={styles.backText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  scrollContent: { paddingBottom: spacing.xl },
  viewOnlyScroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  // Header
  header: { paddingTop: spacing.lg, gap: 6, marginBottom: spacing.lg },
  tag: { fontSize: 11, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1.4 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  // Form layout
  form: { gap: spacing.lg },
  row: { flexDirection: "row", gap: spacing.md },
  twoColumnRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  halfInputBlock: { flex: 1 },
  inputBlock: { width: "100%" },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  textInput: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  readonlyBox: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  readonlyText: { fontSize: 13, color: colors.textSecondary },
  errorText: { marginTop: spacing.xs, fontSize: 11, color: colors.error },

  // Map trigger
  mapTriggerBox: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceVariant,
  },
  mapTriggerText: { fontSize: 15, fontWeight: "600", color: colors.primary },
  mapTriggerSub: { fontSize: 12, color: colors.textTertiary },

  // Search bar
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.textPrimary,
    fontSize: 14,
  },
  searchButton: {
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    zIndex: 20,
    elevation: 8,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  suggestionsBox: {
    marginTop: 4,
    maxHeight: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  suggestionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  suggestionsLoadingText: { fontSize: 13, color: colors.textSecondary },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionRowPressed: { backgroundColor: colors.surfaceVariant },
  suggestionText: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 19 },

  // Map container + pin
  mapContainer: {
    borderRadius: radius.lg,
    overflow: "hidden",
    height: 260,
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1 },
  mapPlaceholderCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  locatingText: { color: colors.textSecondary, marginTop: 8, fontSize: 13 },
  devMapPlaceholder: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceVariant,
  },
  devMapPlaceholderText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },

  // Drop-pin overlay
  pinOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Each layer fills the overlay and centers its single child at the map center
  pinCenterLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  recenterButton: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 6,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.5,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Coordinates label
  coordsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  coordsLabel: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
  coordsMoving: {
    color: colors.textTertiary,
  },

  // Address section
  addressSection: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addressSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  addressSectionHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },

  // Bottom actions
  bottomSection: { marginTop: spacing.md, gap: spacing.sm },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  buttonDisabled: { backgroundColor: colors.primaryDark, opacity: 0.7 },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.surface },
  backRow: { alignItems: "center" },
  backText: { fontSize: 12, color: colors.primary, fontWeight: "500" },
});

const viewOnlyStyles = StyleSheet.create({
  rejectionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.error + "0C",
    borderWidth: 1,
    borderColor: colors.error + "30",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rejectionBannerTitle: { color: colors.error, fontSize: 13, fontWeight: "700", marginBottom: 2 },
  rejectionBannerText: { color: colors.error, fontSize: 12, lineHeight: 17, textTransform: "capitalize" },
  rejectionBannerBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  rejectionBannerBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  avatarTouch: { position: "relative" },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: "hidden",
  },
  camBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  lockBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarHint: { fontSize: 12, color: colors.textTertiary, marginTop: spacing.sm },
  avatarSection: { alignItems: "center", marginTop: spacing.md, marginBottom: spacing.md },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: "800", marginBottom: spacing.xs },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: spacing.lg,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 48,
    color: colors.textPrimary,
    fontSize: 15,
  },
  inputReadOnly: { backgroundColor: colors.surfaceVariant, color: colors.textSecondary },
  readOnlyField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  readOnlyText: { color: colors.textSecondary, fontSize: 15 },
  nextStepCopy: { flex: 1 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
  },
  retryBtnText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  nextStepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primary + "30",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  nextStepIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  nextStepTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  nextStepText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.error + "35",
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: spacing.md,
    backgroundColor: colors.error + "06",
  },
  logoutText: { color: colors.error, fontSize: 15, fontWeight: "700" },
});
