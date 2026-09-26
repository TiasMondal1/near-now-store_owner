import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { formatINR } from "../../lib/order-utils";

export type PayoutRowProps = {
  /** Rendered as "#CODE". Pass "—" when unknown. */
  orderCode: string;
  /** Pre-formatted caption, e.g. "Delivered Today, 10:15 am". Hidden when empty. */
  dateLabel?: string | null;
  /** Order value in rupees, formatted with `formatINR`. */
  amount: number;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Pre-redesign history row for Payouts: elevated `radius.lg` card with a 4dp
 * primary accent stripe, the order code and a calendar caption on the left,
 * and a success-tinted "ORDER VALUE" amount block on the right.
 */
export const PayoutRow = React.memo(function PayoutRow({
  orderCode,
  dateLabel,
  amount,
  onPress,
  accessibilityLabel,
  accessibilityHint = "Opens the order summary",
  testID,
}: PayoutRowProps) {
  const spoken = accessibilityLabel ?? [`Order #${orderCode}`, dateLabel || null, formatINR(amount)].filter(Boolean).join(", ");
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <View style={styles.accent} />
      <View style={styles.inner}>
        <View style={styles.left}>
          <Text style={styles.code} numberOfLines={1}>
            #{orderCode}
          </Text>
          {dateLabel ? (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={11} color={colors.primary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {dateLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.earningWrap}>
          <Text style={styles.earningLabel}>ORDER VALUE</Text>
          <Text style={styles.earningText} numberOfLines={1}>
            {formatINR(amount)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
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
    ...shadows.md,
  },
  accent: { width: 4, backgroundColor: colors.primary, alignSelf: "stretch" },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  left: { flex: 1, gap: 4 },
  code: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.primary, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  earningWrap: {
    alignItems: "flex-end",
    backgroundColor: colors.success + "0D",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 90,
  },
  earningLabel: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  earningText: { color: colors.success, fontSize: 16, fontWeight: "800" },
});

export default PayoutRow;
