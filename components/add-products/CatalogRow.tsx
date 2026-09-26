import React, { memo, useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, shadows, spacing } from "../../lib/theme";
import { formatINR } from "../../lib/order-utils";
import { formatCategoryLabel, type CatalogProduct } from "./catalog";

export type CatalogRowProps = {
  product: CatalogProduct;
  name: string;
  /** Boolean (not the whole in-flight id) so only the row being added re-renders. */
  adding: boolean;
  onAdd: (product: CatalogProduct) => void;
};

/**
 * One catalog product in the old bordered, shadowed card: 52dp image (icon
 * tile fallback), name (2 lines), "Brand · Category" meta, price · unit and
 * the primary "Add" pill. Memoised — the search field re-renders the list on
 * every keystroke.
 */
export const CatalogRow = memo(function CatalogRow({ product, name, adding, onAdd }: CatalogRowProps) {
  const [imgError, setImgError] = useState(false);
  const handleAdd = useCallback(() => onAdd(product), [onAdd, product]);
  const handleImgError = useCallback(() => setImgError(true), []);
  const uri = !imgError && product.image_url ? product.image_url : null;

  const meta = [product.brand?.trim() || null, product.category ? formatCategoryLabel(product.category) : null].filter(Boolean).join(" · ");
  const selling = product.discounted_price ?? product.base_price ?? product.price;
  const price = selling != null && Number.isFinite(Number(selling)) ? formatINR(selling) : null;
  const unit = product.unit?.trim() || null;
  const priceLine = [price, unit].filter(Boolean).join(" · ");

  return (
    <View style={styles.item} testID={`catalog-row-${product.id}`}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} onError={handleImgError} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.image, styles.imageFallback]}>
          <Ionicons name="cube-outline" size={iconSize.lg} color={colors.textTertiary} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {priceLine ? (
          <Text style={styles.price} numberOfLines={1}>
            {priceLine}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={handleAdd}
        disabled={adding}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`Add ${name}`}
        accessibilityHint="Adds this product to your store"
        accessibilityState={{ disabled: adding, busy: adding }}
        style={({ pressed }) => [styles.addBtn, pressed && !adding && styles.addBtnPressed]}
      >
        {adding ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.addBtnText}>Add</Text>}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  imageFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderLight },
  info: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  meta: { color: colors.textTertiary, fontSize: 11, fontWeight: "500" },
  price: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  addBtn: {
    minWidth: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnPressed: { backgroundColor: colors.primaryDark },
  addBtnText: { color: colors.surface, fontSize: 12, fontWeight: "700" },
});

export default CatalogRow;
