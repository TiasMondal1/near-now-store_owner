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

const PRIMARY = "#765fba";
const BG = "#05030A";
const API_BASE = "http://192.168.1.117:3001";
const GOOGLE_MAPS_API_KEY = "AIzaSyAaEh8Qu-k6nT5BphpHcOUBOZ5RJ7F2QTQ";

export default function StoreOwnerSignupScreen() {
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";

  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [radiusKm, setRadiusKm] = useState("3");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [house, setHouse] = useState("");
  const [street, setStreet] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [formattedAddress, setFormattedAddress] = useState("");

  const [coords, setCoords] = useState({ latitude: 22.5726, longitude: 88.3639 });
  const [region, setRegion] = useState({
    latitude: 22.5726,
    longitude: 88.3639,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const [loading, setLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocating(false);
          return;
        }
        const last = await Location.getLastKnownPositionAsync();
        const cur = last ?? (await Location.getCurrentPositionAsync().catch(() => null));
        if (cur) {
          const lat = cur.coords.latitude;
          const lng = cur.coords.longitude;
          setCoords({ latitude: lat, longitude: lng });
          setRegion((r) => ({ ...r, latitude: lat, longitude: lng }));
          await reverseGeocode(lat, lng);
        }
      } catch {
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  const hasAddressFields =
    house.trim().length > 0 ||
    street.trim().length > 0 ||
    area.trim().length > 0 ||
    city.trim().length > 0 ||
    stateName.trim().length > 0 ||
    postalCode.trim().length > 0;

  const emailTrimmed = email.trim().toLowerCase();
  const emailValid = /\S+@\S+\.\S+/.test(emailTrimmed);
  const passwordValid = password.trim().length >= 6;

  const isValid =
    ownerName.trim().length > 0 &&
    storeName.trim().length > 0 &&
    emailValid &&
    passwordValid &&
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
      const json = await res.json();
      if (json.status !== "OK" || !json.results || !json.results[0]) return;
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

  const handleMarkerDragEnd = (e: any) => {
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
    try {
      setLoading(true);
      const addressString = buildAddressString() || formattedAddress;
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
          password: password.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        Alert.alert("Error", json.error || "Could not complete signup");
        return;
      }
      if (json.token && json.user) {
        await saveSession({
          token: json.token,
          user: {
            id: json.user.id,
            name: json.user.name,
            role: json.user.role,
            isActivated: json.user.isActivated ?? json.user.is_activated ?? true,
            phone: json.user.phone ?? phone,
          },
        });
      }
      router.replace("/owner-home");
    } catch {
      Alert.alert("Error", "Network error, please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={styles.tag}>Near&Now · Store Owner</Text>
              <Text style={styles.title}>Set up your store</Text>
              <Text style={styles.subtitle}>Drag the pin to your shop entrance — address fields autofill.</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.row}>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Your name</Text>
                  <TextInput style={styles.textInput} value={ownerName} onChangeText={setOwnerName} placeholder="Full name" placeholderTextColor="#8278A6" />
                </View>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Store name</Text>
                  <TextInput style={styles.textInput} value={storeName} onChangeText={setStoreName} placeholder="Fresh Mart" placeholderTextColor="#8278A6" />
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
                <TextInput style={styles.textInput} value={email} onChangeText={setEmail} placeholder="you@store.com" placeholderTextColor="#8278A6" autoCapitalize="none" keyboardType="email-address" />
                {!emailValid && emailTrimmed.length > 0 && <Text style={styles.errorText}>Please enter a valid email address.</Text>}
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Password</Text>
                <TextInput style={styles.textInput} value={password} onChangeText={setPassword} placeholder="Minimum 6 characters" placeholderTextColor="#8278A6" secureTextEntry />
                {!passwordValid && password.length > 0 && <Text style={styles.errorText}>Password must be at least 6 characters.</Text>}
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Store location</Text>
                {formattedAddress ? <Text style={styles.addressPreview}>{formattedAddress}{reverseLoading ? " • updating..." : ""}</Text> : <Text style={styles.addressPreviewMuted}>Drag the pin to the shop entrance{reverseLoading ? " • updating..." : ""}</Text>}
                <View style={styles.mapContainer}>
                  {locating ? (
                    <View style={styles.mapPlaceholderCenter}>
                      <ActivityIndicator />
                      <Text style={{ color: "#C4BDEA", marginTop: 8 }}>Fetching location…</Text>
                    </View>
                  ) : (
                    <MapView style={styles.map} provider={PROVIDER_GOOGLE} initialRegion={region} region={region} onPress={handleMapPress}>
                      <Marker coordinate={coords} draggable onDragEnd={handleMarkerDragEnd} />
                    </MapView>
                  )}
                </View>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Shop / House no.</Text>
                  <TextInput style={styles.textInput} value={house} onChangeText={setHouse} placeholder="Shop no." placeholderTextColor="#8278A6" />
                </View>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Street</Text>
                  <TextInput style={styles.textInput} value={street} onChangeText={setStreet} placeholder="Street / road" placeholderTextColor="#8278A6" />
                </View>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>Area / Locality</Text>
                  <TextInput style={styles.textInput} value={area} onChangeText={setArea} placeholder="Area / locality" placeholderTextColor="#8278A6" />
                </View>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>City</Text>
                  <TextInput style={styles.textInput} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#8278A6" />
                </View>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>State</Text>
                  <TextInput style={styles.textInput} value={stateName} onChangeText={setStateName} placeholder="State" placeholderTextColor="#8278A6" />
                </View>
                <View style={styles.halfInputBlock}>
                  <Text style={styles.label}>PIN code</Text>
                  <TextInput style={styles.textInput} value={postalCode} onChangeText={setPostalCode} placeholder="PIN code" placeholderTextColor="#8278A6" keyboardType="number-pad" />
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.bottomSection}>
            <TouchableOpacity activeOpacity={isValid && !loading ? 0.85 : 1} onPress={handleNext} disabled={!isValid || loading} style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}>
              <Text style={styles.buttonText}>{loading ? "Saving..." : "Continue to dashboard"}</Text>
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
  safeArea: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  scrollContent: { paddingBottom: 24 },
  header: { paddingTop: 16, gap: 6, marginBottom: 20 },
  tag: { fontSize: 11, color: "#9C94D7", textTransform: "uppercase", letterSpacing: 1.4 },
  title: { fontSize: 24, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: "#C4BDEA" },
  form: { gap: 18 },
  row: { flexDirection: "row", gap: 12 },
  twoColumnRow: { flexDirection: "row", gap: 12 },
  halfInputBlock: { flex: 1 },
  inputBlock: { width: "100%" },
  label: { fontSize: 13, color: "#B3A9E6", marginBottom: 6 },
  textInput: { borderRadius: 14, backgroundColor: "#120D24", borderWidth: 1, borderColor: "#392B6A", paddingHorizontal: 14, paddingVertical: 10, color: "#FFFFFF", fontSize: 15 },
  readonlyBox: { borderRadius: 14, backgroundColor: "#120D24", borderWidth: 1, borderColor: "#392B6A", paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center" },
  readonlyText: { fontSize: 13, color: "#C4BDEA" },
  mapContainer: { marginTop: 8, borderRadius: 18, overflow: "hidden", height: 220, borderWidth: 1, borderColor: "#3A2D68" },
  map: { flex: 1 },
  mapPlaceholderCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  addressPreview: { fontSize: 12, color: "#C4BDEA" },
  addressPreviewMuted: { fontSize: 12, color: "#7A6FB3" },
  errorText: { marginTop: 4, fontSize: 11, color: "#FF7A7A" },
  bottomSection: { marginTop: 12, gap: 10 },
  button: { borderRadius: 999, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: PRIMARY },
  buttonDisabled: { backgroundColor: "rgba(118, 95, 186, 0.45)" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  backRow: { alignItems: "center" },
  backText: { fontSize: 12, color: "#C4BDEA" },
});
