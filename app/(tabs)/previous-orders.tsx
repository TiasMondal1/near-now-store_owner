import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import { config } from "../../lib/config";
import { colors, radius, spacing } from "../../lib/theme";
import { getOrderByIdFromDb, getOrdersFromDb } from "../../lib/orders-db";

const API_BASE = config.API_BASE;

function formatMoneyINR(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

export default function PreviousOrdersTab() {
  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "pending_store" || s === "pending_at_store") return "#F59E0B";
    if (s === "accepted") return colors.success;
    if (s === "rejected" || s === "cancelled") return colors.error;
    if (s === "ready") return "#3B82F6";
    if (s === "delivered" || s === "order_delivered") return colors.textTertiary;
    return colors.textTertiary;
  };

  const formatStatus = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "pending_store" || s === "pending_at_store") return "Pending";
    if (s === "accepted") return "Accepted";
    if (s === "rejected") return "Rejected";
    if (s === "ready") return "Ready";
    if (s === "delivered" || s === "order_delivered") return "Delivered";
    if (s === "cancelled") return "Cancelled";
    return status;
  };

  const DELIVERED_STATUSES = ["delivered", "order_delivered"];
  const isDelivered = (o: any) =>
    DELIVERED_STATUSES.includes((o.status || "").toLowerCase().replace(/-/g, "_"));
  const toNumber = (v: any) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^0-9.-]/g, "");
      const n = Number(cleaned);
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
    const fallbackCandidates = [
      o?.total_amount,
      o?.totalAmount,
      o?.total,
      o?.grand_total,
      o?.subtotal_amount,
      o?.subtotal,
      o?.customer_order?.total_amount,
      o?.customerOrder?.total_amount,
      o?.summary?.total_amount,
    ];
    for (const c of fallbackCandidates) {
      const n = toNumber(c);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };
  const previousOrders = orders.filter((o: any) => isDelivered(o));

  useEffect(() => {
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) return router.replace("/landing");

        setSession(s);

        const userId = s.user?.id;
        const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const raw = await res.text();
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        const stores = json?.stores || [];

        if (stores[0]) {
          setStoreId(stores[0].id);
        }
      } catch (e) {
        console.warn("[previous-orders] Bootstrap error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!session || !storeId) return;

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [session, storeId]);

  useFocusEffect(
    React.useCallback(() => {
      if (session?.token && storeId) {
        fetchOrders();
      }
    }, [session?.token, storeId])
  );

  const fetchOrders = async () => {
    if (!session || !storeId) return;

    try {
      const fromDb = await getOrdersFromDb(storeId);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        const withRecoveredTotals = await Promise.all(
          fromDb.map(async (o: any) => {
            const current = getDisplayTotal(o);
            if (current > 0 || !o?.id) return o;
            try {
              const detail = await getOrderByIdFromDb(String(o.id));
              if (!detail) return o;
              return { ...o, order_items: detail.order_items, total_amount: detail.total_amount };
            } catch {
              return o;
            }
          })
        );
        setOrders(withRecoveredTotals);
        return;
      }
    } catch (e) {
      console.warn("[fetchOrders] DB failed:", e);
    }

    try {
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/orders`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!json?.success) return;

      setOrders(json.orders || []);
    } catch {
      setOrders([]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="time-outline" size={24} color={colors.primary} />
            <View>
              <Text style={styles.brand}>Previous Orders</Text>
              <Text style={styles.subtitle}>Order History</Text>
            </View>
          </View>
          <TouchableOpacity onPress={fetchOrders} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.ordersSection}>
          <View style={styles.ordersSectionHeader}>
            <View>
              <Text style={styles.ordersSectionTitle}>Previous Orders</Text>
              <Text style={styles.ordersSectionSubtitle}>
                {previousOrders.length === 0
                  ? "No past orders yet"
                  : `${previousOrders.length} order${previousOrders.length > 1 ? "s" : ""}`}
              </Text>
            </View>
          </View>
          {previousOrders.length === 0 ? (
            <View style={styles.waitingCard}>
              <Ionicons name="receipt-outline" size={36} color={colors.textTertiary} />
              <Text style={styles.waitingTitle}>No previous orders</Text>
              <Text style={styles.waitingText}>Orders that have been delivered will appear here</Text>
            </View>
          ) : (
            previousOrders.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={[styles.orderCard, { borderLeftColor: getStatusColor(o.status) }]}
                onPress={() => router.push(`/invoice/${o.id}`)}
                activeOpacity={0.75}
              >
                <View style={styles.orderCardLeft}>
                  <Text style={styles.orderCardCode}>#{o.order_code}</Text>
                  {(() => {
                    const rawDate = o.created_at ?? o.createdAt ?? o.updated_at ?? o.updatedAt;
                    if (!rawDate) return null;
                    const parsed = new Date(rawDate);
                    if (Number.isNaN(parsed.getTime())) return null;
                    return (
                      <Text style={styles.orderCardTime}>
                        {parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {parsed.toLocaleDateString()}
                      </Text>
                    );
                  })()}
                </View>
                <View style={styles.orderCardRight}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(o.status) + "22" }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(o.status) }]}>
                      {formatStatus(o.status)}
                    </Text>
                  </View>
                  <Text style={styles.orderCardAmount}>{formatMoneyINR(getDisplayTotal(o))}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    alignItems: "center",
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
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  ordersSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  ordersSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  ordersSectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  ordersSectionSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  waitingCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  waitingTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  waitingText: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: "center",
  },
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
    marginBottom: spacing.sm,
  },
  orderCardLeft: {
    gap: 3,
  },
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
});
