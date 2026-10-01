/**
 * Add another store — multi-store ownership (2026-10-02).
 *
 * For an owner who's already signed up. Collects the new store's name, map pin
 * and address (the same AddressFields / MapPinPicker / useMapPin as signup),
 * creates it via POST /store-owner/stores, makes it the selected store, and
 * hands off to the existing per-store verification flow (landing on Status,
 * which links to Documents and Billing). Per the owner's decisions: KYC is uploaded again for each store and
 * billing starts blank, so those screens are reused as-is.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { getSession } from "../session";
import { config } from "../lib/config";
import { isMapsEnabled } from "../lib/maps-env";
import { addStoreToCache, forceFetchStores } from "../lib/appCache";
import { setSelectedStoreId } from "../lib/selectedStore";
import { colors, layout, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { Badge, Button, Card, InlineNotice, ListRow, Screen, Section, TextField, TopBar, triggerHaptic, useToast } from "../components/ui";
import { MapPinPicker } from "../components/signup/MapPinPicker";
import { AddressFields, EMPTY_ADDRESS, type AddressValues } from "../components/signup/AddressFields";
import { useMapPin, type MapPinNotice } from "../components/signup/useMapPin";

const API_BASE = config.API_BASE;
const MAP_HEIGHT_MIN = 220;
const MAP_HEIGHT_MAX = 360;
const MAP_HEIGHT_FRACTION = 0.35;
const TWO_COLUMN_MIN_WIDTH = 400;

export default function AddStoreScreen() {
  const mapsEnabled = isMapsEnabled();
  const { width, height, gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { show: showToast } = useToast();

  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState<AddressValues>(EMPTY_ADDRESS);
  const [touchedName, setTouchedName] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const houseRef = useRef<TextInput>(null);

  const setAddressField = useCallback((key: keyof AddressValues, value: string) => {
    setAddress((a) => ({ ...a, [key]: value }));
  }, []);

  const notify = useCallback(
    ({ title, message }: MapPinNotice) => showToast({ message: message || title, tone: "error" }),
    [showToast]
  );
  const pin = useMapPin({ mapsEnabled, expanded: mapExpanded, onNotice: notify });

  const addressString = [address.house, address.street, address.area, address.city, address.stateName, address.postalCode]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  // The backend requires a real location for an added store (it can't be
  // dispatched orders without one), so the pin must be set when maps work.
  const pinOk = pin.coordsConfirmed || !mapsEnabled;
  const isValid =
    storeName.trim().length > 0 &&
    addressString.length > 0 &&
    pinOk &&
    Number.isFinite(pin.coords.latitude) &&
    Number.isFinite(pin.coords.longitude);

  const missingHint = useMemo(() => {
    const missing: string[] = [];
    if (!storeName.trim()) missing.push("the store name");
    if (!addressString) missing.push("an address line");
    if (missing.length === 0 && !pinOk) return "Move the map to set the store's pin.";
    if (missing.length === 0) return "";
    return `Add ${missing.join(" and ")}${pinOk ? "" : ", and set the pin"}.`;
  }, [storeName, addressString, pinOk]);

  const fail = (message: string) => {
    setSubmitError(message);
    showToast({ message, tone: "error" });
    triggerHaptic("error");
  };

  const submit = async () => {
    if (!isValid || loading) return;
    setSubmitError(null);
    setLoading(true);
    try {
      const session = await getSession();
      if (!session?.token) {
        router.replace("/landing");
        return;
      }
      const res = await fetch(`${API_BASE}/store-owner/stores`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeName.trim(),
          address: addressString,
          latitude: pin.coords.latitude,
          longitude: pin.coords.longitude,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.store?.id) {
        fail(json?.error || "We couldn't add the store right now. Please try again.");
        return;
      }
      // Put the new store in the shared cache *before* switching to it, so
      // every screen resolves the switch to this store (see addStoreToCache),
      // then refresh the list in the background for server-side fields.
      addStoreToCache(json.store);
      await setSelectedStoreId(json.store.id);
      forceFetchStores(session.token, session.user?.id).catch(() => {});
      triggerHaptic("success");
      showToast({ message: `${json.store.name} added. Next, upload its documents.`, tone: "success" });
      // The Status screen, not Documents directly: switching to an unapproved
      // store makes the tabs' approval gate (mounted underneath) redirect to
      // Status anyway, and a redirect landing after our own navigation would
      // bounce the owner off Documents. Status lists the steps with an
      // "Upload documents" button and the step tabs.
      router.replace("/pending-verification");
    } catch (e: any) {
      const isNetwork = /network|fetch|failed to connect|connection refused/i.test(e?.message ?? "");
      fail(isNetwork ? "We couldn't reach our servers. Check your connection and try again." : "We couldn't add the store. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formWidth = Math.min(contentWidth, layout.maxFormWidth);
  const mapHeight = Math.min(MAP_HEIGHT_MAX, Math.max(MAP_HEIGHT_MIN, Math.round(height * MAP_HEIGHT_FRACTION)));

  return (
    <Screen keyboardAvoiding>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <TopBar title="Add a store" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled
      >
        <View style={[styles.column, { width: formWidth }]}>
          <InlineNotice
            tone="info"
            title="Each store is verified separately"
            message="After adding it, you'll upload this store's documents and billing details. It can take orders once our team approves it."
          />

          <Section title="Store">
            <TextField
              label="Store name"
              value={storeName}
              onChangeText={setStoreName}
              onBlur={() => setTouchedName(true)}
              error={touchedName && !storeName.trim() ? "Enter the store name." : undefined}
              placeholder="Fresh Mart – Park Street"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => houseRef.current?.focus()}
              blurOnSubmit={false}
              testID="add-store-name"
            />
          </Section>

          <Section title="Location" action={mapExpanded ? { label: "Hide map", onPress: () => setMapExpanded(false) } : undefined}>
            {mapExpanded ? (
              <MapPinPicker pin={pin} mapsEnabled={mapsEnabled} mapHeight={mapHeight} onScrollLock={(locked) => setScrollEnabled(!locked)} />
            ) : (
              <Card
                padded={false}
                onPress={() => setMapExpanded(true)}
                accessibilityLabel={mapsEnabled ? "Pin the store on the map" : "Store location"}
                accessibilityHint={mapsEnabled ? "Opens the map" : "Shows location details"}
              >
                <ListRow
                  icon="location-outline"
                  iconTile
                  title={mapsEnabled ? "Pin the store on the map" : "Store location"}
                  description={
                    mapsEnabled
                      ? pin.coordsConfirmed
                        ? "Tap to adjust the pin"
                        : "Pan the map to place the pin on the shop entrance"
                      : "Map unavailable — we'll place the shop from the address below."
                  }
                  trailing={
                    mapsEnabled ? (
                      <Badge label={pin.coordsConfirmed ? "Pin set" : "Not set"} tone={pin.coordsConfirmed ? "success" : "warning"} size="sm" />
                    ) : undefined
                  }
                  chevron
                />
              </Card>
            )}
          </Section>

          <Section title="Address">
            <AddressFields ref={houseRef} values={address} onChange={setAddressField} twoColumn={width >= TWO_COLUMN_MIN_WIDTH} />
          </Section>

          <View style={styles.submit}>
            {submitError ? (
              <InlineNotice tone="error" title="Store not added" message={submitError} onDismiss={() => setSubmitError(null)} />
            ) : null}
            <Button label="Add store" size="lg" fullWidth onPress={submit} disabled={!isValid || loading} loading={loading} testID="add-store-submit" />
            {!isValid && missingHint ? (
              <Text style={styles.hint} accessibilityLiveRegion="polite">
                {missingHint}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg },
  column: { alignSelf: "center", gap: spacing.xl },
  submit: { gap: spacing.md },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
