import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Badge } from "../ui";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";

export type GalleryImage = { id: string; url: string };

export type PhotoGalleryGridProps = {
  /** Saved photos (from the server). The first one is the cover. */
  images: readonly GalleryImage[];
  /** Staged local uris, not yet uploaded. */
  pending: readonly string[];
  /** Maximum photos (saved + staged). The Add tile hides at this count. */
  max: number;
  onAdd: () => void;
  onRemoveSaved: (imageId: string) => void;
  onRemovePending: (index: number) => void;
  /** Id of the saved photo currently being removed (spinner on that tile). */
  removingId?: string | null;
  /** True while staged photos upload — disables Add and pending-remove. */
  uploading?: boolean;
  disabled?: boolean;
  testID?: string;
};

const GAP = spacing.md;
const REMOVE = 28;
const REMOVE_HIT_SLOP = (layout.touchTarget - REMOVE) / 2;

/**
 * Square thumbnails, 3 per row on phones / 4 on wide screens (sized from the
 * measured container width), with a 28dp remove button (44dp effective
 * target) hanging off the corner, a "Cover" badge on the first saved photo, a
 * "New" badge on staged photos, and an Add tile while under `max`.
 *
 * Each tile is an unclipped frame (so the remove button can overhang) around
 * a clipped, rounded surface that holds the image and badge.
 */
export function PhotoGalleryGrid({
  images,
  pending,
  max,
  onAdd,
  onRemoveSaved,
  onRemovePending,
  removingId = null,
  uploading = false,
  disabled = false,
  testID,
}: PhotoGalleryGridProps) {
  const { isWide } = useLayout();
  const perRow = isWide ? 4 : 3;
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  const tile = width > 0 ? Math.floor((width - GAP * (perRow - 1)) / perRow) : 0;
  const total = images.length + pending.length;
  const showAdd = total < max;
  const size = { width: tile, height: tile };

  return (
    <View style={styles.grid} onLayout={onLayout} testID={testID} accessibilityRole="list">
      {tile > 0
        ? [
            ...images.map((img, idx) => {
              const removing = removingId === img.id;
              return (
                <View key={img.id} style={[styles.tile, size]}>
                  <View style={styles.surface}>
                    <Image source={{ uri: img.url }} style={styles.image} accessibilityIgnoresInvertColors />
                    {idx === 0 ? <Badge label="Cover" size="sm" style={styles.badge} /> : null}
                  </View>
                  <Pressable
                    onPress={() => onRemoveSaved(img.id)}
                    disabled={disabled || removing}
                    hitSlop={REMOVE_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${idx + 1}`}
                    accessibilityState={{ disabled: disabled || removing, busy: removing }}
                    style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
                  >
                    {removing ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <Ionicons name="close-outline" size={iconSize.md} color={colors.textPrimary} />
                    )}
                  </Pressable>
                </View>
              );
            }),
            ...pending.map((uri, idx) => (
              <View key={`pending-${uri}`} style={[styles.tile, size]}>
                <View style={[styles.surface, styles.surfacePending]}>
                  <Image source={{ uri }} style={styles.image} accessibilityIgnoresInvertColors />
                  <Badge label="New" tone="info" size="sm" style={styles.badge} accessibilityLabel="New, ready to save" />
                </View>
                <Pressable
                  onPress={() => onRemovePending(idx)}
                  disabled={disabled || uploading}
                  hitSlop={REMOVE_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove new photo ${idx + 1}`}
                  accessibilityState={{ disabled: disabled || uploading }}
                  style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
                >
                  <Ionicons name="close-outline" size={iconSize.md} color={colors.textPrimary} />
                </Pressable>
              </View>
            )),
            showAdd ? (
              <Pressable
                key="add"
                onPress={onAdd}
                disabled={disabled || uploading}
                accessibilityRole="button"
                accessibilityLabel="Add store photo"
                accessibilityHint={`${total} of ${max} added`}
                accessibilityState={{ disabled: disabled || uploading, busy: uploading }}
                style={({ pressed }) => [
                  styles.add,
                  size,
                  pressed && !(disabled || uploading) && styles.addPressed,
                  (disabled || uploading) && styles.disabled,
                ]}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="add-outline" size={iconSize.lg} color={colors.primary} />
                    <Text style={styles.addText}>Add</Text>
                  </>
                )}
              </Pressable>
            ) : null,
          ]
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, width: "100%" },
  tile: { overflow: "visible" },
  surface: {
    flex: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceVariant,
  },
  surfacePending: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  image: { ...StyleSheet.absoluteFillObject },
  badge: { position: "absolute", left: spacing.xs, bottom: spacing.xs },
  remove: {
    position: "absolute",
    top: -spacing.sm,
    right: -spacing.sm,
    width: REMOVE,
    height: REMOVE,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  removePressed: { backgroundColor: colors.surfaceVariant },
  add: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  addPressed: { backgroundColor: colors.primaryBorder },
  addText: { ...typography.labelStrong, color: colors.primary },
  disabled: { opacity: layout.disabledOpacity },
});

export default PhotoGalleryGrid;
