import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card } from "../ui";
import { colors, spacing, typography } from "../../lib/theme";
import { PhotoGalleryGrid, type GalleryImage } from "./PhotoGalleryGrid";
import { computeImagesStatus } from "./documentGroups";

export type StorePhotosCardProps = {
  images: readonly GalleryImage[];
  pending: readonly string[];
  max: number;
  onAdd: () => void;
  onRemoveSaved: (imageId: string) => void;
  onRemovePending: (index: number) => void;
  removingId?: string | null;
  uploading?: boolean;
  disabled?: boolean;
};

/**
 * "Store photos" card: status badge (Ready to save / Saved), "n/5 added"
 * subtitle, the photo grid and, while photos are staged, a one-line hint
 * about saving.
 */
export function StorePhotosCard({
  images,
  pending,
  max,
  onAdd,
  onRemoveSaved,
  onRemovePending,
  removingId = null,
  uploading = false,
  disabled = false,
}: StorePhotosCardProps) {
  const status = computeImagesStatus(images.length, pending.length);
  return (
    <Card title="Store photos" accessory={status ? <Badge label={status.label} tone={status.tone} dot /> : undefined}>
      <View style={styles.body}>
        <Text style={styles.subtitle}>{`${images.length}/${max} added — shown to customers`}</Text>
        <PhotoGalleryGrid
          images={images}
          pending={pending}
          max={max}
          onAdd={onAdd}
          onRemoveSaved={onRemoveSaved}
          onRemovePending={onRemovePending}
          removingId={removingId}
          uploading={uploading}
          disabled={disabled}
        />
        {pending.length > 0 ? <Text style={styles.caption}>Tap Save below to upload these photos.</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  subtitle: { ...typography.description, color: colors.textMuted },
  caption: { ...typography.caption, color: colors.textMuted },
});

export default StorePhotosCard;
