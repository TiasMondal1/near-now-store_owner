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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { saveSession } from "../session";
import { config } from "../lib/config";
import { isMapsProductionEnabled } from "../lib/maps-env";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;
const GOOGLE_MAPS_API_KEY = config.GOOGLE_MAPS_API_KEY;

const PIN_SIZE = 42;
// justifyContent:center places the icon's CENTER at the map center.
// Shift up by half the icon height so the TIP (bottom edge) lands exactly at the map center.
const PIN_REST_Y = -(PIN_SIZE / 2);

export default function StoreOwnerSignupScreen() {
  const mapsEnabled = isMapsProductionEnabled();
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";

  // ── Form fields ──────────────────────────────────────────────────────────────
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [radiusKm, setRadiusKm] = useState("3");
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

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Submit state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const mapRef = useRef<MapView>(null);

  // ── GPS on first map open (production + API key only) ────────────────────────
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

  // ── Geocoding search ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!mapsEnabled) return;
    const q = searchQuery.trim();
    if (!q || searchLoading) return;
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
      // latitudeDelta 0.003 ≈ 330 m — street-level zoom where roads are clearly readable
      const newRegion = { latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.003, longitudeDelta: 0.003 };
      setRegion(newRegion);
      setCoords({ latitude: loc.lat, longitude: loc.lng });
      mapRef.current?.animateToRegion(newRegion, 0);
    } catch {
      Alert.alert("Error", "Could not search for that address. Check your connection.");
    } finally {
      setSearchLoading(false);
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

  const emailTrimmed = email.trim().toLowerCase();
  const emailValid = /\S+@\S+\.\S+/.test(emailTrimmed);

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
          role: "shopkeeper",
          ownerName: ownerName.trim(),
          storeName: storeName.trim(),
          storeAddress: buildAddressString(),
          radiusKm: radiusKm.trim(),
          email: emailTrimmed,
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
      await saveSession({
        token: json.token,
        user: {
          id: json.user.id,
          name: json.user.name,
          role: json.user.role ?? "shopkeeper",
          isActivated: json.user.isActivated ?? json.user.is_activated ?? true,
          phone: json.user.phone ?? phone,
        },
      });
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                  ? "Pan the map to drop the pin on your shop entrance, then fill in your address below."
                  : __DEV__
                    ? "Development: enter your store address below. Map, search, and GPS run in a production build with your Maps API key."
                    : "Enter your store address below. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in your production build to enable the map and search."}
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
                {!emailValid && emailTrimmed.length > 0 && (
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
                        : __DEV__
                          ? "No map in dev — use address fields. Production APK enables map + search."
                          : "Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable map, search, and GPS."}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {mapsEnabled && (
                      <View style={styles.searchRow}>
                        <TextInput
                          style={styles.searchInput}
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          placeholder="Search area, street or landmark…"
                          placeholderTextColor={colors.textTertiary}
                          returnKeyType="search"
                          onSubmitEditing={handleSearch}
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
                            {__DEV__
                              ? "Map, search, and GPS are disabled in development. Default coordinates are used — fill the address below to complete signup."
                              : "Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in your production build. Until then, default coordinates are used — fill the address below."}
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
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
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
