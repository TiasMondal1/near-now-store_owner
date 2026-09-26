import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, layout, spacing } from "../../lib/theme";
import { formatINR } from "../../lib/order-utils";
import { triggerHaptic } from "../ui";
import type { AllocationItem } from "./types";

export type OrderItemRowProps = {
  item: AllocationItem;
  /** Inclusion state. Only meaningful with `onToggle`. Default true. */
  checked?: boolean;
  /**
   * Makes the row a 44dp checkbox row (checkbox / square glyph in the leading
   * slot). Omit for the read-only bullet rows of an accepted order.
   */
  onToggle?: (itemId: string) => void;
  disabled?: boolean;
  /** Hairline under the row. Default true. */
  separator?: boolean;
  testID?: string;
};

const CHECK_GLYPH = 22;

/**
 * "{qty} {unit} — {name}" with a trailing price, in the pre-redesign row look.
 *
 * Selectable (incoming): 14/500 text, inline "· ₹price", struck through in
 * `textTertiary` when left out; the whole row is a 44dp checkbox
 * (accessibilityRole="checkbox") — the current include/exclude behaviour.
 * Static (active): 5dp primary bullet, 13/500 `textSecondary` text, price on
 * the right.
 */
export function OrderItemRow({ item, checked = true, onToggle, disabled = false, separator = true, testID }: OrderItemRowProps) {
  const selectable = typeof onToggle === "function";
  const label = `${item.quantity} ${item.unit} — ${item.product_name}`;
  const price = item.price != null ? formatINR(item.price) : null;
  const struck = selectable && !checked;

  if (selectable) {
    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          void triggerHaptic("light");
          onToggle(item.id);
        }}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={price ? `${label}, ${price}` : label}
        accessibilityHint={checked ? "Double tap to leave this item out" : "Double tap to include this item"}
        accessibilityState={{ checked, disabled }}
        testID={testID}
        style={({ pressed }) => [
          styles.row,
          styles.rowSelectable,
          separator && styles.separator,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Ionicons
          name={checked ? "checkbox" : "square-outline"}
          size={CHECK_GLYPH}
          color={checked ? colors.success : colors.textTertiary}
        />
        <Text style={[styles.itemName, struck && styles.itemNameUnchecked]} numberOfLines={1}>
          {label}
          {price ? <Text style={[styles.itemPriceInline, struck && styles.itemNameUnchecked]}> · {price}</Text> : null}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, styles.rowStatic, separator && styles.separator]} testID={testID}>
      <View style={styles.bullet} />
      <Text style={styles.itemText} numberOfLines={1}>
        {label}
      </Text>
      {price ? <Text style={styles.itemPrice}>{price}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  rowSelectable: { minHeight: layout.touchTarget, gap: spacing.sm, paddingVertical: 6 },
  rowStatic: { gap: 8, paddingVertical: 6 },
  separator: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  pressed: { backgroundColor: colors.surfaceVariant },
  disabled: { opacity: layout.disabledOpacity },
  itemName: { color: colors.textPrimary, fontSize: 14, fontWeight: "500", flex: 1 },
  itemNameUnchecked: { color: colors.textTertiary, textDecorationLine: "line-through" },
  itemPriceInline: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, flexShrink: 0 },
  itemText: { color: colors.textSecondary, fontSize: 13, flex: 1, fontWeight: "500" },
  itemPrice: { color: colors.textPrimary, fontSize: 13, fontWeight: "600", flexShrink: 0 },
});

export default OrderItemRow;
