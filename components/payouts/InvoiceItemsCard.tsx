import React, { useCallback, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Divider, ListRow } from "../ui";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";
import { formatINR } from "../../lib/order-utils";
import type { LineItem } from "./invoiceHtml";

export type InvoiceItemsCardProps = {
  items: LineItem[];
  /** Orders-tab context: prices and amounts are hidden, quantity moves to the right column. */
  hidePrices: boolean;
};

/** 40dp product thumbnail with a cube fallback; decorative — the row's group label names the item. */
function ItemThumb({ uri }: { uri?: string }) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.thumb}
        onError={onError}
        accessibilityIgnoresInvertColors
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }
  return (
    <View style={styles.thumbFallback} accessibilityElementsHidden importantForAccessibility="no">
      <Ionicons name="cube-outline" size={iconSize.md} color={colors.textTertiary} />
    </View>
  );
}

function ItemRow({ item, hidePrices, last }: { item: LineItem; hidePrices: boolean; last: boolean }) {
  const qtyText = `${item.qty} ${item.unit}`;
  const meta = hidePrices
    ? item.unit
    : item.unitPrice != null
      ? `${qtyText} × ${formatINR(item.unitPrice)}`
      : qtyText;
  const right = hidePrices ? `× ${item.qty}` : item.amount != null ? formatINR(item.amount) : "—";
  const spoken = hidePrices
    ? `${item.name}, quantity ${qtyText}`
    : `${item.name}, ${meta}, ${item.amount != null ? formatINR(item.amount) : "no amount"}`;

  // Static ListRows are not grouped by design; this wrapper reads the row as one item.
  return (
    <View accessible accessibilityLabel={spoken}>
      <ListRow
        leading={<ItemThumb uri={item.image_url} />}
        title={item.name}
        description={meta}
        trailing={
          <Text style={[styles.amount, hidePrices && styles.qty]} numberOfLines={1}>
            {right}
          </Text>
        }
        showSeparator={!last}
      />
    </View>
  );
}

/**
 * Line items of an order as `ListRow`s inside an unpadded `Card`: thumbnail
 * leading, name as title, quantity and unit price on the description line,
 * and the amount as the trailing value. In orders context the trailing value
 * is the quantity.
 */
export function InvoiceItemsCard({ items, hidePrices }: InvoiceItemsCardProps) {
  const { gutter } = useLayout();
  return (
    <Card padded={false}>
      <View style={[styles.head, { paddingHorizontal: gutter }]}>
        <Text style={[styles.headText, styles.flex]} accessibilityRole="header">
          Item
        </Text>
        <Text style={[styles.headText, styles.headRight]}>{hidePrices ? "Qty" : "Amount"}</Text>
      </View>
      <Divider />
      {items.length === 0 ? (
        <Text style={[styles.emptyText, { paddingHorizontal: gutter }]}>No items on this order.</Text>
      ) : (
        items.map((it, i) => <ItemRow key={it.id} item={it} hidePrices={hidePrices} last={i === items.length - 1} />)
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  headText: { ...typography.overline, color: colors.textMuted },
  headRight: { textAlign: "right" },
  amount: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    minWidth: spacing.xxxl + spacing.xl,
  },
  qty: { ...typography.body, color: colors.textSecondary },
  thumb: {
    width: layout.listRowLeadingSlot,
    height: layout.listRowLeadingSlot,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  thumbFallback: {
    width: layout.listRowLeadingSlot,
    height: layout.listRowLeadingSlot,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: spacing.lg,
  },
});

export default InvoiceItemsCard;
