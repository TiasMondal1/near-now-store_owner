import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../../session";
import { getOrdersFromDb, type OrderForStore } from "../../lib/orders-db";
import { fetchStoresCached, peekStores } from "../../lib/appCache";
import { colors, radius, spacing } from "../../lib/theme";

/** Normalise Postgres timestamps: `2024-01-15 10:30:00+05:30` → ISO with T. */
function safeDate(str: string | null | undefined): Date | null {
  if (!str) return null;
  const s = str.trim().replace(/^(\d{4}-\d{2}-\d{2})\s/, "$1T");
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDateTime(dateStr: string | null | undefined): string {
  const d = safeDate(dateStr);
  if (!d) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  // Use toLocaleString for time-only extraction (reliable across RN engines)
  const time = d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  // Single combined call — same pattern as rider app, proven reliable on Hermes
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatINR(value: number): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * Payout amount = product subtotal only (no delivery/handling).
 * Primary: sum of unit_price × quantity from order_items.
 * Fallback: store_orders.subtotal_amount (already computed server-side).
 */
function computeSubtotal(order: OrderForStore): number {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const fromItems = items.reduce((sum, it: any) => {
    const qty = Number(it.quantity ?? 0);
    const price = Number(it.price ?? it.unit_price ?? 0);
    return sum + (Number.isFinite(price) && price > 0 ? price * qty : 0);
  }, 0);
  if (fromItems > 0) return fromItems;
  // Fall back to subtotal_amount stored on the store_orders row (spread via ...so).
  const stored = Number((order as any).subtotal_amount ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  // Last resort: total_amount from customer_orders (may include delivery fee but beats showing ₹0).
  const total = Number(order.total_amount ?? 0);
  return Number.isFinite(total) ? total : 0;
}

const DELIVERED = new Set(["delivered", "order_delivered", "completed"]);
type Period = "today" | "week" | "all";
type PayoutRow = { order: OrderForStore; amount: number };

/** Parse date from order code like NN20260429-0012 → Apr 29 2026 */
function dateFromOrderCode(code: string | null | undefined): string {
  if (!code) return "";
  const m = code.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return "";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const PayoutCard = React.memo(function PayoutCard({
  item,
  onPress,
}: {
  item: PayoutRow;
  onPress: () => void;
}) {
  const { order, amount } = item;
  const dateLabel = formatDateTime(order.placed_at ?? order.created_at) || dateFromOrderCode(order.order_code);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardAccent} />
      <View style={styles.cardInner}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={styles.cardCode}>#{order.order_code ?? "—"}</Text>
          {dateLabel ? (
            <View style={styles.cardMetaRow}>
              <Ionicons name="calendar-outline" size={12} color={colors.primary} />
              <Text style={styles.cardMetaText}>{dateLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.earningWrap}>
          <Text style={styles.earningLabel}>PAYOUT</Text>
          <Text style={styles.earningText}>{formatINR(amount)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function PaymentsTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [period, setPeriod] = useState<Period>("today");
  const sessionRef = useRef<any>(null);
  const storeIdRef = useRef<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const s: any = await getSession();
      if (!s?.token) { router.replace("/landing"); return; }
      sessionRef.current = s;

      // Use same store-resolution path as other tabs
      let sid = storeIdRef.current;
      if (!sid) {
        const cached = peekStores();
        if (cached?.length) {
          sid = cached[0].id;
        } else {
          const stores = await fetchStoresCached(s.token, s.user?.id);
          sid = stores[0]?.id ?? null;
        }
        storeIdRef.current = sid;
      }
      if (!sid) return;

      const orders = await getOrdersFromDb(sid);
      const delivered = orders.filter((o) => DELIVERED.has(o.status));

      const rows: PayoutRow[] = delivered.map((o) => ({
        order: o,
        amount: computeSubtotal(o),
      }));
      rows.sort((a, b) => {
        const ta = safeDate(a.order.created_at)?.getTime() ?? 0;
        const tb = safeDate(b.order.created_at)?.getTime() ?? 0;
        return tb - ta;
      });
      setPayouts(rows);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);
  useFocusEffect(useCallback(() => { load(false); }, [load]));

  // Period filtering — memoized so these don't recompute on every render
  const { todayPayouts, weekPayouts, todayTotal, weekTotal, allTotal } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = payouts.filter((p) => safeDate(p.order.created_at)?.toDateString() === todayStr);
    const week = payouts.filter((p) => { const d = safeDate(p.order.created_at); return d != null && d >= weekAgo; });
    return {
      todayPayouts: today,
      weekPayouts: week,
      todayTotal: today.reduce((s, p) => s + p.amount, 0),
      weekTotal: week.reduce((s, p) => s + p.amount, 0),
      allTotal: payouts.reduce((s, p) => s + p.amount, 0),
    };
  }, [payouts]);

  const filtered = period === "today" ? todayPayouts : period === "week" ? weekPayouts : payouts;
  const filteredTotal = period === "today" ? todayTotal : period === "week" ? weekTotal : allTotal;
  const periodLabel = period === "today" ? "Today's Earnings" : period === "week" ? "This Week" : "All Time";

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>Payouts</Text>
          {payouts.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{payouts.length}</Text>
            </View>
          )}
        </View>

        {/* Period tabs */}
        <View style={styles.periodRow}>
          {(["today", "week", "all"] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {p === "today" ? "Today" : p === "week" ? "This Week" : "All Time"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="wallet-outline" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.summaryLabel}>{periodLabel}</Text>
              <Text style={styles.summaryValue}>{formatINR(filteredTotal)}</Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBottom}>
            <View style={styles.summaryMeta}>
              <Ionicons name="bag-handle-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.summaryMetaText}>{filtered.length} order{filtered.length !== 1 ? "s" : ""}</Text>
            </View>
            {filtered.length > 0 && (
              <View style={styles.summaryMeta}>
                <Ionicons name="trending-up-outline" size={15} color={colors.success} />
                <Text style={[styles.summaryMetaText, { color: colors.success }]}>
                  Avg {formatINR(filteredTotal / filtered.length)}/order
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick stats */}
        <View style={styles.quickStatsRow}>
          <View style={[styles.quickStat, { backgroundColor: colors.primary + "14" }]}>
            <Text style={[styles.quickStatValue, { color: colors.primary }]}>{formatINR(todayTotal)}</Text>
            <Text style={styles.quickStatLabel}>Today</Text>
          </View>
          <View style={[styles.quickStat, { backgroundColor: colors.warning + "18" }]}>
            <Text style={[styles.quickStatValue, { color: colors.warning }]}>{formatINR(weekTotal)}</Text>
            <Text style={styles.quickStatLabel}>This Week</Text>
          </View>
          <View style={[styles.quickStat, { backgroundColor: colors.success + "14" }]}>
            <Text style={[styles.quickStatValue, { color: colors.success }]}>{formatINR(allTotal)}</Text>
            <Text style={styles.quickStatLabel}>All Time</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Order History</Text>
      </Animated.View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.order.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(false); }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <PayoutCard
              item={item}
              onPress={() => router.push(`/invoice/${item.order.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="wallet-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyText}>
                {period === "today" ? "No earnings today" : period === "week" ? "No earnings this week" : "No payouts yet"}
              </Text>
              <Text style={styles.emptySub}>
                {period === "all"
                  ? "Payouts appear here once orders are delivered"
                  : "Completed orders in this period will show here"}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  header: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // ── Period tabs ────────────────────────────────────────────────
  periodRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  periodTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  periodTabText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
  periodTabTextActive: { color: "#fff" },

  // ── Summary card ───────────────────────────────────────────────
  summaryCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + "25",
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  summaryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryValue: { color: colors.textPrimary, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  summaryDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md },
  summaryBottom: { flexDirection: "row", justifyContent: "space-between" },
  summaryMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryMetaText: { color: colors.textTertiary, fontSize: 13, fontWeight: "500" },

  // ── Quick stats ────────────────────────────────────────────────
  quickStatsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickStat: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  quickStatValue: { fontSize: 15, fontWeight: "800" },
  quickStatLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "600", marginTop: 2 },

  sectionTitle: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },

  list: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xl, gap: spacing.sm },

  // ── Payout card ────────────────────────────────────────────────
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAccent: {
    width: 4,
    backgroundColor: colors.primary,
    alignSelf: "stretch",
  },
  cardInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  cardCode: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMetaText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  earningWrap: {
    alignItems: "flex-end",
    backgroundColor: colors.success + "12",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.success + "35",
    minWidth: 90,
  },
  earningLabel: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  earningText: { color: colors.success, fontSize: 16, fontWeight: "900" },
  // ── Empty state ────────────────────────────────────────────────
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyText: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  emptySub: {
    color: colors.textTertiary,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
