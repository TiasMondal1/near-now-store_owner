import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Skeleton } from "../ui";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { formatINR } from "../../lib/order-utils";

export type PayoutSummaryCardProps = {
  /** Eyebrow above the hero amount, e.g. "Today's Order Value". */
  periodLabel: string;
  /** Sum of order values for the selected period. */
  total: number;
  /** Number of delivered orders in the period. */
  count: number;
  /** Cold load with nothing cached — render a skeleton shaped like the card. */
  loading?: boolean;
};

/**
 * Pre-redesign summary card for Payouts: wallet icon tile, uppercase period
 * eyebrow and the 30/900 rupee total on top; a hairline divider; then the
 * order count and the per-order average underneath. Elevated with
 * `shadows.md` and a faint primary-tinted border, as the original was.
 */
export function PayoutSummaryCard({ periodLabel, total, count, loading = false }: PayoutSummaryCardProps) {
  if (loading) {
    return (
      <View style={styles.card} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.top}>
            <Skeleton.Box width={48} height={48} />
            <View style={styles.topText}>
              <Skeleton.Box width="45%" height={11} />
              <Skeleton.Box width="60%" height={30} />
            </View>
          </View>
          <View style={styles.divider} />
          <Skeleton.Box width="50%" height={13} />
        </View>
      </View>
    );
  }

  const orderWord = count === 1 ? "order" : "orders";
  const avg = count > 0 ? `Avg ${formatINR(total / count)}/order` : null;
  const spoken = `${periodLabel}: ${formatINR(total)}. ${count} ${orderWord}${avg ? `, ${avg}` : ""}`;

  return (
    <View style={styles.card} accessible accessibilityLabel={spoken}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <Ionicons name="wallet-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.topText}>
          <Text style={styles.label} numberOfLines={1}>
            {periodLabel}
          </Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(total)}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.bottom}>
        <View style={styles.meta}>
          <Ionicons name="bag-handle-outline" size={15} color={colors.textTertiary} />
          <Text style={styles.metaText}>
            {count} {orderWord}
          </Text>
        </View>
        {avg ? (
          <View style={styles.meta}>
            <Ionicons name="trending-up-outline" size={15} color={colors.success} />
            <Text style={[styles.metaText, styles.metaSuccess]}>{avg}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary + "18",
    ...shadows.md,
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  topText: { flex: 1, gap: 2 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  value: { color: colors.textPrimary, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md },
  bottom: { flexDirection: "row", justifyContent: "space-between" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: colors.textTertiary, fontSize: 13, fontWeight: "500" },
  metaSuccess: { color: colors.success },
});

export default PayoutSummaryCard;
