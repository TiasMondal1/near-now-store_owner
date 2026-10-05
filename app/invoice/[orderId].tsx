import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { goBackOr, useHardwareBackTo } from "../../lib/navigation";
import { formatINR, formatStatus, getStatusTone, parseDbDate } from "../../lib/order-utils";
import { colors, layout, radius, spacing, typography } from "../../lib/theme";
import { useLayout, useBottomPadding } from "../../lib/useLayout";
import { getSession } from "../../session";
import { config } from "../../lib/config";
import { getOrderByIdFromDb, type OrderForStore } from "../../lib/orders-db";
import { fetchStoresCached, peekStores } from "../../lib/appCache";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  Skeleton,
  TopBar,
  useToast,
} from "../../components/ui";
import { InvoiceItemsCard } from "../../components/payouts/InvoiceItemsCard";
import { buildInvoiceHtml, computePayout, toLineItems } from "../../components/payouts/invoiceHtml";

const API_BASE = config.API_BASE;
// 384 px copy of the 1024 px icon art; shown at 40 dp here. (2026-10-06)
const BRAND_LOGO = require("../../assets/brand/near_now_shopkeeper_384.png");

export default function InvoiceScreen() {
  const { orderId, source } = useLocalSearchParams<{ orderId?: string; source?: string }>();
  const isOrdersContext = source === "orders";
  // This screen is only pushed from Orders → Previous (`?source=orders`) and
  // from Payouts, so a history-less deep link falls back to the matching tab
  // — for the header arrow, hardware back and the not-found button alike.
  const backHref: Href = isOrdersContext ? "/(tabs)/previous-orders" : "/(tabs)/payments";
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();
  useHardwareBackTo(backHref);

  const [loading, setLoading] = useState(true);
  // Distinguishes "the fetch threw" (network / unexpected) from "the server
  // answered and there is no such order for this shopkeeper" (not found).
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [order, setOrder] = useState<OrderForStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) { router.replace("/landing"); return; }

        const id = String(orderId || "").trim();
        if (!id) { if (!cancelled) { setOrder(null); setLoading(false); } return; }

        // The order id comes from a route param (deep link / push payload),
        // so the order must be proven to belong to one of this shopkeeper's
        // own stores before anything is rendered or exported.
        const stores = peekStores() ?? (await fetchStoresCached(s.token, s.user?.id));
        const ownStoreIds = stores.map((st) => String(st.id));
        if (ownStoreIds.length === 0) { if (!cancelled) { setOrder(null); setLoading(false); } return; }

        const fromDb = await getOrderByIdFromDb(id, ownStoreIds);
        if (fromDb) { if (!cancelled) { setOrder(fromDb); setLoading(false); } return; }

        const res = await fetch(`${API_BASE}/api/orders/${id}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const raw = await res.text();
        // A malformed / non-JSON body means the server answered without an
        // order — that is "not found", not a network failure.
        let json: any = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
        const apiOrder = json?.success && json?.order ? (json.order as OrderForStore) : null;
        const apiStoreId = apiOrder ? String((apiOrder as any).store_id ?? "") : "";
        if (!cancelled) setOrder(apiOrder && ownStoreIds.includes(apiStoreId) ? apiOrder : null);
      } catch {
        if (!cancelled) { setOrder(null); setLoadError(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const lineItems = useMemo(() => toLineItems(order), [order]);

  const payout = useMemo(
    () => (order ? computePayout(order, lineItems) : 0),
    [order, lineItems]
  );

  const handleDownload = useCallback(async () => {
    if (!order) return;
    try {
      setDownloading(true);
      const html = buildInvoiceHtml(order, lineItems, payout);
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Order summary #${order.order_code ?? ""}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        // printToFileAsync writes to the app cache, not the user's files —
        // say what actually happened instead of claiming a device save.
        toast.show({ message: "PDF created, but sharing isn't available on this device." });
      }
    } catch {
      toast.show({
        message: "Couldn't create the PDF",
        tone: "error",
        action: { label: "Retry", onPress: () => { void handleDownload(); } },
      });
    } finally {
      setDownloading(false);
    }
  }, [order, lineItems, payout, toast]);

  const createdAt = order ? parseDbDate(order.placed_at ?? order.created_at) : null;
  const dateStr = createdAt ? createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const timeStr = createdAt ? createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const status = order ? String(order.status ?? "delivered") : "";

  // IconButton's `loading` keeps the 44dp slot fixed and sets the busy state
  // while the PDF generates.
  const right = order ? (
    <IconButton icon="download-outline" accessibilityLabel="Download PDF" loading={downloading} onPress={handleDownload} />
  ) : undefined;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={styles.column}>
        <Skeleton.Card lines={2} />
        <Skeleton.Card lines={4} />
        {!isOrdersContext ? <Skeleton.Card lines={1} /> : null}
      </View>
    );
  } else if (loadError) {
    body = (
      <ErrorState
        title="Couldn't load this order"
        message="Check your connection and try again."
        action={{ onPress: retry }}
      />
    );
  } else if (!order) {
    body = (
      <EmptyState
        icon="receipt-outline"
        title="Order not found"
        message="This order isn't available for your store or has been removed."
        action={{
          label: isOrdersContext ? "Back to orders" : "Back to payouts",
          variant: "secondary",
          onPress: () => goBackOr(backHref),
        }}
      />
    );
  } else {
    body = (
      <View style={styles.column}>
        <Card>
          <View style={styles.brandRow}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} accessibilityIgnoresInvertColors accessibilityElementsHidden importantForAccessibility="no" />
            <View style={styles.flex}>
              <Text style={styles.brandName} numberOfLines={1}>
                Near &amp; Now
              </Text>
              <Text style={styles.brandSub} numberOfLines={1}>
                {isOrdersContext ? "Order summary" : "Delivered order summary"}
              </Text>
            </View>
          </View>
          <View style={styles.cardDivider}>
            <Divider />
          </View>
          <View style={styles.codeRow}>
            <Text style={styles.code} numberOfLines={1} accessibilityRole="header">
              #{order.order_code ?? "—"}
            </Text>
            <Badge label={formatStatus(status)} tone={getStatusTone(status)} />
          </View>
          <Text style={styles.dateLine} numberOfLines={1} accessibilityLabel={`Date ${dateStr}, time ${timeStr}`}>
            {dateStr} · {timeStr}
          </Text>
        </Card>

        <InvoiceItemsCard items={lineItems} hidePrices={isOrdersContext} />

        {/* Totals — only shown on invoice (payout) view, not order summary */}
        {!isOrdersContext ? (
          <Card>
            <View style={styles.totalRow} accessible accessibilityLabel={`Order value ${formatINR(payout)}`}>
              <Text style={styles.totalLabel}>Order value</Text>
              <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(payout)}
              </Text>
            </View>
            <View style={styles.cardDivider}>
              <Divider />
            </View>
            <Text style={styles.note}>Prices include applicable GST. Order value covers product items only.</Text>
          </Card>
        ) : null}

        <Text style={styles.footer}>
          {isOrdersContext
            ? "This is a summary of the order placed through Near & Now."
            : "This invoice shows the value of the products in this delivered order, which is paid out to you in full."}
        </Text>
      </View>
    );
  }

  return (
    <Screen>
      <TopBar
        title={isOrdersContext ? "Order details" : "Order summary"}
        backHref={backHref}
        right={right}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.page, { maxWidth: contentWidth }]}>{body}</View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: spacing.lg },
  page: { flexGrow: 1, width: "100%", alignSelf: "center" },
  column: { gap: spacing.xl },

  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandLogo: { width: layout.listRowLeadingSlot, height: layout.listRowLeadingSlot, borderRadius: radius.md },
  brandName: { ...typography.bodyStrong, color: colors.textPrimary },
  brandSub: { ...typography.caption, color: colors.textMuted },
  cardDivider: { paddingVertical: spacing.md },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  code: { ...typography.subheading, color: colors.textPrimary, flex: 1 },
  dateLine: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  totalLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  totalValue: { ...typography.display, color: colors.textPrimary, flexShrink: 1 },
  note: { ...typography.caption, color: colors.textMuted },

  footer: { ...typography.caption, color: colors.textMuted, textAlign: "center", paddingHorizontal: spacing.md },
});
