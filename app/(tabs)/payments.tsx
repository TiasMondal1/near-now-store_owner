import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getSession } from "../../session";
import { getOrdersFromDb, type OrderForStore } from "../../lib/orders-db";
import { supabase } from "../../lib/supabase";
import { colors, radius, spacing } from "../../lib/theme";

function formatINR(value: number): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Sum of unit_price × quantity for all items in an order — the shopkeeper payout amount. */
function computeProductSubtotal(order: OrderForStore): number {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  return items.reduce((sum, it: any) => {
    const qty = Number(it.quantity ?? 0);
    const price = Number(it.price ?? it.unit_price ?? 0);
    return sum + (Number.isFinite(price) ? price * qty : 0);
  }, 0);
}

const DELIVERED_STATUSES = new Set(["delivered", "order_delivered", "completed"]);

type PayoutRow = {
  order: OrderForStore;
  amount: number;
};

export default function PaymentsTab() {
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const load = useCallback(async () => {
    try {
      const s: any = await getSession();
      if (!s?.token) { router.replace("/landing"); return; }

      // Resolve storeId from session or Supabase
      let sid: string | null = s.user?.storeId ?? null;
      if (!sid && supabase) {
        const { data } = await supabase
          .from("stores")
          .select("id")
          .eq("owner_id", s.user?.id)
          .limit(1)
          .maybeSingle();
        sid = data?.id ?? null;
      }
      if (!sid) { setLoading(false); return; }

      const orders = await getOrdersFromDb(sid);
      const delivered = orders.filter((o) => DELIVERED_STATUSES.has(o.status));

      const rows: PayoutRow[] = delivered.map((o) => ({
        order: o,
        amount: computeProductSubtotal(o),
      }));
      // newest first
      rows.sort((a, b) =>
        (b.order.created_at ?? "").localeCompare(a.order.created_at ?? "")
      );
      setPayouts(rows);
    } catch {
      // non-fatal — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalEarned = payouts.reduce((s, p) => s + p.amount, 0);

  const renderItem = ({ item }: { item: PayoutRow }) => {
    const { order, amount } = item;
    const itemCount = Array.isArray(order.order_items) ? order.order_items.length : 0;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push(`/invoice/${order.id}`)}
      >
        <View style={styles.rowLeft}>
          <View style={styles.orderIconWrap}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.orderCode}>#{order.order_code ?? "—"}</Text>
            <Text style={styles.rowSub}>
              {formatDate(order.created_at)} · {itemCount} item{itemCount !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View style={styles.rowRight}>
          <View style={styles.amountPill}>
            <Text style={styles.amountPillText}>{formatINR(amount)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="cash-outline" size={24} color={colors.primary} />
          <View>
            <Text style={styles.brand}>Payouts</Text>
            <Text style={styles.subtitle}>Earnings from Near &amp; Now</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={(item) => item.order.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            payouts.length > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View>
                    <Text style={styles.summaryLabel}>Total earned</Text>
                    <Text style={styles.summaryAmount}>{formatINR(totalEarned)}</Text>
                  </View>
                  <View style={styles.summaryIconWrap}>
                    <Ionicons name="wallet-outline" size={24} color={colors.primary} />
                  </View>
                </View>
                <Text style={styles.summaryNote}>
                  {payouts.length} payout{payouts.length !== 1 ? "s" : ""} from delivered orders · Paid by Near &amp; Now
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="wallet-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No payouts yet</Text>
              <Text style={styles.emptyText}>
                Payouts appear here once orders are delivered. Each entry links to its invoice.
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: -2,
  },

  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryAmount: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  summaryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryNote: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: spacing.sm,
  },

  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  orderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMeta: { flex: 1 },
  orderCode: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  rowSub: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  amountPill: {
    backgroundColor: colors.primary + "14",
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  amountPillText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },

  separator: { height: 0 },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
});
