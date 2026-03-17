import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../lib/theme";
import { getSession } from "../../session";
import { config } from "../../lib/config";
import { getOrderByIdFromDb, type OrderForStore } from "../../lib/orders-db";

const API_BASE = config.API_BASE;
const BRAND_LOGO = require("../../near_now_shopkeeper.png");

function formatMoneyINR(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

export default function InvoiceScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderForStore | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) {
          router.replace("/landing");
          return;
        }

        const id = String(orderId || "").trim();
        if (!id) {
          setOrder(null);
          setLoading(false);
          return;
        }

        const fromDb = await getOrderByIdFromDb(id);
        if (fromDb) {
          setOrder(fromDb);
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/store-owner/orders/${id}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const raw = await res.text();
        const json = raw ? JSON.parse(raw) : null;
        if (json?.success && json?.order) {
          setOrder(json.order as OrderForStore);
        } else {
          setOrder(null);
        }
      } catch {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const lineItems = useMemo(() => {
    const items = Array.isArray(order?.order_items) ? order!.order_items : [];
    return items.map((it: any) => {
      const qty = Number(it.quantity ?? 0);
      const unitPrice = it.price != null ? Number(it.price) : null;
      const amount = unitPrice != null && Number.isFinite(unitPrice) ? unitPrice * qty : null;
      return {
        id: String(it.id ?? Math.random()),
        name: String(it.product_name ?? "Item"),
        unit: String(it.unit ?? "pcs"),
        qty,
        unitPrice,
        amount,
        image_url: it.image_url,
      };
    });
  }, [order]);

  const computedSubtotal = useMemo(() => {
    return lineItems.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  }, [lineItems]);

  const total = Number(order?.total_amount ?? 0);
  const deliveryFee = Math.max(0, total - computedSubtotal);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Invoice</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Invoice not found</Text>
          <Text style={styles.emptyText}>This order’s details couldn’t be loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const createdAt = order.created_at ? new Date(order.created_at) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Invoice</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.brandRow}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName}>Near & Now</Text>
              <Text style={styles.brandSub}>Store owner invoice</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(order.status ?? "").toUpperCase() || "DELIVERED"}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Order</Text>
              <Text style={styles.metaValue}>#{order.order_code ?? "---"}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>
                {createdAt ? createdAt.toLocaleDateString() : "-"}
              </Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Time</Text>
              <Text style={styles.metaValue}>
                {createdAt ? createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 1.4 }]}>Item</Text>
            <Text style={[styles.th, { width: 56, textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.th, { width: 84, textAlign: "right" }]}>Price</Text>
            <Text style={[styles.th, { width: 92, textAlign: "right" }]}>Amount</Text>
          </View>

          {lineItems.map((it) => (
            <View key={it.id} style={styles.tr}>
              <View style={{ flex: 1.4, flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                {it.image_url ? (
                  <Image source={{ uri: it.image_url }} style={styles.itemImg} />
                ) : (
                  <View style={styles.itemImgFallback}>
                    <Ionicons name="cube-outline" size={16} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                  <Text style={styles.itemUnit}>{it.unit}</Text>
                </View>
              </View>

              <Text style={[styles.td, { width: 56, textAlign: "right" }]}>{it.qty}</Text>
              <Text style={[styles.td, { width: 84, textAlign: "right" }]}>
                {it.unitPrice == null ? "-" : formatMoneyINR(it.unitPrice)}
              </Text>
              <Text style={[styles.tdStrong, { width: 92, textAlign: "right" }]}>
                {it.amount == null ? "-" : formatMoneyINR(it.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatMoneyINR(computedSubtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Delivery</Text>
            <Text style={styles.totalValue}>{formatMoneyINR(deliveryFee)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatMoneyINR(total)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  container: { padding: spacing.lg, paddingBottom: spacing.xl },

  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandLogo: { width: 44, height: 44, borderRadius: 12 },
  brandName: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  brandSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.success + "18",
    borderWidth: 1,
    borderColor: colors.success + "40",
  },
  badgeText: { color: colors.success, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  metaBlock: { flex: 1, backgroundColor: colors.surfaceVariant, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  metaLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "600" },
  metaValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 4 },

  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  th: { color: colors.textTertiary, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  tr: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
    alignItems: "center",
  },
  td: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  tdStrong: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  itemImg: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceVariant },
  itemImgFallback: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  itemUnit: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  totalsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  totalLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  totalValue: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },
  grandLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  grandValue: { color: colors.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },

  emptyCard: {
    margin: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginTop: spacing.sm },
  emptyText: { color: colors.textTertiary, fontSize: 13, textAlign: "center" },
});

