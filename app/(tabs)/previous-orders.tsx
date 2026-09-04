import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Animated,
  SectionList,
  Alert,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { getOrdersFromDb, OrdersFetchFailedError } from "../../lib/orders-db";
import { supabase } from "../../lib/supabase";
import { getStatusColor, formatStatus, isDelivered } from "../../lib/order-utils";
import { fetchStoresCached, peekStores } from "../../lib/appCache";
import { useSmartPoll } from "../../lib/useSmartPoll";
import { apiClient } from "../../lib/api-client";
import { useIncomingOrdersCount } from "../../lib/incomingOrdersContext";
import { useRequireStoreApproval } from "../../lib/useRequireStoreApproval";
import { hydrateCache, sameData, writeCache } from "../../lib/persistCache";

/** persistCache key for the terminal-state order list — instant "Previous" tab paint. */
const ordersCacheKey = (storeId: string) => `orders200:${storeId}`;

type AllocationItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  price?: number;
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
  receiver_name?: string | null;
  receiver_phone?: string | null;
  receiver_address?: string | null;
};

function safeDate(str: string | null | undefined): Date | null {
  if (!str) return null;
  const s = str.trim().replace(/^(\d{4}-\d{2}-\d{2})\s/, "$1T");
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateFromOrderCode(code: string | null | undefined): Date | null {
  if (!code) return null;
  const m = code.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

function resolveOrderDate(o: any): Date | null {
  return safeDate(o.created_at) || safeDate(o.placed_at) || dateFromOrderCode(o.order_code);
}

function resolveOrderDateStr(o: any): string {
  const fromTs = safeDate(o.placed_at) || safeDate(o.created_at);
  if (fromTs) {
    const date = fromTs.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const time = fromTs.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return time ? `${date}, ${time}` : date;
  }
  const d = dateFromOrderCode(o.order_code);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
}

const AllocationCard = React.memo(function AllocationCard({
  alloc,
  accepting,
  onAccept,
  onReject,
}: {
  alloc: Allocation;
  accepting: boolean;
  onAccept: (allocId: string, itemIds: string[]) => void;
  onReject: (allocId: string, orderCode: string) => void;
}) {
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(
    () => new Set(alloc.items.map((i) => i.id))
  );

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <View style={allocStyles.card}>
      <View style={allocStyles.cardHeader}>
        <View style={allocStyles.cardHeaderLeft}>
          <Text style={allocStyles.orderCode}>#{alloc.order_code}</Text>
          {alloc.customer_distance && (
            <View style={allocStyles.distanceRow}>
              <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
              <Text style={allocStyles.distance}>{alloc.customer_distance} away</Text>
            </View>
          )}
        </View>
        <View style={allocStyles.badge}>
          <View style={allocStyles.badgeDot} />
          <Text style={allocStyles.badgeText}>NEW</Text>
        </View>
      </View>

      <View style={allocStyles.cardBody}>
        {alloc.items.map((item) => (
          <View key={item.id} style={allocStyles.itemRow}>
            <Text
              style={[
                allocStyles.itemName,
                !checkedIds.has(item.id) && allocStyles.itemNameUnchecked,
              ]}
              numberOfLines={1}
            >
              {item.quantity} {item.unit} — {item.product_name}
              {item.price != null && <Text style={allocStyles.itemPriceInline}> · ₹{item.price}</Text>}
            </Text>
            <View style={allocStyles.itemBtns}>
              <TouchableOpacity
                style={[allocStyles.itemBtn, allocStyles.itemBtnAccept, checkedIds.has(item.id) && allocStyles.itemBtnAcceptActive]}
                onPress={() => !checkedIds.has(item.id) && toggleItem(item.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark" size={14} color={checkedIds.has(item.id) ? "#fff" : colors.success} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[allocStyles.itemBtn, allocStyles.itemBtnReject, !checkedIds.has(item.id) && allocStyles.itemBtnRejectActive]}
                onPress={() => checkedIds.has(item.id) && toggleItem(item.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={14} color={!checkedIds.has(item.id) ? "#fff" : colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={allocStyles.cardActions}>
          <TouchableOpacity
            style={allocStyles.rejectBtn}
            onPress={() => onReject(alloc.allocation_id, alloc.order_code)}
            disabled={accepting}
          >
            <Ionicons name="close-circle-outline" size={16} color={colors.error} />
            <Text style={allocStyles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[allocStyles.acceptBtn, (checkedIds.size === 0 || accepting) && allocStyles.acceptBtnDisabled]}
            onPress={() => onAccept(alloc.allocation_id, Array.from(checkedIds))}
            disabled={checkedIds.size === 0 || accepting}
          >
            {accepting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={allocStyles.acceptBtnText}>Accept ({checkedIds.size})</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {alloc.placed_at && (
        <View style={allocStyles.cardFooter}>
          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
          <Text style={allocStyles.cardFooterText}>
            {safeDate(alloc.placed_at)?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {safeDate(alloc.placed_at)?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </Text>
        </View>
      )}
    </View>
  );
});

export default function OrdersTab() {
  useRequireStoreApproval();
  const isFocused = useIsFocused();
  const [tab, setTab] = useState<"incoming" | "active" | "previous">("incoming");
  const { setIncomingCount } = useIncomingOrdersCount();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [refreshingActive, setRefreshingActive] = useState(false);
  const [refreshingPrevious, setRefreshingPrevious] = useState(false);

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [prevLoading, setPrevLoading] = useState(true);
  const [previousOrdersError, setPreviousOrdersError] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  const toggleDate = useCallback((title: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let s: any = await getSession();
        if (!s?.token) {
          await new Promise(r => setTimeout(r, 300));
          s = await getSession();
        }
        if (!s?.token) {
          if (!cancelled) router.replace("/landing");
          return;
        }
        if (cancelled) return;
        setSession(s);

        const selId = await AsyncStorage.getItem('selected_store_id');
        const cached = peekStores();
        if (cached && cached.length > 0) {
          const picked = (selId && cached.find(s => s.id === selId)) || cached[0];
          if (picked) setStoreId(picked.id);
          setAllocLoading(false);
          setPrevLoading(false);
          return;
        }

        const stores = await fetchStoresCached(s.token, s.user?.id);
        if (cancelled) return;
        const picked = (selId && stores.find(s => s.id === selId)) || stores[0];
        if (picked) setStoreId(picked.id);
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

  // Seed the Previous list from the persisted cache the moment the store id
  // resolves — switching to that tab used to show "No previous orders" (an
  // empty state presented as truth) until the first network fetch landed.
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    hydrateCache<any[]>(ordersCacheKey(storeId)).then((cached) => {
      if (cancelled || !cached?.length) return;
      setAllOrders((prev) => (prev.length > 0 ? prev : cached));
    });
    return () => { cancelled = true; };
  }, [storeId]);

  const fetchPreviousOrdersRef = useRef<(() => Promise<void>) | null>(null);

  // Timestamp of the most recent local accept/reject mutation. A poll that
  // was already in-flight when the shopkeeper accepted/rejected an order
  // carries pre-mutation server data — applying it after the fact would
  // revert the just-completed action's optimistic update (e.g. an accepted
  // allocation flashing back to pending_acceptance) for one poll cycle.
  const lastLocalMutationRef = useRef(0);
  const prevOrdersRequestIdRef = useRef(0);
  // Mount effect + focus effect fire on the same dep changes — throttle so
  // the same request doesn't go out 2-3 times back to back.
  const lastActiveFetchRef = useRef(0);
  const lastPrevFetchRef = useRef(0);

  const fetchActiveOrders = useCallback(async () => {
    if (!session?.token) return;
    const requestStartedAt = Date.now();
    lastActiveFetchRef.current = requestStartedAt;
    try {
      const response = await apiClient.get("/shopkeeper/orders", {
        Authorization: `Bearer ${session.token}`,
      });
      if (!response.success) {
        if (__DEV__) console.warn("[orders] fetchActiveOrders failed:", response.error_code, response.error);
        return;
      }
      const json: any = response.data;
      if (json?.success) {
        // A local mutation landed after this request was issued — its
        // response reflects stale, pre-mutation state. Skip applying it;
        // the next scheduled poll will pick up the real current state.
        if (lastLocalMutationRef.current > requestStartedAt) return;

        const active = (json.orders || []).filter(
          (a: Allocation) => a.alloc_status === "accepted" || a.alloc_status === "pending_acceptance"
        );

        setAllocations((prev) => {
          const prevMap = new Map(prev.map((a) => [a.allocation_id, a]));
          const next = active.map((o: Allocation) => ({
            ...o,
            pickup_code: o.pickup_code ?? prevMap.get(o.allocation_id)?.pickup_code ?? null,
          }));
          // Identity-stable commit — this runs every 10s; an identical-but-new
          // array re-rendered every card and the SectionList each tick.
          return sameData(prev, next) ? prev : next;
        });
      } else if (__DEV__) {
        console.warn("[orders] fetchActiveOrders: success=false", json);
      }
    } catch (e) {
      if (__DEV__) console.warn("[orders] fetchActiveOrders threw:", e);
    }
  }, [session?.token]);

  const fetchPreviousOrders = useCallback(async () => {
    if (!session || !storeId) return;
    lastPrevFetchRef.current = Date.now();
    // Sequence guard: focus effect, 60s poll, and pull-to-refresh can overlap;
    // only the most recently started request may commit.
    const requestId = ++prevOrdersRequestIdRef.current;
    try {
      // "Previous" only ever shows terminal-state orders — a shopkeeper
      // reviewing history has no real need to see more than the most recent
      // few hundred, and this now-bounded fetch is what previously grew
      // unbounded with a store's entire lifetime order count on every 60s
      // poll. payments.tsx's "All Time" view intentionally stays unbounded
      // (getOrdersFromDb(sid), no limit) since it needs a genuinely
      // complete total.
      const fromDb = await getOrdersFromDb(storeId, 200);
      if (requestId !== prevOrdersRequestIdRef.current) return;
      setPreviousOrdersError(false);
      if (!Array.isArray(fromDb) || fromDb.length === 0) {
        setAllOrders((prev) => (prev.length === 0 ? prev : []));
        writeCache(ordersCacheKey(storeId), []);
        return;
      }

      // getOrdersFromDb already resolves placed_at for the normal path — only
      // backfill the (rare) rows that still lack it, instead of re-querying
      // customer_orders for all ~200 orders on every poll tick.
      const coIds = [
        ...new Set(
          fromDb
            .filter((o: any) => !o.placed_at && o.customer_order_id)
            .map((o: any) => o.customer_order_id) as string[]
        ),
      ];
      const tsMap: Record<string, string> = {};
      if (coIds.length > 0 && supabase) {
        const { data } = await supabase
          .from("customer_orders")
          .select("id, placed_at")
          .in("id", coIds);
        if (data) {
          (data as { id: string; placed_at?: string }[]).forEach((co) => {
            if (co.placed_at) tsMap[co.id] = co.placed_at;
          });
        }
      }

      const withPlacedAt = fromDb.map((o: any) => {
        const placedAt =
          o.placed_at ||
          (o.customer_order_id && tsMap[o.customer_order_id]) ||
          undefined;
        return { ...o, ...(placedAt ? { placed_at: placedAt } : {}) };
      });

      // Orders the RPC returned with no `order_items` (an edge case — the
      // normal/happy path already includes them) previously each triggered
      // their own individual getOrderByIdFromDb() call — a full multi-join
      // single-order lookup, N of them fired concurrently via Promise.all
      // on every poll tick. All that's actually missing is order_items
      // itself, so this batches just that piece in one query instead.
      const missingItemIds = withPlacedAt
        .filter((o: any) => (!Array.isArray(o.order_items) || o.order_items.length === 0) && o?.id)
        .map((o: any) => String(o.id));

      let itemsByOrderId: Record<string, any[]> = {};
      if (missingItemIds.length > 0 && supabase) {
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("id, store_order_id, product_name, unit, image_url, unit_price, quantity")
          .in("store_order_id", missingItemIds);
        (itemsData ?? []).forEach((it: any) => {
          const list = itemsByOrderId[it.store_order_id] ?? [];
          list.push({
            id: it.id,
            product_name: it.product_name || "Item",
            quantity: Number(it.quantity ?? 0),
            unit: it.unit ?? "pcs",
            image_url: it.image_url ?? undefined,
            price: it.unit_price != null ? Number(it.unit_price) : undefined,
          });
          itemsByOrderId[it.store_order_id] = list;
        });
      }

      const withData = withPlacedAt.map((o: any) => {
        if (Array.isArray(o.order_items) && o.order_items.length > 0) return o;
        const items = itemsByOrderId[String(o.id)];
        return items ? { ...o, order_items: items } : o;
      });
      if (requestId !== prevOrdersRequestIdRef.current) return;
      setAllOrders((prev) => (sameData(prev, withData) ? prev : withData));
      // Persist for instant paint next session — strip item images, the list
      // only renders order codes/dates/counts.
      writeCache(
        ordersCacheKey(storeId),
        withData.map((o: any) => ({
          ...o,
          order_items: Array.isArray(o.order_items)
            ? o.order_items.map(({ image_url, ...it }: any) => it)
            : [],
        }))
      );
    } catch (e) {
      if (requestId !== prevOrdersRequestIdRef.current) return;
      if (e instanceof OrdersFetchFailedError) setPreviousOrdersError(true);
      // Never wipe an already-displayed list over a transient failure — a
      // background poll blip used to blank the whole Previous tab.
      setAllOrders((prev) => (prev.length > 0 ? prev : []));
    }
  }, [session, storeId]);

  // Wrap the poll-shared fetchers with their own `refreshing` flags so
  // pull-to-refresh shows a spinner — the raw fetchers are also called
  // silently by useSmartPoll/focus effects and shouldn't spin the UI then.
  const handleRefreshActive = useCallback(async () => {
    setRefreshingActive(true);
    await fetchActiveOrders();
    setRefreshingActive(false);
  }, [fetchActiveOrders]);

  const handleRefreshPrevious = useCallback(async () => {
    setRefreshingPrevious(true);
    await fetchPreviousOrders();
    setRefreshingPrevious(false);
  }, [fetchPreviousOrders]);

  useEffect(() => { fetchPreviousOrdersRef.current = fetchPreviousOrders; }, [fetchPreviousOrders]);

  const acceptAllocation = useCallback(async (allocId: string, itemIds?: string[]) => {
    if (!session?.token) return;
    if (respondingId) {
      // A different card's accept/reject is already in flight — the button
      // guard below only disables the card actually being responded to
      // (accepting={respondingId === a.allocation_id}), so a second card is
      // still tappable and would otherwise silently no-op here with zero
      // feedback.
      if (respondingId !== allocId) {
        Alert.alert("Please wait", "Still processing your last action — try again in a moment.");
      }
      return;
    }
    setRespondingId(allocId);
    try {
      const alloc = allocations.find((a) => a.allocation_id === allocId);
      const ids = itemIds ?? alloc?.items.map((i) => i.id) ?? [];
      const response = await apiClient.post(
        `/shopkeeper/allocations/${allocId}/accept`,
        { accepted_item_ids: ids },
        { Authorization: `Bearer ${session.token}` }
      );
      const json: any = response.data;
      if (response.success && json?.success) {
        const acceptedIds = new Set(ids);
        lastLocalMutationRef.current = Date.now();
        setAllocations((prev) =>
          prev.map((a) =>
            a.allocation_id === allocId
              ? {
                  ...a,
                  alloc_status: "accepted",
                  pickup_code: json.pickup_code ?? a.pickup_code,
                  items: a.items.filter((item) => acceptedIds.has(item.id)),
                }
              : a
          )
        );
      } else {
        Alert.alert("Error", json?.error || response.error || "Failed to accept order");
      }
    } catch {
      Alert.alert("Error", "Failed to accept order. Please try again.");
    } finally {
      setRespondingId(null);
    }
  }, [session?.token, allocations, respondingId]);

  const rejectAllocation = useCallback((allocId: string, orderCode: string) => {
    if (respondingId && respondingId !== allocId) {
      Alert.alert("Please wait", "Still processing your last action — try again in a moment.");
      return;
    }
    Alert.alert("Reject Order", `Reject order #${orderCode}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive",
        onPress: async () => {
          if (!session?.token) return;
          setRespondingId(allocId);
          try {
            const response = await apiClient.post(
              `/shopkeeper/allocations/${allocId}/reject`,
              undefined,
              { Authorization: `Bearer ${session.token}` }
            );
            if (!response.success) {
              Alert.alert("Error", "Failed to reject. Please try again.");
              return;
            }
            lastLocalMutationRef.current = Date.now();
            setAllocations((prev) => prev.filter((a) => a.allocation_id !== allocId));
          } catch {
            Alert.alert("Error", "Failed to reject. Please try again.");
          } finally {
            setRespondingId(null);
          }
        },
      },
    ]);
  }, [session?.token, respondingId]);

  useEffect(() => {
    if (session && storeId) {
      fetchActiveOrders();
      fetchPreviousOrders();
    }
  }, [session, storeId]);

  useEffect(() => {
    const count = allocations.filter((a) => a.alloc_status === "pending_acceptance").length;
    setIncomingCount(count);
  }, [allocations, setIncomingCount]);

  useSmartPoll(fetchActiveOrders, {
    intervalMs: 10_000,
    slowIntervalMs: 20_000,
    // Focus-gated: while another tab is up, IncomingOrdersProvider still
    // polls for the badge — this screen's richer poll can pause.
    enabled: !!(session?.token) && isFocused,
  });

  // fetchPreviousOrders fetches the store's *entire* order history (no
  // date range/limit — getOrdersFromDb has none to offer) every single
  // call; unlike Active/Incoming, "Previous" only ever shows terminal-state
  // orders (picked_up/rejected) that essentially never change once
  // reached, so there's little real benefit to polling them anywhere near
  // as often as the live Active/Incoming queues. Lengthened from 15s/30s to
  // 60s/120s — still refreshes automatically within a minute of a genuine
  // change, but cuts this specific full-history re-fetch's request volume
  // 4x for every shopkeeper with the Orders screen open.
  useSmartPoll(fetchPreviousOrders, {
    intervalMs: 60_000,
    slowIntervalMs: 120_000,
    enabled: !!(session && storeId) && isFocused,
  });

  useFocusEffect(
    React.useCallback(() => {
      if (session?.token && Date.now() - lastActiveFetchRef.current > 3_000) fetchActiveOrders();
      // Terminal-state orders essentially never change — a focus refetch
      // within half a poll interval of the last one is pure duplicate.
      if (session?.token && storeId && Date.now() - lastPrevFetchRef.current > 30_000) fetchPreviousOrders();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.token, storeId])
  );

  const incomingAllocations = useMemo(
    () => allocations.filter((a) => a.alloc_status === "pending_acceptance"),
    [allocations]
  );

  const activeAllocations = useMemo(
    () => allocations.filter((a) => a.alloc_status === "accepted"),
    [allocations]
  );

  const previousOrders = useMemo(
    () => allOrders.filter((o: any) => {
      const s = (o.status || "").toLowerCase().replace(/-/g, "_");
      return isDelivered(o.status) || s === "picked_up" || s === "store_accepted" || s === "ready_for_pickup";
    }),
    [allOrders]
  );

  const groupedPreviousOrders = useMemo(() => {
    const sorted = [...previousOrders].sort((a, b) => {
      const ta = resolveOrderDate(a)?.getTime() ?? 0;
      const tb = resolveOrderDate(b)?.getTime() ?? 0;
      return tb - ta;
    });
    const groups: Record<string, any[]> = {};
    const groupOrder: string[] = [];
    for (const o of sorted) {
      const d = resolveOrderDate(o);
      const label = d
        ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "Unknown Date";
      if (!groups[label]) { groups[label] = []; groupOrder.push(label); }
      groups[label].push(o);
    }
    return groupOrder.map((title) => ({ title, totalCount: groups[title].length, data: groups[title] }));
  }, [previousOrders]);

  const visibleSections = useMemo(
    () => groupedPreviousOrders.map((s) => ({
      ...s,
      data: collapsedDates.has(s.title) ? [] : s.data,
    })),
    [groupedPreviousOrders, collapsedDates]
  );

  if (allocLoading && prevLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Orders</Text>
          {tab === "incoming" && incomingAllocations.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: "#FF9800" }]}>
              <Text style={styles.countBadgeText}>{incomingAllocations.length}</Text>
            </View>
          )}
          {tab === "active" && activeAllocations.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeAllocations.length}</Text>
            </View>
          )}
          {tab === "previous" && previousOrders.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.info }]}>
              <Text style={styles.countBadgeText}>{previousOrders.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.tabs}>
          {(["incoming", "active", "previous"] as const).map((t) => {
            const icons = { incoming: "alert-circle-outline", active: "flash-outline", previous: "time-outline" } as const;
            const labels = { incoming: "Incoming", active: "Active", previous: "Previous" };
            const isActive = tab === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.tab, isActive && styles.tabActive, t === "incoming" && isActive && styles.tabActiveIncoming, t === "previous" && isActive && styles.tabActivePrevious]}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
              >
                {t === "incoming" && incomingAllocations.length > 0 && !isActive && (
                  <View style={styles.tabIncomingDot} />
                )}
                <Ionicons
                  name={icons[t]}
                  size={15}
                  color={isActive ? "#fff" : colors.textTertiary}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {labels[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {tab === "incoming" ? (
        <FlatList
          data={incomingAllocations}
          keyExtractor={(a) => a.allocation_id}
          contentContainerStyle={styles.list}
          refreshing={refreshingActive}
          onRefresh={handleRefreshActive}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "#FF9800" + "12" }]}>
                <Ionicons name="notifications-outline" size={36} color="#FF9800" />
              </View>
              <Text style={styles.emptyTitle}>No incoming orders</Text>
              <Text style={styles.emptySub}>New orders will appear here</Text>
            </View>
          }
          renderItem={({ item: a }) => (
            <AllocationCard
              alloc={a}
              accepting={respondingId === a.allocation_id}
              onAccept={acceptAllocation}
              onReject={rejectAllocation}
            />
          )}
        />
      ) : tab === "active" ? (
        <FlatList
          data={activeAllocations}
          keyExtractor={(a) => a.allocation_id}
          contentContainerStyle={styles.list}
          refreshing={refreshingActive}
          onRefresh={handleRefreshActive}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="flash-outline" size={36} color={colors.primary} />
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
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                      <Text style={styles.orderMeta}>{a.customer_distance} away</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: colors.success + "14", borderColor: colors.success + "35" }]}>
                  <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.statusBadgeText, { color: colors.success }]}>Active</Text>
                </View>
              </View>

              {a.pickup_code && (
                <View style={styles.pickupCodeBox}>
                  <View style={styles.pickupCodeIcon}>
                    <Ionicons name="key-outline" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupCodeLabel}>Pickup Code</Text>
                    <Text style={styles.pickupCodeValue}>{a.pickup_code}</Text>
                  </View>
                  <Text style={styles.pickupCodeHint}>Tell to driver</Text>
                </View>
              )}

              {a.receiver_name && (
                <View style={styles.pickupCodeBox}>
                  <View style={styles.pickupCodeIcon}>
                    <Ionicons name="person-outline" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupCodeLabel}>Deliver to (receiver)</Text>
                    <Text style={styles.pickupCodeValue}>{a.receiver_name}</Text>
                    {a.receiver_phone && <Text style={styles.orderMeta}>{a.receiver_phone}</Text>}
                    {a.receiver_address && <Text style={styles.orderMeta}>{a.receiver_address}</Text>}
                  </View>
                </View>
              )}

              <View style={styles.itemsDivider} />
              <View style={styles.itemsList}>
                {a.items.map((item, idx) => (
                  <View key={item.id} style={[styles.itemRow, idx < a.items.length - 1 && styles.itemRowBorder]}>
                    <View style={styles.itemBullet} />
                    <Text style={styles.itemText} numberOfLines={1}>
                      {item.quantity} {item.unit} — {item.product_name}
                    </Text>
                    {item.price != null && (
                      <Text style={styles.itemPrice}>₹{item.price}</Text>
                    )}
                  </View>
                ))}
              </View>

              {a.placed_at && (
                <View style={styles.cardFooter}>
                  <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.orderTime}>
                    {safeDate(a.placed_at)?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {safeDate(a.placed_at)?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </Text>
                  <View style={styles.itemCountPill}>
                    <Text style={styles.itemCountPillText}>{a.items.length} item{a.items.length !== 1 ? "s" : ""}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      ) : (
        previousOrders.length === 0 ? (
          previousOrdersError ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.error + "12" }]}>
                <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
              </View>
              <Text style={styles.emptyTitle}>Couldn&apos;t load orders</Text>
              <Text style={styles.emptySub}>Check your connection and try again.</Text>
              <TouchableOpacity
                style={[styles.emptyIconWrap, { backgroundColor: colors.error, width: undefined, height: undefined, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.md, borderRadius: radius.md }]}
                onPress={fetchPreviousOrders}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.info + "12" }]}>
                <Ionicons name="time-outline" size={36} color={colors.info} />
              </View>
              <Text style={styles.emptyTitle}>No previous orders</Text>
              <Text style={styles.emptySub}>Delivered orders will appear here</Text>
            </View>
          )
        ) : (
          <SectionList
            sections={visibleSections}
            keyExtractor={(o) => o.id}
            contentContainerStyle={styles.list}
            refreshing={refreshingPrevious}
            onRefresh={handleRefreshPrevious}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => {
              const collapsed = collapsedDates.has(section.title);
              return (
                <TouchableOpacity
                  style={styles.sectionHeaderRow}
                  onPress={() => toggleDate(section.title)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                  <View style={styles.sectionHeaderLine} />
                  <View style={styles.sectionHeaderRight}>
                    <View style={styles.sectionHeaderCountPill}>
                      <Text style={styles.sectionHeaderCount}>{section.totalCount}</Text>
                    </View>
                    <Ionicons
                      name={collapsed ? "chevron-forward" : "chevron-down"}
                      size={14}
                      color={colors.textTertiary}
                    />
                  </View>
                </TouchableOpacity>
              );
            }}
            renderItem={({ item: o }) => {
              const dateTimeStr = resolveOrderDateStr(o);
              const statusColor = getStatusColor(o.status);
              const items: any[] = Array.isArray(o.order_items) ? o.order_items : [];
              const itemCount = items.length;
              return (
                <TouchableOpacity
                  style={styles.prevCard}
                  onPress={() => router.push(`/invoice/${o.id}?source=orders`)}
                  activeOpacity={0.72}
                >
                  <View style={styles.prevCardAccent} />

                  <View style={{ flex: 1 }}>
                    <View style={styles.prevCardTop}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.prevCardCode}>#{o.order_code ?? "—"}</Text>
                        {dateTimeStr ? (
                          <View style={styles.metaRow}>
                            <Ionicons name="calendar-outline" size={11} color={colors.info} />
                            <Text style={styles.prevCardTime}>{dateTimeStr}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + "12", borderColor: statusColor + "30" }]}>
                        <Text style={[styles.statusPillText, { color: statusColor }]}>
                          {formatStatus(o.status)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.prevCardFooter}>
                      <Ionicons name="cube-outline" size={12} color={colors.info} />
                      <Text style={styles.prevCardItemCount}>
                        {itemCount} item{itemCount !== 1 ? "s" : ""}
                      </Text>
                      <View style={styles.spacer} />
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )
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
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabActiveIncoming: {
    backgroundColor: "#FF9800",
    borderColor: "#FF9800",
  },
  tabActivePrevious: {
    backgroundColor: colors.info,
    borderColor: colors.info,
  },
  tabIncomingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF9800",
    marginRight: 4,
  },
  tabText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: 4,
  },
  sectionHeaderText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flexShrink: 0,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  sectionHeaderCountPill: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeaderCount: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
  },

  prevCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
    marginBottom: spacing.xs,
  },
  prevCardAccent: {
    width: 3,
    backgroundColor: colors.info,
    alignSelf: "stretch",
  },
  prevCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  prevCardCode: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  prevCardTime: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "600",
  },
  prevCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
    paddingBottom: spacing.sm,
  },
  prevCardItemCount: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "600",
  },
  spacer: { flex: 1 },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.1,
  },

  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.md,
  },
  activeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: spacing.md,
  },
  activeCardLeft: { gap: 3 },
  orderCode: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  orderMeta: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  pickupCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "08",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.primary + "20",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pickupCodeIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  pickupCodeLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickupCodeValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 6,
  },
  pickupCodeHint: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "500",
  },

  itemsDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.md,
  },
  itemsList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    flexShrink: 0,
  },
  itemText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
    fontWeight: "500",
  },
  itemPrice: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 0,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.xs,
  },
  orderTime: {
    color: colors.textTertiary,
    fontSize: 11,
    flex: 1,
    fontWeight: "500",
  },
  itemCountPill: {
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemCountPillText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
  },

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
    backgroundColor: colors.primary + "10",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginTop: spacing.sm,
    letterSpacing: -0.2,
  },
  emptySub: {
    color: colors.textTertiary,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
    fontWeight: "400",
  },
});

const allocStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: "#FF6B00" + "35",
    marginBottom: spacing.md,
    overflow: "hidden",
    ...shadows.lg,
    shadowColor: "#FF6B00",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  cardHeaderLeft: { gap: 3 },
  orderCode: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  distance: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "500",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: "#FF9800" + "14",
    borderWidth: 1,
    borderColor: "#FF9800" + "40",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF9800",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: "#FF9800",
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemBtns: {
    flexDirection: "row",
    gap: 6,
    flexShrink: 0,
  },
  itemBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  itemBtnAccept: {
    borderColor: colors.success,
    backgroundColor: colors.surface,
  },
  itemBtnAcceptActive: {
    backgroundColor: colors.success,
  },
  itemBtnReject: {
    borderColor: colors.error,
    backgroundColor: colors.surface,
  },
  itemBtnRejectActive: {
    backgroundColor: colors.error,
  },
  itemName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  itemNameUnchecked: {
    color: colors.textTertiary,
    textDecorationLine: "line-through",
  },
  itemPriceInline: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: "600",
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.error + "10",
    borderWidth: 1,
    borderColor: colors.error + "35",
  },
  rejectBtnText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "700",
  },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: "#FF6B00",
    ...shadows.lg,
    shadowColor: "#FF6B00",
  },
  acceptBtnDisabled: {
    backgroundColor: "#FF9800" + "50",
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  cardFooterText: {
    color: colors.textTertiary,
    fontSize: 11,
    flex: 1,
    fontWeight: "500",
  },
});
