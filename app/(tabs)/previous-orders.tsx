import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../lib/theme";
import { getOrderByIdFromDb, getOrdersFromDb } from "../../lib/orders-db";
import { getStatusColor, formatStatus, isDelivered } from "../../lib/order-utils";
import { fetchStoresCached, peekStores } from "../../lib/appCache";
import { useSmartPoll } from "../../lib/useSmartPoll";
import { config } from "../../lib/config";

const API_BASE = config.API_BASE;

type AllocationItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
};

type Allocation = {
  allocation_id: string;
  order_id: string;
  order_code: string;
  alloc_status: "pending_acceptance" | "accepted";
  pickup_code: string | null;
  placed_at: string;
  items: AllocationItem[];
  customer_area: string | null;
  customer_distance: string | null;
};

function formatMoneyINR(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

export default function OrdersTab() {
  const [tab, setTab] = useState<"active" | "previous">("active");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  // Active orders (accepted allocations)
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(true);

  // Previous orders (delivered)
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [prevLoading, setPrevLoading] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) {
          if (!cancelled) router.replace("/landing");
          return;
        }
        if (cancelled) return;
        setSession(s);

        const cached = peekStores();
        if (cached && cached.length > 0) {
          setStoreId(cached[0].id);
          setAllocLoading(false);
          setPrevLoading(false);
          return;
        }

        const stores = await fetchStoresCached(s.token, s.user?.id);
        if (cancelled) return;
        if (stores[0]) setStoreId(stores[0].id);
      } catch (e) {
        if (__DEV__) console.warn("[orders-tab] Bootstrap error:", e);
      } finally {
        if (!cancelled) {
          setAllocLoading(false);
          setPrevLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchActiveOrders = useCallback(async () => {
    if (!session?.token) return;
    try {
      const res = await fetch(`${API_BASE}/shopkeeper/orders`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const json = await res.json();
      if (json?.success) {
        setAllocations((json.orders || []).filter((a: Allocation) => a.alloc_status === "accepted"));
      }
    } catch { /* silent */ }
  }, [session?.token]);

  const toNumber = (v: any) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : NaN;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const getDisplayTotal = (o: any) => {
    const items = Array.isArray(o?.order_items) ? o.order_items : [];
    if (items.length > 0) {
      return items.reduce((sum: number, it: any) => {
        const qty = toNumber(it?.quantity ?? 0);
        const price = toNumber(it?.price ?? it?.unit_price ?? 0);
        if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
        return sum + qty * price;
      }, 0);
    }
    const candidates = [
      o?.total_amount, o?.totalAmount, o?.total, o?.grand_total,
      o?.subtotal_amount, o?.subtotal,
      o?.customer_order?.total_amount, o?.customerOrder?.total_amount,
      o?.summary?.total_amount,
    ];
    for (const c of candidates) {
      const n = toNumber(c);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  const fetchPreviousOrders = useCallback(async () => {
    if (!session || !storeId) return;
    try {
      const fromDb = await getOrdersFromDb(storeId);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        const withTotals = await Promise.all(
          fromDb.map(async (o: any) => {
            if (getDisplayTotal(o) > 0 || !o?.id) return o;
            try {
              const detail = await getOrderByIdFromDb(String(o.id));
              if (!detail) return o;
              return { ...o, order_items: detail.order_items, total_amount: detail.total_amount };
            } catch {
              return o;
            }
          })
        );
        setAllOrders(withTotals);
        return;
      }
    } catch { /* fall through to HTTP */ }

    try {
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/orders`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const raw = await res.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { return; }
      if (!json?.success) return;
      setAllOrders(json.orders || []);
    } catch {
      setAllOrders([]);
    }
  }, [session, storeId]);

  useEffect(() => {
    if (session && storeId) {
      fetchActiveOrders();
      fetchPreviousOrders();
    }
  }, [session, storeId]);

  useSmartPoll(fetchActiveOrders, {
    intervalMs: 10_000,
    slowIntervalMs: 20_000,
    enabled: !!(session?.token),
  });

  useSmartPoll(fetchPreviousOrders, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!(session && storeId),
  });

  useFocusEffect(
    React.useCallback(() => {
      if (session?.token) fetchActiveOrders();
      if (session?.token && storeId) fetchPreviousOrders();
    }, [session?.token, storeId])
  );

  const previousOrders = useMemo(
    () => allOrders.filter((o: any) => isDelivered(o.status)),
    [allOrders]
  );

  if (allocLoading && prevLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Orders</Text>
          {tab === "active" && allocations.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{allocations.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.tabs}>
          {(["active", "previous"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
            >
              <Ionicons
                name={t === "active" ? "flash-outline" : "time-outline"}
                size={16}
                color={tab === t ? "#fff" : colors.textTertiary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "active" ? "Active" : "Previous"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {tab === "active" ? (
        <FlatList
          data={allocations}
          keyExtractor={(a) => a.allocation_id}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={fetchActiveOrders}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="flash-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No active orders</Text>
              <Text style={styles.emptySub}>Accepted orders will appear here</Text>
            </View>
          }
          renderItem={({ item: a }) => (
            <View style={styles.activeCard}>
              <View style={styles.activeCardTop}>
                <View style={styles.activeCardLeft}>
                  <Text style={styles.orderCode}>#{a.order_code}</Text>
                  {a.customer_distance && (
                    <Text style={styles.orderMeta}>{a.customer_distance} away</Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: colors.success + "22" }]}>
                  <Text style={[styles.statusBadgeText, { color: colors.success }]}>Accepted</Text>
                </View>
              </View>

              {a.pickup_code && (
                <View style={styles.pickupCodeBox}>
                  <Text style={styles.pickupCodeLabel}>Pickup Code</Text>
                  <Text style={styles.pickupCodeValue}>{a.pickup_code}</Text>
                  <Text style={styles.pickupCodeHint}>Give this to the driver</Text>
                </View>
              )}

              <View style={styles.itemsList}>
                {a.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Ionicons name="cube-outline" size={14} color={colors.textTertiary} />
                    <Text style={styles.itemText} numberOfLines={1}>
                      {item.quantity} {item.unit} — {item.product_name}
                    </Text>
                  </View>
                ))}
              </View>

              {a.placed_at && (
                <Text style={styles.orderTime}>
                  {new Date(a.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {new Date(a.placed_at).toLocaleDateString()}
                </Text>
              )}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={previousOrders}
          keyExtractor={(o) => o.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={fetchPreviousOrders}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="time-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No previous orders</Text>
              <Text style={styles.emptySub}>Delivered orders will appear here</Text>
            </View>
          }
          renderItem={({ item: o }) => {
            const rawDate = o.created_at ?? o.createdAt ?? o.updated_at ?? o.updatedAt;
            const parsed = rawDate ? new Date(rawDate) : null;
            const validDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
            const statusColor = getStatusColor(o.status);
            return (
              <TouchableOpacity
                style={[styles.orderCard, { borderLeftColor: statusColor }]}
                onPress={() => router.push(`/invoice/${o.id}`)}
                activeOpacity={0.75}
              >
                <View style={styles.orderCardLeft}>
                  <Text style={styles.orderCardCode}>#{o.order_code}</Text>
                  {validDate && (
                    <Text style={styles.orderCardTime}>
                      {validDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {validDate.toLocaleDateString()}
                    </Text>
                  )}
                </View>
                <View style={styles.orderCardRight}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                      {formatStatus(o.status)}
                    </Text>
                  </View>
                  <Text style={styles.orderCardAmount}>{formatMoneyINR(getDisplayTotal(o))}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  header: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  tabText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#fff",
  },

  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },

  // Active order cards
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  activeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  activeCardLeft: { gap: 2 },
  orderCode: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  orderMeta: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  pickupCodeBox: {
    backgroundColor: colors.primary + "12",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + "30",
    alignItems: "center",
  },
  pickupCodeLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  pickupCodeValue: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 2,
  },
  pickupCodeHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  itemsList: {
    gap: 6,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  orderTime: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },

  // Previous order cards
  orderCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 4,
  },
  orderCardLeft: { gap: 3 },
  orderCardCode: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  orderCardTime: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  orderCardRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  orderCardAmount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },

  // Empty states
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  emptySub: {
    color: colors.textTertiary,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
