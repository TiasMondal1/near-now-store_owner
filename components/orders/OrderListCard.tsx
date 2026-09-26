import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, spacing, typography } from "../../lib/theme";
import { formatINR, formatStatus, getStatusTone } from "../../lib/order-utils";
import { Badge, Card } from "../ui";
import { pluralItems } from "./format";

export type OrderListCardProps = {
  /** Rendered as "#CODE". Pass "—" when unknown. */
  orderCode: string;
  /** Pre-formatted date/time string (e.g. "24 Sept 2026, 10:15 am"). */
  dateTime?: string | null;
  itemCount?: number;
  /** Raw status; formatted and toned via `formatStatus` / `getStatusTone`. */
  status?: string | null;
  /** Rupee amount, formatted with `formatINR`. Hidden when null/undefined. */
  amount?: number | string | null;
  onPress?: () => void;
  /** Default: "Order #CODE, Status, N items, ₹amount". */
  accessibilityLabel?: string;
  /** Default "Opens the invoice" when pressable. */
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Compact one-row order card for history lists (Orders → Previous, Payouts).
 * Code + caption on the left, status badge + amount + chevron on the right.
 */
export const OrderListCard = React.memo(function OrderListCard({
  orderCode,
  dateTime,
  itemCount,
  status,
  amount,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: OrderListCardProps) {
  const statusLabel = formatStatus(status);
  const amountLabel = amount != null ? formatINR(amount) : null;
  const captionParts = [dateTime || null, itemCount != null ? pluralItems(itemCount) : null].filter(Boolean);
  const caption = captionParts.join(" · ");
  const spoken =
    accessibilityLabel ??
    [`Order #${orderCode}`, statusLabel || null, itemCount != null ? pluralItems(itemCount) : null, amountLabel]
      .filter(Boolean)
      .join(", ");

  return (
    <Card
      compact
      onPress={onPress}
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint ?? (onPress ? "Opens the invoice" : undefined)}
      testID={testID}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.code} numberOfLines={1}>
            #{orderCode}
          </Text>
          {caption ? (
            <Text style={styles.caption} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          {statusLabel ? <Badge label={statusLabel} tone={getStatusTone(status)} size="sm" /> : null}
          {amountLabel ? (
            <Text style={styles.amount} numberOfLines={1}>
              {amountLabel}
            </Text>
          ) : null}
        </View>
        {onPress ? <Ionicons name="chevron-forward-outline" size={iconSize.md} color={colors.textTertiary} /> : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  left: { flex: 1, gap: spacing.xxs },
  code: { ...typography.subheading, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textMuted },
  right: { alignItems: "flex-end", gap: spacing.xs, flexShrink: 0 },
  amount: { ...typography.bodyStrong, color: colors.textPrimary },
});

export default OrderListCard;
