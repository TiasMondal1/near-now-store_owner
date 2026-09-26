import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { formatINR, formatStatus, getStatusColor } from "../../lib/order-utils";
import { StatusPill } from "./StatusPill";
import { pluralItems } from "./format";

export type PreviousOrderCardProps = {
  /** Rendered as "#CODE". Pass "—" when unknown. */
  orderCode: string;
  /** Pre-formatted date/time string (e.g. "24 Sept 2026, 10:15 am"). */
  dateTime?: string | null;
  itemCount: number;
  /** Raw status; formatted and coloured via `formatStatus` / `getStatusColor`. */
  status?: string | null;
  /** Rupee amount, formatted with `formatINR`. Hidden when null/undefined. */
  amount?: number | string | null;
  onPress: () => void;
  testID?: string;
};

/**
 * The pre-redesign "prevCard" row for Orders → Previous: 3dp `colors.info`
 * accent stripe, `shadows.sm`, 15/700 code, blue calendar date meta, status
 * pill, and a footer with the blue item count and a chevron to the invoice.
 * (Payouts keeps the neutral `OrderListCard`.)
 */
export const PreviousOrderCard = React.memo(function PreviousOrderCard({
  orderCode,
  dateTime,
  itemCount,
  status,
  amount,
  onPress,
  testID,
}: PreviousOrderCardProps) {
  const statusLabel = formatStatus(status);
  const statusColor = getStatusColor(status);
  const amountLabel = amount != null ? formatINR(amount) : null;
  const spoken = [`Order #${orderCode}`, statusLabel || null, dateTime || null, pluralItems(itemCount), amountLabel]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the invoice"
      testID={testID}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.accent} />
      <View style={styles.content}>
        <View style={styles.top}>
          <View style={styles.left}>
            <Text style={styles.code} numberOfLines={1}>
              #{orderCode}
            </Text>
            {dateTime ? (
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={11} color={colors.info} />
                <Text style={styles.time} numberOfLines={1}>
                  {dateTime}
                </Text>
              </View>
            ) : null}
          </View>
          {statusLabel ? <StatusPill label={statusLabel} color={statusColor} size="sm" /> : null}
        </View>

        <View style={styles.footer}>
          <Ionicons name="cube-outline" size={12} color={colors.info} />
          <Text style={styles.itemCount}>{pluralItems(itemCount)}</Text>
          <View style={styles.spacer} />
          {amountLabel ? (
            <Text style={styles.amount} numberOfLines={1}>
              {amountLabel}
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  pressed: { opacity: 0.72 },
  accent: { width: 3, backgroundColor: colors.info, alignSelf: "stretch" },
  content: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  left: { flex: 1, gap: 4 },
  code: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  time: { color: colors.info, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
    paddingBottom: spacing.sm,
  },
  itemCount: { color: colors.info, fontSize: 12, fontWeight: "600" },
  spacer: { flex: 1 },
  amount: { color: colors.textPrimary, fontSize: 13, fontWeight: "600", marginRight: 2 },
});

export default PreviousOrderCard;
