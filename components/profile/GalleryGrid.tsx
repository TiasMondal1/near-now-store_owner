/**
 * "Store photos" card. In edit mode it renders the shared `PhotoGalleryGrid`
 * (Add tile + remove on every saved photo, hidden at `max`); in view mode a
 * read-only grid of the same tiles with a "Cover" badge on the first photo,
 * or a compact `EmptyState` whose action enters edit mode.
 */
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Badge, Card, EmptyState } from "../ui";
import { PhotoGalleryGrid, type GalleryImage } from "../kyc";
import { colors, radius, spacing } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";
import { GALLERY_PLACEHOLDER_ID } from "./useStoreGallery";

export type { GalleryImage };

export type GalleryGridProps = {
  images: readonly GalleryImage[];
  max: number;
  editing: boolean;
  uploading?: boolean;
  /** Id of the photo currently being removed (spinner on that tile). */
  removingId?: string | null;
  onAdd: () => void;
  onRemove: (imageId: string) => void;
  /** Enters edit mode from the empty state's "Add photos" action. */
  onStartEditing?: () => void;
};

const GAP = spacing.md;
const NO_PENDING: readonly string[] = [];
const noop = () => {};

export function GalleryGrid({
  images,
  max,
  editing,
  uploading = false,
  removingId = null,
  onAdd,
  onRemove,
  onStartEditing,
}: GalleryGridProps) {
  const { isWide } = useLayout();
  // Same column count as the shared edit-mode grid so tiles keep their size
  // when toggling Edit.
  const basis = isWide ? "25%" : "33.333%";
  const count = images.length;
  // The optimistic placeholder seeded from `storeInfo.image_url` has no
  // server id, so it can't be removed — keep it out of the editable grid
  // rather than show a remove button that does nothing.
  const editable = images.filter((img) => img.id !== GALLERY_PLACEHOLDER_ID);

  return (
    <Card
      title="Store photos"
      accessory={
        <Badge
          label={`${count} of ${max}`}
          tone={count >= max ? "success" : "warning"}
          accessibilityLabel={`${count} of ${max} photos`}
        />
      }
    >
      {editing ? (
        <PhotoGalleryGrid
          images={editable}
          pending={NO_PENDING}
          max={max}
          onAdd={onAdd}
          onRemoveSaved={onRemove}
          onRemovePending={noop}
          removingId={removingId}
          uploading={uploading}
        />
      ) : count > 0 ? (
        <View style={styles.grid} accessibilityRole="list">
          {images.map((img, idx) => (
            <View key={img.id} style={[styles.cell, { flexBasis: basis, maxWidth: basis }]}>
              <View
                style={styles.tile}
                accessible
                accessibilityRole="image"
                accessibilityLabel={idx === 0 ? "Store cover photo" : `Store photo ${idx + 1}`}
              >
                <Image source={{ uri: img.url }} style={styles.image} accessibilityIgnoresInvertColors />
                {idx === 0 ? <Badge label="Cover" size="sm" style={styles.badge} /> : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          compact
          icon="images-outline"
          title="No store photos yet"
          message={`Add up to ${max} photos so customers recognise your store.`}
          action={onStartEditing ? { label: "Add photos", onPress: onStartEditing } : undefined}
        />
      )}
    </Card>
  );
}

// Layout only. The grid uses flex-basis percentages; the half-gap padding on
// each cell (offset by the grid's negative margin) stands in for `gap`, which
// would overflow a percentage-based row.
const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", margin: -GAP / 2 },
  cell: { padding: GAP / 2 },
  tile: { aspectRatio: 1, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceVariant },
  image: { ...StyleSheet.absoluteFillObject },
  badge: { position: "absolute", left: spacing.xs, bottom: spacing.xs },
});

export default GalleryGrid;
