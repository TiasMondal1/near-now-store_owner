import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { colors, radius, spacing } from "../../lib/theme";
import { getSession } from "../../session";
import { config } from "../../lib/config";
import { getOrderByIdFromDb, type OrderForStore } from "../../lib/orders-db";

const API_BASE = config.API_BASE;
const BRAND_LOGO = require("../../near_now_shopkeeper.png");

function fmt(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

function buildInvoiceHtml(order: OrderForStore, lineItems: LineItem[]): string {
  const createdAt = order.created_at ? new Date(order.created_at) : null;
  const dateStr = createdAt ? createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const timeStr = createdAt ? createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const subtotal = lineItems.reduce((s, it) => s + (it.amount ?? 0), 0);

  const rows = lineItems
    .map(
      (it) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #F3F4F6">${it.name}<br/><span style="font-size:11px;color:#9CA3AF">${it.unit}</span></td>
      <td style="padding:10px 8px;border-bottom:1px solid #F3F4F6;text-align:center">${it.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #F3F4F6;text-align:right">${it.unitPrice != null ? fmt(it.unitPrice) : "—"}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #F3F4F6;text-align:right;font-weight:700">${it.amount != null ? fmt(it.amount) : "—"}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F9FAFB;margin:0;padding:24px;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB">
    <div style="background:#0C831F;padding:24px 28px;color:#fff">
      <div style="font-size:20px;font-weight:900;letter-spacing:-0.5px">Near &amp; Now</div>
      <div style="font-size:12px;opacity:0.8;margin-top:2px">Shopkeeper Payout Invoice</div>
    </div>

    <div style="padding:20px 28px;background:#F3F4F6;display:flex;justify-content:space-between;gap:12px">
      <div>
        <div style="font-size:11px;color:#6B7280;font-weight:600">ORDER</div>
        <div style="font-size:15px;font-weight:800;margin-top:4px">#${order.order_code ?? "—"}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#6B7280;font-weight:600">DATE</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px">${dateStr}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#6B7280;font-weight:600">TIME</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px">${timeStr}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#6B7280;font-weight:600">STATUS</div>
        <div style="font-size:12px;font-weight:800;margin-top:4px;color:#10B981;text-transform:uppercase">${order.status ?? "DELIVERED"}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;padding:0 28px">
      <thead>
        <tr style="background:#F9FAFB">
          <th style="padding:10px 8px;font-size:11px;color:#9CA3AF;text-align:left;font-weight:800;letter-spacing:0.4px">ITEM</th>
          <th style="padding:10px 8px;font-size:11px;color:#9CA3AF;text-align:center;font-weight:800;letter-spacing:0.4px">QTY</th>
          <th style="padding:10px 8px;font-size:11px;color:#9CA3AF;text-align:right;font-weight:800;letter-spacing:0.4px">UNIT PRICE</th>
          <th style="padding:10px 8px;font-size:11px;color:#9CA3AF;text-align:right;font-weight:800;letter-spacing:0.4px">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="padding:16px 28px 28px;border-top:2px solid #E5E7EB;margin:0 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:16px;font-weight:900;color:#111827">Payout Amount</span>
        <span style="font-size:20px;font-weight:900;color:#0C831F">${fmt(subtotal)}</span>
      </div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:8px">Prices include applicable GST. Payout covers product items only (excludes delivery &amp; handling charges).</div>
    </div>

    <div style="padding:16px 28px;background:#F3F4F6;font-size:11px;color:#6B7280;border-top:1px solid #E5E7EB">
      This invoice is generated by Near &amp; Now and represents the payout owed to the shopkeeper for the above order.
    </div>
  </div>
</body>
</html>`;
}

type LineItem = {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number | null;
  amount: number | null;
  image_url?: string;
};

export default function InvoiceScreen() {
  const { orderId, source } = useLocalSearchParams<{ orderId?: string; source?: string }>();
  const isOrdersContext = source === "orders";
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [order, setOrder] = useState<OrderForStore | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) { router.replace("/landing"); return; }

        const id = String(orderId || "").trim();
        if (!id) { setLoading(false); return; }

        const fromDb = await getOrderByIdFromDb(id);
        if (fromDb) { setOrder(fromDb); setLoading(false); return; }

        const res = await fetch(`${API_BASE}/api/orders/${id}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const raw = await res.text();
        const json = raw ? JSON.parse(raw) : null;
        setOrder(json?.success && json?.order ? (json.order as OrderForStore) : null);
      } catch {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const lineItems: LineItem[] = useMemo(() => {
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

  const subtotal = useMemo(
    () => lineItems.reduce((sum, it) => sum + (it.amount ?? 0), 0),
    [lineItems]
  );

  const handleDownload = async () => {
    if (!order) return;
    try {
      setDownloading(true);
      const html = buildInvoiceHtml(order, lineItems);
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Invoice #${order.order_code ?? ""}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `Invoice saved to: ${uri}`);
      }
    } catch {
      Alert.alert("Error", "Could not generate invoice PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
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
          <Text style={styles.emptyText}>This order's details couldn't be loaded.</Text>
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
        <Text style={styles.topTitle}>{isOrdersContext ? "Order Details" : "Invoice"}</Text>
        <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn} activeOpacity={0.75} disabled={downloading}>
          {downloading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name="download-outline" size={20} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.brandRow}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName}>Near &amp; Now</Text>
              <Text style={styles.brandSub}>{isOrdersContext ? "Order summary" : "Shopkeeper payout invoice"}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(order.status ?? "").toUpperCase() || "DELIVERED"}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Order</Text>
              <Text style={styles.metaValue}>#{order.order_code ?? "—"}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>
                {createdAt ? createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
              </Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Time</Text>
              <Text style={styles.metaValue}>
                {createdAt ? createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Line items table */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 1.9 }]}>Item</Text>
            <Text style={[styles.th, { width: 44, textAlign: "right" }]}>Qty</Text>
            {!isOrdersContext && (
              <>
                <Text style={[styles.th, { width: 80, textAlign: "right" }]}>Unit</Text>
                <Text style={[styles.th, { width: 90, textAlign: "right" }]}>Amount</Text>
              </>
            )}
          </View>

          {lineItems.map((it) => (
            <View key={it.id} style={styles.tr}>
              <View style={{ flex: 1.9, flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                {it.image_url ? (
                  <Image source={{ uri: it.image_url }} style={styles.itemImg} />
                ) : (
                  <View style={styles.itemImgFallback}>
                    <Ionicons name="cube-outline" size={16} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.itemUnit}>{it.unit}</Text>
                </View>
              </View>
              <Text style={[styles.td, { width: 44, textAlign: "right" }]}>{it.qty}</Text>
              {!isOrdersContext && (
                <>
                  <Text style={[styles.td, { width: 80, textAlign: "right" }]}>
                    {it.unitPrice != null ? fmt(it.unitPrice) : "—"}
                  </Text>
                  <Text style={[styles.tdStrong, { width: 90, textAlign: "right" }]}>
                    {it.amount != null ? fmt(it.amount) : "—"}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>

        {/* Totals — only shown on invoice (payout) view, not order summary */}
        {!isOrdersContext && (
          <View style={styles.totalsCard}>
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.noteText}>
                Prices include applicable GST. Payout covers product items only.
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.grandLabel}>Payout Amount</Text>
              <Text style={styles.grandValue}>{fmt(subtotal)}</Text>
            </View>
          </View>
        )}

        {/* Footer note */}
        <View style={styles.footerCard}>
          <Text style={styles.footerText}>
            {isOrdersContext
            ? "This is a summary of the order placed through Near & Now."
            : "This invoice is generated by Near & Now and represents the payout owed to you for the above order."}
          </Text>
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
  downloadBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary + "14",
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  topTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  container: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },

  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  metaBlock: {
    flex: 1,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  metaLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "600" },
  metaValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 4 },

  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.xs,
  },
  th: { color: colors.textTertiary, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  tr: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.xs,
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
  itemName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1, flexWrap: "wrap" },
  itemUnit: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  totalsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  noteText: {
    color: colors.textTertiary,
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grandLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  grandValue: { color: colors.primary, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },

  footerCard: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  footerText: {
    color: colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },

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
