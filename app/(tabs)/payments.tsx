import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getOrdersFromDb, OrdersFetchFailedError, type OrderForStore } from "../../lib/orders-db";
import { colors, radius, spacing } from "../../lib/theme";
import { useLayout, useBottomPadding } from "../../lib/useLayout";
import { useRequireStoreApproval } from "../../lib/useRequireStoreApproval";
import { useSelectedStore } from "../../lib/useSelectedStore";
import { hydrateCache, sameData, writeCache } from "../../lib/persistCache";
import { formatINR, formatStatus, isDelivered, parseDbDate } from "../../lib/order-utils";
import { EmptyState, ErrorState, InlineNotice, Screen, Skeleton, triggerHaptic } from "../../components/ui";
import { dateFromOrderCode } from "../../components/orders";
import { PayoutSummaryCard } from "../../components/payouts/PayoutSummaryCard";
import { PayoutRow } from "../../components/payouts/PayoutRow";

/** persistCache key for the delivered-order rows — instant Payouts paint. */
const payoutsCacheKey = (storeId: string) => `payouts:${storeId}`;
/**
 * Rows persisted for the fast first paint. Each trimmed row serializes to
 * ~260 bytes (UUID id, order_code, status, amounts, two ISO timestamps), so
 * the cap yields a ~1.3 MB entry — inside Android's ~2 MB CursorWindow
 * per-row read limit, but do NOT raise this much further or the seed read
 * starts failing silently. Below the cap the cached All-Time totals are
 * exact; beyond it they read slightly low until the live (unbounded) fetch
 * commits a few seconds later.
 */
const PAYOUTS_CACHE_MAX_ROWS = 5000;

/** "Today" / "Yesterday" for the two most recent days, otherwise null. */
function relativeDayLabel(d: Date): string | null {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return null;
}

