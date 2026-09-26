/**
 * Home's "Today" stat card — delivered count · order value, tapping through to
 * Payouts (design-system §4.1).
 *
 * `useTodayStats` reads the store's recent orders through the same
 * getOrdersFromDb the Payouts tab uses and buckets them with the same rules,
 * so the two never disagree for today. The fetch is bounded
 * (TODAY_ORDERS_LIMIT most recent rows — the RPC's p_limit — the same bound
 * the Orders feed uses) because only today's delivered orders matter here;
 * Payouts' "All time" view is the one place that needs the unbounded history.
 * Painted from a per-day persistCache entry first; the network fetch is
 * throttled on focus (60s, like Payouts) and never polled on an interval —
 * push/realtime nudges (onOrdersChanged) and pull-to-refresh force it.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { HomeCard } from "./HomeCard";
import { colors, spacing } from "../../lib/theme";
import { getOrdersFromDb, type OrderForStore } from "../../lib/orders-db";
import { formatINR, isDelivered, parseDbDate } from "../../lib/order-utils";
import { hydrateCache, peekCache, sameData, writeCache } from "../../lib/persistCache";
import { onOrdersChanged } from "../../lib/orderEvents";

const FOCUS_THROTTLE_MS = 60_000;
// Most-recent rows to read. A day with more delivered orders than this would
// be undercounted here (Payouts stays exact); matches useOrdersFeed's bound.
const TODAY_ORDERS_LIMIT = 200;
const todayCacheKey = (storeId: string) => `home:today:${storeId}`;

export type TodayStats = { delivered: number; total: number; dayKey: string };

// Same bucketing/amount rules as app/(tabs)/payments.tsx: delivered orders,
// bucketed by delivered time (fallback placed/created), amount from items ->
// subtotal_amount -> total_amount. (Candidate for lib/order-utils.)
function payoutDate(order: OrderForStore): Date | null {
  return parseDbDate(order.delivered_at) ?? parseDbDate(order.placed_at) ?? parseDbDate(order.created_at);
}
function orderAmount(order: OrderForStore): number {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const fromItems = items.reduce((sum, it) => {
    const qty = Number(it.quantity ?? 0);
    const price = Number(it.price ?? 0);
    return sum + (Number.isFinite(price) && price > 0 ? price * qty : 0);
  }, 0);
  if (fromItems > 0) return fromItems;
  const stored = Number(order.subtotal_amount ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const total = Number(order.total_amount ?? 0);
  return Number.isFinite(total) ? total : 0;
}
export function computeTodayStats(orders: OrderForStore[]): TodayStats {
  const dayKey = new Date().toDateString();
  let delivered = 0;
  let total = 0;
  for (const o of orders) {
    if (!isDelivered(o.status)) continue;
    if (payoutDate(o)?.toDateString() !== dayKey) continue;
    delivered += 1;
    total += orderAmount(o);
  }
  return { delivered, total, dayKey };
}

export function useTodayStats(storeId: string | null | undefined, token: string | null | undefined) {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const lastFetchRef = useRef(0);
  const inFlightRef = useRef(false);

  const refresh = useCallback(
    async (force = false) => {
      if (!token || !storeId) return;
      if (!force && Date.now() - lastFetchRef.current < FOCUS_THROTTLE_MS) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const orders = await getOrdersFromDb(storeId, TODAY_ORDERS_LIMIT);
        const next = computeTodayStats(orders);
        lastFetchRef.current = Date.now();
        setStats((prev) => (sameData(prev, next) ? prev : next));
        writeCache(todayCacheKey(storeId), next);
      } catch {
        // Non-fatal — the card keeps its last known numbers (or the em dash).
      } finally {
        inFlightRef.current = false;
      }
    },
    [token, storeId]
  );

  // Paint from the per-day cache, then fetch.
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    const paint = (cached: TodayStats | null) => {
      if (cancelled || !cached) return;
      // A cached copy from another day would show yesterday's numbers as today's.
      if (cached.dayKey === new Date().toDateString()) setStats(cached);
    };
    const peeked = peekCache<TodayStats>(todayCacheKey(storeId));
    if (peeked) paint(peeked);
    else hydrateCache<TodayStats>(todayCacheKey(storeId)).then(paint).catch(() => {});
    refresh(true);
    return () => {
      cancelled = true;
    };
  }, [storeId, refresh]);

  useEffect(() => onOrdersChanged(() => refresh(true)), [refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh(false);
    }, [refresh])
  );

  return { stats, refresh };
}

export type TodayCardProps = { stats: TodayStats | null };

export function TodayCard({ stats }: TodayCardProps) {
  const openPayouts = useCallback(() => router.push("/(tabs)/payments"), []);
  return (
    <HomeCard
      title="Today"
      subtitle="Delivered orders & value"
      accessory={
        <TouchableOpacity
          onPress={openPayouts}
          style={styles.link}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Payouts"
          accessibilityHint="Opens the Payouts tab"
        >
          <Text style={styles.linkText}>Payouts</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      }
      onPress={openPayouts}
      accessibilityLabel={
        stats ? `Today: ${stats.delivered} delivered, ${formatINR(stats.total)} order value` : "Today: loading delivered orders and order value"
      }
      accessibilityHint="Opens the Payouts tab"
    >
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats ? stats.delivered : "—"}</Text>
          <Text style={styles.statLabel}>Delivered</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
            {stats ? formatINR(stats.total) : "—"}
          </Text>
          <Text style={styles.statLabel}>Order value</Text>
        </View>
      </View>
    </HomeCard>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: "row", alignItems: "center", gap: 2 },
  linkText: { fontSize: 13, fontWeight: "600", color: colors.primary },
  statRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stat: { flex: 1, gap: 2 },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: colors.borderLight },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 12, fontWeight: "500", color: colors.textTertiary },
});

export default TodayCard;
