import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState, ErrorState, Skeleton } from "../ui";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import type { StockProduct } from "../../lib/useStoreStock";

export type StockSummaryCardProps = {
  products: StockProduct[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onManage: () => void;
  onAddProducts: () => void;
};

/**
 * Home's "Your Stock" card in the old card style: title, "{n} products in
 * store" subtitle and a "Manage" link into the Inventory tab. Cold load →
 * skeleton line; cold failure → compact ErrorState; zero products → compact
 * EmptyState with "Add products".
 */
export function StockSummaryCard({ products, loading, error, onRetry, onManage, onAddProducts }: StockSummaryCardProps) {
  const total = products.length;
  const active = products.filter((p) => p.is_active !== false).length;

  let body: React.ReactNode;
  if (loading && total === 0) {
    body = <Skeleton.Text lines={1} width="60%" />;
  } else if (error && total === 0) {
    body = (
      <ErrorState
        compact
        icon="cloud-offline-outline"
        title="Couldn't load your inventory"
        message="Check your connection and try again."
        action={{ onPress: onRetry }}
      />
    );
  } else if (total === 0) {
    body = (
      <EmptyState
        compact
        icon="cube-outline"
        title="No products yet"
        message="Add items from the catalog to start selling."
        action={{ label: "Add products", onPress: onAddProducts }}
      />
    );
  } else {
    body = (
      <View style={styles.body}>
        <View style={styles.statRow}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={styles.count}>
            {active} active · {total - active} off
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Your Stock
          </Text>
          <Text style={styles.sub}>
            {total} product{total !== 1 ? "s" : ""} in store
          </Text>
        </View>
        <Pressable
          onPress={onManage}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Manage"
          accessibilityHint="Opens the Inventory tab"
          style={({ pressed }) => [styles.manageBtn, pressed && styles.manageBtnPressed]}
        >
          <Text style={styles.manageText}>Manage</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  flex: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primary + "25",
  },
  manageBtnPressed: { backgroundColor: colors.primaryBorder },
  manageText: { fontSize: 13, fontWeight: "600", color: colors.primary },
  body: { gap: spacing.xs },
  statRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  count: { fontSize: 14, fontWeight: "500", color: colors.textPrimary },
});

export default StockSummaryCard;