function formatDateTime(d: Date | null): string {
  if (!d) return "";
  const time = d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const relative = relativeDayLabel(d);
  if (relative) return `${relative}, ${time}`;
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * The moment an order counts toward a payout period. These are *delivered*
 * orders, so bucket by when they were delivered — an order placed on Sunday
 * night and delivered Monday morning belongs to Monday's payouts. Falls back
 * to placed/created time for rows the backend hasn't stamped.
 *
 * Mirrors components/home/TodayCard.tsx; candidate for lib/order-utils.
 */
function payoutDate(order: OrderForStore): Date | null {
  return (
    parseDbDate(order.delivered_at) ??
    parseDbDate(order.placed_at) ??
    parseDbDate(order.created_at)
  );
}

/** Order value: priced line items → subtotal_amount → total_amount. */
function computeSubtotal(order: OrderForStore): number {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const fromItems = items.reduce((sum, it: any) => {
    const qty = Number(it.quantity ?? 0);
    const price = Number(it.price ?? it.unit_price ?? 0);
    return sum + (Number.isFinite(price) && price > 0 ? price * qty : 0);
  }, 0);
  if (fromItems > 0) return fromItems;
  const stored = Number(order.subtotal_amount ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const total = Number(order.total_amount ?? 0);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Row caption: the same timestamp the period filter uses (delivered time
 * first), so a card never shows a "placed" date that disagrees with the
 * bucket it sits in. Falls back to the date encoded in the order code.
 */
function rowDateLabel(order: OrderForStore): string {
  const label = formatDateTime(payoutDate(order));
  if (label) return order.delivered_at ? `Delivered ${label}` : label;
  const fromCode = dateFromOrderCode(order.order_code);
  if (!fromCode) return "";
  return (
    relativeDayLabel(fromCode) ??
    fromCode.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  );
}

type Period = "today" | "week" | "all";
type PayoutRowData = { order: OrderForStore; amount: number };

// Labeled "Last 7 Days," not "This Week" — the underlying filter is a
// rolling `now - 7 days` window, not a real Mon-Sun calendar-week boundary.
const PERIOD_ITEMS: readonly { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 Days" },
  { key: "all", label: "All Time" },
];

/** Eyebrow on the summary card, as the pre-redesign screen worded it. */
const PERIOD_LABEL: Record<Period, string> = {
  today: "Today's Order Value",
  week: "Last 7 Days",
  all: "All Time",
};

export default function PaymentsTab() {
  useRequireStoreApproval();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { session, storeId, loading: storeLoading } = useSelectedStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<PayoutRowData[]>([]);
  const [payoutsError, setPayoutsError] = useState(false);
  const [period, setPeriod] = useState<Period>("today");

  // Pre-redesign header entrance: 400ms fade + 16dp slide-up on mount.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // getOrdersFromDb intentionally fetches this store's entire delivered-order
  // history, unbounded — the "All Time" total needs a genuinely complete sum,
  // not a capped page (see orders-db.ts). But useFocusEffect below re-runs
  // this same full fetch on every single tab focus, not just when the
  // screen first mounts or Today/Week/All Time actually needs fresh data —
  // for a long-lived store this re-fetches and re-processes the whole
  // lifetime order list on every tab switch. Throttled to at most once a
  // minute on focus (a real pull-to-refresh or the initial mount always goes
  // through). Found 2026-09-01 during a cross-app audit.
  const lastLoadedAtRef = useRef(0);
  // Keyed by store (multi-store switching, 2026-10-02): a plain boolean let
  // store A's in-flight load swallow store B's load entirely after a switch,
  // and A's late response then painted A's payouts under B.
  const loadInFlightRef = useRef<string | null>(null);
  const currentStoreIdRef = useRef(storeId);
  currentStoreIdRef.current = storeId;
  const isCurrentStore = (id: string) => currentStoreIdRef.current === id;
  const FOCUS_REFETCH_THROTTLE_MS = 60_000;

  const load = useCallback(async (showLoader = false) => {
    // useSelectedStore owns session + store resolution (and the /landing
    // redirect). Until it has resolved there is nothing to fetch.
    if (!storeId || !session?.token) return;
    // Mount effect + the initial focus callback both fire before the first
    // load finishes — without this, the full-history fetch went out twice
    // concurrently on every visit to the tab.
    if (loadInFlightRef.current === storeId) return;
    loadInFlightRef.current = storeId;
    if (showLoader) setLoading(true);
    try {
      // Stale-while-revalidate: paint last-known rows immediately instead of
      // blocking the whole tab behind a skeleton for the full-history fetch.
      if (showLoader) {
        const cachedRows = await hydrateCache<PayoutRowData[]>(payoutsCacheKey(storeId));
        if (!isCurrentStore(storeId)) return;
        if (cachedRows?.length) {
          setPayouts((prev) => (prev.length > 0 ? prev : cachedRows));
          setLoading(false);
        }
      }

      const orders = await getOrdersFromDb(storeId);
      if (!isCurrentStore(storeId)) return; // switched stores meanwhile — drop it
      setPayoutsError(false);
      const delivered = orders.filter((o) => isDelivered(o.status));

      const rows: PayoutRowData[] = delivered.map((o) => ({
        order: o,
        amount: computeSubtotal(o),
      }));
      rows.sort((a, b) => {
        const ta = payoutDate(a.order)?.getTime() ?? 0;
        const tb = payoutDate(b.order)?.getTime() ?? 0;
        return tb - ta;
      });
      setPayouts((prev) => (sameData(prev, rows) ? prev : rows));
      // Persist a trimmed copy — the list/totals only need code, dates, amount.
      writeCache(
        payoutsCacheKey(storeId),
        rows.slice(0, PAYOUTS_CACHE_MAX_ROWS).map((r) => ({
          amount: r.amount,
          order: {
            id: r.order.id,
            order_code: r.order.order_code,
            status: r.order.status,
            total_amount: r.order.total_amount,
            created_at: r.order.created_at,
            placed_at: r.order.placed_at,
            // Needed by payoutDate() — without it, cache-hydrated rows were
            // bucketed by placed time while fresh rows used delivered time,
            // so the totals visibly changed once the network fetch landed.
            delivered_at: r.order.delivered_at,
            order_items: [],
          },
        }))
      );
      lastLoadedAtRef.current = Date.now();
    } catch (e) {
      if (!isCurrentStore(storeId)) return;
      // OrdersFetchFailedError is the query/RLS/network failure from
      // orders-db. Any other throw (storage, unexpected) is still a failed
      // load: surface it too rather than painting an empty "no orders" view
      // over a first-load failure.
      setPayoutsError(true);
      if (!(e instanceof OrdersFetchFailedError)) {
        console.warn("[payouts] load failed:", e);
      }
    } finally {
      if (loadInFlightRef.current === storeId) loadInFlightRef.current = null;
      if (isCurrentStore(storeId)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [storeId, session?.token]);

  // Store switch: clear the previous store's rows so this store's cache seed
  // (which only fills an empty list) and fresh load show the right store.
  const prevStoreIdRef = useRef(storeId);
  useEffect(() => {
    if (prevStoreIdRef.current && storeId && prevStoreIdRef.current !== storeId) {
      setPayouts([]);
      setPayoutsError(false);
      lastLoadedAtRef.current = 0;
    }
    prevStoreIdRef.current = storeId;
  }, [storeId]);

  // `load` changes identity when the store resolves, so this fires once the
  // id is known; the focus effect below is still throttled via lastLoadedAtRef.
  useEffect(() => { if (storeId) load(true); }, [storeId, load]);
  // Store resolution finished with nothing to load (no stores on the
  // account): drop the cold skeleton so the empty state can render.
  useEffect(() => { if (!storeLoading && !storeId) setLoading(false); }, [storeLoading, storeId]);
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAtRef.current < FOCUS_REFETCH_THROTTLE_MS) return;
      load(false);
    }, [load]),
  );

  // The period buckets depend on "now", but the memo below only re-ran when
  // `payouts` changed. A tab left open (or restored from the SWR cache with
  // identical rows) across midnight kept yesterday's Today/Last-7-Days
  // totals. Re-key the memo on the current calendar day, refreshed on focus.
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useFocusEffect(
    useCallback(() => {
      const today = new Date().toDateString();
      setDayKey((prev) => (prev === today ? prev : today));
    }, []),
  );

  const { todayPayouts, weekPayouts, todayTotal, weekTotal, allTotal } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    // Rolling 7×24h window ending now, matching the "Last 7 days" label.
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = payouts.filter((p) => payoutDate(p.order)?.toDateString() === todayStr);
    const week = payouts.filter((p) => { const d = payoutDate(p.order); return d != null && d >= weekAgo; });
    return {
      todayPayouts: today,
      weekPayouts: week,
      todayTotal: today.reduce((s, p) => s + p.amount, 0),
      weekTotal: week.reduce((s, p) => s + p.amount, 0),
      allTotal: payouts.reduce((s, p) => s + p.amount, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey is the intentional "now" invalidator
  }, [payouts, dayKey]);

  const filtered = period === "today" ? todayPayouts : period === "week" ? weekPayouts : payouts;
  const filteredTotal = period === "today" ? todayTotal : period === "week" ? weekTotal : allTotal;

  const coldLoading = loading && payouts.length === 0;
  const showStaleNotice = payoutsError && payouts.length > 0;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  const retry = useCallback(() => { load(true); }, [load]);

  const openInvoice = useCallback((id: string) => {
    router.push(`/invoice/${id}`);
  }, []);

  const selectPeriod = useCallback(
    (p: Period) => {
      // Same semantics as the SegmentedControl this replaces visually: no-op
      // on the active tab, light haptic on change.
      if (p === period) return;
      void triggerHaptic("light");
      setPeriod(p);
    },
    [period],
  );

  const renderItem = useCallback(
    ({ item }: { item: PayoutRowData }) => {
      const code = item.order.order_code ?? "—";
      const dateLabel = rowDateLabel(item.order);
      // The spoken label adds status and the delivery time, which the visual
      // row omits.
      const spoken = [`Order #${code}`, formatStatus(item.order.status) || null, dateLabel || null, formatINR(item.amount)]
        .filter(Boolean)
        .join(", ");
      return (
        <View style={{ paddingHorizontal: gutter }}>
          <PayoutRow
            orderCode={code}
            dateLabel={dateLabel}
            amount={item.amount}
            accessibilityLabel={spoken}
            accessibilityHint="Opens the order summary"
            onPress={() => openInvoice(item.order.id)}
          />
        </View>
      );
    },
    [gutter, openInvoice],
  );

  const keyExtractor = useCallback((item: PayoutRowData) => item.order.id, []);

  const header = (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={[styles.headerRow, { paddingHorizontal: gutter }]}>
        <Text style={styles.header} accessibilityRole="header">
          Payouts
        </Text>
        {payouts.length > 0 && (
          <View style={styles.countBadge} accessibilityLabel={`${payouts.length} delivered orders`}>
            <Text style={styles.countBadgeText}>{payouts.length}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.subtitle, { paddingHorizontal: gutter }]}>Value of your delivered orders</Text>

      {/* Period tabs */}
      <View
        style={[styles.periodRow, { paddingHorizontal: gutter }]}
        accessibilityRole="tablist"
        accessibilityLabel="Payout period"
      >
        {PERIOD_ITEMS.map((item) => {
          const active = period === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.periodTab, active && styles.periodTabActive]}
              onPress={() => selectPeriod(item.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.periodTabText, active && styles.periodTabTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showStaleNotice ? (
        <InlineNotice
          tone="warning"
          title="Couldn't refresh"
          message="Showing saved data"
          action={{ label: "Retry", onPress: onRefresh }}
          style={[styles.staleNotice, { marginHorizontal: gutter }]}
        />
      ) : null}

      {/* Summary card */}
      <View style={[styles.summaryWrap, { paddingHorizontal: gutter }]}>
        <PayoutSummaryCard
          periodLabel={PERIOD_LABEL[period]}
          total={filteredTotal}
          count={filtered.length}
          loading={coldLoading}
        />
      </View>

      {/* Quick stats */}
      <View style={[styles.quickStatsRow, { paddingHorizontal: gutter }]}>
        <View
          style={[styles.quickStat, { backgroundColor: colors.primary + "0A" }]}
          accessible
          accessibilityLabel={`Today ${formatINR(todayTotal)}`}
        >
          <Text style={[styles.quickStatValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(todayTotal)}
          </Text>
          <Text style={styles.quickStatLabel}>Today</Text>
        </View>
        <View
          style={[styles.quickStat, { backgroundColor: colors.warning + "0C" }]}
          accessible
          accessibilityLabel={`Last 7 Days ${formatINR(weekTotal)}`}
        >
          <Text style={[styles.quickStatValue, { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(weekTotal)}
          </Text>
          <Text style={styles.quickStatLabel}>Last 7 Days</Text>
        </View>
        <View
          style={[styles.quickStat, { backgroundColor: colors.success + "0A" }]}
          accessible
          accessibilityLabel={`All Time ${formatINR(allTotal)}`}
        >
          <Text style={[styles.quickStatValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(allTotal)}
          </Text>
          <Text style={styles.quickStatLabel}>All Time</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { paddingHorizontal: gutter }]} accessibilityRole="header">
        Order History
      </Text>
    </Animated.View>
  );

  const empty = (
    <View style={[styles.emptyWrap, { paddingHorizontal: gutter }]}>
      {coldLoading ? (
        <View style={styles.skeletonStack}>
          <Skeleton.Card lines={1} />
          <Skeleton.Card lines={1} />
          <Skeleton.Card lines={1} />
          <Skeleton.Card lines={1} />
        </View>
      ) : payoutsError && payouts.length === 0 ? (
        <ErrorState
          title="Couldn't load orders"
          message="Check your connection and try again."
          action={{ onPress: retry }}
        />
      ) : (
        <EmptyState
          icon="wallet-outline"
          title={period === "all" ? "No delivered orders yet" : "Nothing delivered in this period"}
          message={
            period === "all"
              ? "Delivered orders appear here."
              : period === "today"
                ? "Orders delivered today will show here."
                : "Orders delivered in the last 7 days will show here."
          }
        />
      )}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={coldLoading ? [] : filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={[styles.list, { maxWidth: contentWidth + gutter * 2 }]}
        contentContainerStyle={[styles.listContent, { paddingBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, width: "100%", alignSelf: "center" },
  listContent: { flexGrow: 1, gap: spacing.sm },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  header: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  countBadgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: "800" },
  subtitle: { color: colors.textTertiary, fontSize: 12, marginTop: -4, marginBottom: spacing.sm },

  periodRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  periodTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodTabText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
  periodTabTextActive: { color: colors.onPrimary },

  staleNotice: { marginBottom: spacing.md },
  summaryWrap: { marginBottom: spacing.md },

  quickStatsRow: {
    flexDirection: "row",
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
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },

  skeletonStack: { gap: spacing.sm },
  emptyWrap: { flexGrow: 1 },
});
