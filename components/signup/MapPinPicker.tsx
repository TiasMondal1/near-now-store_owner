/**
 * Store-location picker for the signup form: place search with suggestions,
 * a map with a fixed centre pin, a floating recenter button and a status
 * badge. All state comes from `useMapPin`; this file is presentation only.
 */
import React from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Badge, Button, Card, IconButton, ListRow, SearchField } from "../ui";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import type { MapPinController } from "./useMapPin";

// A filled pin is the one glyph here that must read as a marker; its tip is
// what marks the coordinate, so the icon is shifted up by half its height.
const PIN_SIZE = 40;
const PIN_REST_Y = -(PIN_SIZE / 2);
const VISIBLE_SUGGESTIONS = 5;

export type MapPinPickerProps = {
  pin: MapPinController;
  mapsEnabled: boolean;
  /** Height of the map area in dp (the screen derives it from the window). */
  mapHeight: number;
  /**
   * The outer ScrollView must stop scrolling while a finger is on the map,
   * otherwise panning the map scrolls the form instead.
   */
  onScrollLock: (locked: boolean) => void;
};

export function MapPinPicker({ pin, mapsEnabled, mapHeight, onScrollLock }: MapPinPickerProps) {
  const showSuggestions = mapsEnabled && pin.searchFocused && (pin.predictions.length > 0 || pin.predictionsLoading);

  let status: React.ReactNode;
  if (!mapsEnabled) {
    status = (
      <View style={styles.statusRow}>
        <Badge label="Default pin" tone="neutral" icon="location-outline" />
        <Text style={styles.statusCaption}>Our team confirms your shop&apos;s location during verification.</Text>
      </View>
    );
  } else if (pin.isMoving) {
    status = <Badge label="Moving…" tone="neutral" icon="move-outline" />;
  } else if (pin.coordsConfirmed) {
    status = <Badge label="Pin set" tone="success" icon="checkmark-circle" />;
  } else {
    status = (
      <View style={styles.statusRow}>
        <Badge label="Not set" tone="warning" icon="hand-left-outline" />
        <Text style={styles.statusCaption}>Move the map until the pin sits on your shop entrance.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {mapsEnabled ? (
        <View style={styles.searchWrap}>
          <View style={styles.searchRow}>
            <SearchField
              containerStyle={styles.searchField}
              value={pin.searchQuery}
              onChangeText={pin.setSearchQuery}
              placeholder="Search area, street or landmark"
              accessibilityLabel="Search for your store location"
              onSubmitEditing={pin.handleSearch}
              onFocus={pin.onSearchFocus}
              onBlur={pin.onSearchBlur}
            />
            <Button
              label="Search"
              variant="secondary"
              size="md"
              onPress={pin.handleSearch}
              loading={pin.searchLoading}
              disabled={pin.searchLoading}
              accessibilityLabel="Search address"
            />
          </View>

          {showSuggestions ? (
            <Card padded={false}>
              <ScrollView
                style={{ maxHeight: layout.listRowMinHeight * VISIBLE_SUGGESTIONS }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
              >
                {pin.predictionsLoading ? (
                  <ListRow
                    leading={<ActivityIndicator size="small" color={colors.primary} />}
                    title="Finding places…"
                    accessibilityLabel="Finding places"
                  />
                ) : (
                  pin.predictions.map((p, i) => (
                    <ListRow
                      key={p.place_id}
                      icon="location-outline"
                      title={p.description}
                      showSeparator={i < pin.predictions.length - 1}
                      onPress={() => pin.selectPrediction(p)}
                      accessibilityHint="Moves the map to this place"
                    />
                  ))
                )}
              </ScrollView>
            </Card>
          ) : null}
        </View>
      ) : null}

      <View
        style={[styles.mapContainer, { height: mapHeight }]}
        collapsable={false}
        onTouchStart={mapsEnabled ? () => onScrollLock(true) : undefined}
        onTouchEnd={mapsEnabled ? () => onScrollLock(false) : undefined}
        onTouchCancel={mapsEnabled ? () => onScrollLock(false) : undefined}
      >
        {!mapsEnabled ? (
          <View style={styles.placeholder}>
            <Ionicons name="map-outline" size={iconSize.xl} color={colors.textTertiary} />
            <Text style={styles.placeholderText}>
              The map isn&apos;t available right now. Fill in your full address below and our team will confirm your
              shop&apos;s location during verification.
            </Text>
          </View>
        ) : pin.locating ? (
          <View style={styles.placeholder} accessibilityRole="progressbar" accessibilityLabel="Fetching location">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.placeholderText}>Fetching location…</Text>
          </View>
        ) : (
          <>
            <MapView
              ref={pin.mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={pin.region}
              userInterfaceStyle="light"
              onRegionChange={pin.handleRegionChange}
              onRegionChangeComplete={pin.handleRegionChangeComplete}
              scrollEnabled
              zoomEnabled
              moveOnMarkerPress={false}
              {...(Platform.OS === "android" ? { poiClickEnabled: false } : {})}
            />

            <View style={styles.pinOverlay} pointerEvents="none">
              <View style={{ transform: [{ translateY: PIN_REST_Y }] }}>
                <Ionicons name="location" size={PIN_SIZE} color={colors.primary} />
              </View>
            </View>

            <View style={styles.recenter}>
              <IconButton
                icon="navigate-outline"
                variant="floating"
                accessibilityLabel="Center map on my location"
                onPress={pin.handleRecenterOnDevice}
                disabled={pin.recentering || pin.locating}
                color={colors.primary}
              />
              {pin.recentering ? (
                <View style={styles.recenterSpinner} pointerEvents="none">
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null}
            </View>
          </>
        )}
      </View>

      {status}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  searchWrap: { gap: spacing.sm, zIndex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  searchField: { flex: 1 },
  mapContainer: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  map: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  placeholderText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center" },
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  recenter: { position: "absolute", right: spacing.md, bottom: spacing.md },
  recenterSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { gap: spacing.xs },
  statusCaption: { ...typography.caption, color: colors.textMuted },
});

export default MapPinPicker;
