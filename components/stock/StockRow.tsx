import React, { memo, useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Switch } from "../ui";
import { colors, iconSize, radius, spacing } from "../../lib/theme";
import type { StockProduct } from "../../lib/useStoreStock";

export type StockRowProps = {
  product: StockProduct;
  /** Store is online — switches are locked while offline. */
  storeActive: boolean;
  /** This row's toggle is in flight. */
  toggling: boolean;
  showSeparator: boolean;
  onToggle: (product: StockProduct) => void;
  /** Trash button and long-press on the row (outside the controls) open the remove flow (ConfirmSheet). */
  onRemove: (product: StockProduct) => void;
};

const THUMB = 44;
const REMOVE_BTN = 32;

/**
 * One product in the old "Your Stock" row style: 44dp thumbnail from the
 * master product's `image_url` (icon tile fallback), status dot, name 14/500,
 * unit 11, the availability `Switch` where the Active/Off pill used to sit and
 * an outlined 32dp trash button. The row itself is a non-accessible
 * `Pressable` so both controls stay individually reachable to screen readers;
 * the wrapper only adds the long-press shortcut.
 */
export const StockRow = memo(function StockRow({ product, storeActive, toggling, showSeparator, onToggle, onRemove }: StockRowProps) {
  const isActive = product.is_active !== false;
  const [imgError, setImgError] = useState(false);
  const handleToggle = useCallback(() => onToggle(product), [onToggle, product]);
  const handleRemove = useCallback(() => onRemove(product), [onRemove, product]);
  const handleImgError = useCallback(() => setImgError(true), []);
  const uri = !imgError && product.image_url ? product.image_url : null;

  return (
    <Pressable
      accessible={false}
      onLongPress={handleRemove}
      style={({ pressed }) => [styles.row, showSeparator && styles.separator, pressed && styles.pressed]}
      testID={`stock-row-${product.id}`}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.thumb} onError={handleImgError} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name="cube-outline" size={iconSize.md} color={colors.textTertiary} />
        </View>
      )}
      <View style={[styles.dot, { backgroundColor: isActive ? colors.success : colors.border }]} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        {product.unit ? (
          <Text style={styles.unit} numberOfLines={1}>
            {product.unit}
          </Text>
        ) : null}
      </View>
      <Switch
        value={isActive}
        onValueChange={handleToggle}
        disabled={!storeActive || toggling}
        accessibilityLabel={`${product.name} availability`}
        accessibilityHint={!storeActive ? "Go online to change availability" : isActive ? "Turns this product off" : "Makes this product available"}
      />
      <Pressable
        onPress={handleRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${product.name}`}
        accessibilityHint="Removes this product from your store"
        style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
      >
        <Ionicons name="trash-outline" size={iconSize.sm} color={colors.error} />
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  separator: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  pressed: { backgroundColor: colors.surfaceVariant },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "500", color: colors.textPrimary },
  unit: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  removeBtn: {
    width: REMOVE_BTN,
    height: REMOVE_BTN,
    borderRadius: REMOVE_BTN / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.error + "4D",
    backgroundColor: colors.error + "0F",
  },
  removeBtnPressed: { backgroundColor: colors.error + "26" },
});

export default StockRow;
