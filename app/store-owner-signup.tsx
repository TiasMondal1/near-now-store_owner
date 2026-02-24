import React, { useCallback, useEffect, useState } from "react";
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
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useLocalSearchParams, router } from "expo-router";
import { saveSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;
const GOOGLE_MAPS_API_KEY = config.GOOGLE_MAPS_API_KEY;

export default function StoreOwnerSignupScreen() {
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";

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
  const [formattedAddress, setFormattedAddress] = useState("");

  const [coords, setCoords] = useState<{ latitude: number; longitude: number }>({ latitude: 22.5726, longitude: 88.3639 });
  const [region, setRegion] = useState({
    latitude: 22.5726,
    longitude: 88.3639,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const [loading, setLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Fetch location only when user opens the map
  useEffect(() => {
    if (!mapExpanded) return;
    let cancelled = false;
    (async () => {
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) {
          setLocating(false);
          return;
        }
        const last = await Location.getLastKnownPositionAsync();
        const cur = last ?? (await Location.getCurrentPositionAsync().catch(() => null));
        if (cur && !cancelled) {
          const lat = cur.coords.latitude;
          const lng = cur.coords.longitude;
          setCoords({ latitude: lat, longitude: lng });
          setRegion((r) => ({ ...r, latitude: lat, longitude: lng }));
          await reverseGeocode(lat, lng);
        }
      } catch {
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mapExpanded]);

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

  const buildAddressString = () => {
    const parts = [
      house.trim(),
      street.trim(),
      area.trim(),
      city.trim(),
      stateName.trim(),
      postalCode.trim(),
    ].filter(Boolean);
    return parts.join(", ");
  };

  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    try {
      setReverseLoading(true);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!json || json.status !== "OK" || !json.results || !json.results[0]) return;
      const result = json.results[0];
      setFormattedAddress(result.formatted_address || "");
      let houseVal = "";
      let streetVal = "";
      let areaVal = "";
      let cityVal = "";
      let stateVal = "";
      let postalVal = "";
      const comps = result.address_components || [];
      comps.forEach((c: any) => {
        if (c.types.includes("street_number")) houseVal = c.long_name;
        if (c.types.includes("route")) streetVal = c.long_name;
        if (c.types.includes("sublocality") || c.types.includes("sublocality_level_1")) areaVal = c.long_name;
        if (c.types.includes("locality")) cityVal = c.long_name;
        if (c.types.includes("administrative_area_level_1")) stateVal = c.long_name;
        if (c.types.includes("postal_code")) postalVal = c.long_name;
      });
      if (houseVal) setHouse(houseVal);
      if (streetVal) setStreet(streetVal);
      if (areaVal) setArea(areaVal);
      if (cityVal) setCity(cityVal);
      if (stateVal) setStateName(stateVal);
      if (postalVal) setPostalCode(postalVal);
    } catch {
    } finally {
      setReverseLoading(false);
    }
  }, []);

  const handleMarkerDragStart = () => {
    setScrollEnabled(false);
  };

  const handleMarkerDragEnd = (e: any) => {
    setScrollEnabled(true);
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ latitude, longitude });
    setRegion((prev) => ({ ...prev, latitude, longitude }));
    reverseGeocode(latitude, longitude);
  };

  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ latitude, longitude });
    setRegion((prev) => ({ ...prev, latitude, longitude }));
    reverseGeocode(latitude, longitude);
  };

  const handleNext = async () => {
    if (!isValid || loading) return;
    if (!phone) {
      Alert.alert("Error", "Missing phone.");
      return;
    }
    const addressString = buildAddressString() || formattedAddress;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/store-owner/signup/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          ownerName: ownerName.trim(),
          storeName: storeName.trim(),
          storeAddress: addressString,
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
        // Server returned HTML or non-JSON (e.g. 404 page)
        if (!res.ok) {
          Alert.alert("Error", `Server error ${res.status}. Backend may be down or URL wrong.`);
          return;
        }
      }
      if (!res.ok) {
        const msg = json?.error || json?.message || `Server error ${res.status}`;
        Alert.alert("Error", msg);
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
          role: json.user.role ?? "store_owner",
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled} nestedScrollEnabled={true}>
            <View style={styles.header}>
              <Text style={styles.tag}>Near&Now · Store Owner</Text>
              <Text style={styles.title}>Set up your store</Text>
              <Text style={styles.subtitle}>Drag the pin to your shop entrance — address fields autofill.</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.row}>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Your name</Text>
                  <TextInput style={styles.textInput} value={ownerName} onChangeText={setOwnerName} placeholder="Full name" placeholderTextColor={colors.textTertiary} />
                </View>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Store name</Text>
                  <TextInput style={styles.textInput} value={storeName} onChangeText={setStoreName} placeholder="Fresh Mart" placeholderTextColor={colors.textTertiary} />
                </View>
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Phone</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>{phone || "+91 ••••••••••"}</Text>
                </View>
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.textInput} value={email} onChangeText={setEmail} placeholder="you@store.com" placeholderTextColor={colors.textTertiary} autoCapitalize="none" keyboardType="email-address" />
                {!emailValid && emailTrimmed.length > 0 && <Text style={styles.errorText}>Please enter a valid email address.</Text>}
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Store location</Text>
                {!mapExpanded ? (
                  <TouchableOpacity
                    style={styles.mapTriggerBox}
                    onPress={() => setMapExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.mapTriggerText}>Tap to set store location on map</Text>
                    <Text style={styles.mapTriggerSub}>Then fill or edit address below</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {formattedAddress ? <Text style={styles.addressPreview}>{formattedAddress}{reverseLoading ? " • updating..." : ""}</Text> : <Text style={styles.addressPreviewMuted}>Move the pin or tap the map{reverseLoading ? " • updating..." : ""}</Text>}
                    <View style={styles.mapContainer}>
                      {locating ? (
                        <View style={styles.mapPlaceholderCenter}>
                          <ActivityIndicator />
                          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Fetching location…</Text>
                        </View>
                      ) : (
                        <MapView
                          style={styles.map}
                          provider={PROVIDER_GOOGLE}
                          initialRegion={region}
                          onPress={handleMapPress}
                          scrollEnabled={true}
                          zoomEnabled={true}
                        >
                          <Marker
                            coordinate={coords}
                            draggable
                            onDragStart={handleMarkerDragStart}
                            onDragEnd={handleMarkerDragEnd}
                            tracksViewChanges={false}
                          />
                        </MapView>
                      )}
                    </View>
                    <View style={styles.twoColumnRow}>
                      <View style={styles.halfInputBlock}>
                        <Text style={styles.label}>Shop / House no.</Text>
                        <TextInput style={styles.textInput} value={house} onChangeText={setHouse} placeholder="Shop no." placeholderTextColor={colors.textTertiary} />
                      </View>
                      <View style={styles.halfInputBlock}>
                        <Text style={styles.label}>Street</Text>
                        <TextInput style={styles.textInput} value={street} onChangeText={setStreet} placeholder="Street / road" placeholderTextColor={colors.textTertiary} />
                      </View>
                    </View>
                    <View style={styles.twoColumnRow}>
                      <View style={styles.halfInputBlock}>
                        <Text style={styles.label}>Area / Locality</Text>
                        <TextInput style={styles.textInput} value={area} onChangeText={setArea} placeholder="Area / locality" placeholderTextColor={colors.textTertiary} />
                      </View>
                      <View style={styles.halfInputBlock}>
                        <Text style={styles.label}>City</Text>
                        <TextInput style={styles.textInput} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.textTertiary} />
                      </View>
                    </View>
                    <View style={styles.twoColumnRow}>
                      <View style={styles.halfInputBlock}>
                        <Text style={styles.label}>State</Text>
                        <TextInput style={styles.textInput} value={stateName} onChangeText={setStateName} placeholder="State" placeholderTextColor={colors.textTertiary} />
                      </View>
                      <View style={styles.halfInputBlock}>
                        <Text style={styles.label}>PIN code</Text>
                        <TextInput style={styles.textInput} value={postalCode} onChangeText={setPostalCode} placeholder="PIN code" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" />
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={styles.bottomSection}>
            <TouchableOpacity activeOpacity={isValid && !loading ? 0.85 : 1} onPress={handleNext} disabled={!isValid || loading} style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}>
              <Text style={styles.buttonText}>{loading ? "Saving..." : "Complete registration"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
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
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  scrollContent: { paddingBottom: spacing.xl },
  header: { paddingTop: spacing.lg, gap: 6, marginBottom: spacing.lg },
  tag: { fontSize: 11, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1.4 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  form: { gap: spacing.lg },
  row: { flexDirection: "row", gap: spacing.md },
  twoColumnRow: { flexDirection: "row", gap: spacing.md },
  halfInputBlock: { flex: 1 },
  inputBlock: { width: "100%" },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  textInput: { borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: colors.textPrimary, fontSize: 15 },
  readonlyBox: { borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center" },
  readonlyText: { fontSize: 13, color: colors.textSecondary },
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
    backgroundColor: colors.surfaceVariant,
  },
  mapTriggerText: { fontSize: 16, fontWeight: "600", color: colors.primary },
  mapTriggerSub: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
  mapContainer: { marginTop: spacing.sm, borderRadius: radius.lg, overflow: "hidden", height: 220, borderWidth: 1, borderColor: colors.border },
  map: { flex: 1 },
  mapPlaceholderCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  addressPreview: { fontSize: 12, color: colors.textSecondary },
  addressPreviewMuted: { fontSize: 12, color: colors.textTertiary },
  errorText: { marginTop: spacing.xs, fontSize: 11, color: colors.error },
  bottomSection: { marginTop: spacing.md, gap: spacing.sm },
  button: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  buttonDisabled: { backgroundColor: colors.primaryDark, opacity: 0.7 },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.surface },
  backRow: { alignItems: "center" },
  backText: { fontSize: 12, color: colors.primary, fontWeight: "500" },
});
