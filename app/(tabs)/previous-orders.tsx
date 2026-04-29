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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../lib/theme";
import { getOrderByIdFromDb, getOrdersFromDb } from "../../lib/orders-db";
import { getStatusColor, formatStatus, isDelivered } from "../../lib/order-utils";
// price is intentionally omitted from this screen — handled in Payouts
import { fetchStoresCached, peekStores } from "../../lib/appCache";
import { useSmartPoll } from "../../lib/useSmartPoll";
import { config } from "../../lib/config";
import { useIncomingOrdersCount } from "../../lib/incomingOrdersContext";

const API_BASE = config.API_BASE;
const AUTO_COMPLETE_MS = 2 * 60 * 1000;

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
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
            <Text style={allocStyles.distance}>{alloc.customer_distance} away</Text>
          )}
        </View>
        <View style={[allocStyles.badge, allocStyles.badgePending]}>
          <Text style={[allocStyles.badgeText, allocStyles.badgeTextPending]}>NEW</Text>
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
              <Text style={allocStyles.acceptBtnText}>Accept ({checkedIds.size} items)</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {alloc.placed_at && (
        <View style={allocStyles.cardFooter}>
          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
          <Text style={allocStyles.cardFooterText}>
            {formatTime(alloc.placed_at)} · {new Date(alloc.placed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </Text>
        </View>
      )}
    </View>
  );
});

export default function OrdersTab() {
  const [tab, setTab] = useState<"incoming" | "active" | "previous">("incoming");
  const { setIncomingCount } = useIncomingOrdersCount();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

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

  // Ref so fetchActiveOrders can call fetchPreviousOrders without a circular dep
  const fetchPreviousOrdersRef = useRef<(() => Promise<void>) | null>(null);

  const fetchActiveOrders = useCallback(async () => {
    if (!session?.token) return;
    try {
      const res = await fetch(`${API_BASE}/shopkeeper/orders`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        if (__DEV__) console.warn("[orders] fetchActiveOrders failed:", res.status, await res.text());
        return;
      }
      const json = await res.json();
      if (json?.success) {
        const active = (json.orders || []).filter(
          (a: Allocation) => a.alloc_status === "accepted" || a.alloc_status === "pending_acceptance"
        );

        // Auto-complete accepted orders older than AUTO_COMPLETE_MS (simulation)
        const now = Date.now();
        const toComplete = active.filter((a: Allocation) => {
          if (a.alloc_status !== "accepted") return false;
          const ts = (a as any).accepted_at ?? a.placed_at;
          return ts && now - new Date(ts).getTime() >= AUTO_COMPLETE_MS;
        });

        if (toComplete.length > 0) {
          await Promise.allSettled(
            toComplete.map((a: Allocation) =>
              fetch(`${API_BASE}/shopkeeper/allocations/${a.allocation_id}/complete`, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.token}` },
              }).catch(() => {})
            )
          );
          // Re-fetch after completing so previous tab gets the delivered orders
          fetchPreviousOrdersRef.current?.();
        }

        const stillActive = active.filter(
          (a: Allocation) => !toComplete.some((c: Allocation) => c.allocation_id === a.allocation_id)
        );

        setAllocations((prev) => {
          const prevMap = new Map(prev.map((a) => [a.allocation_id, a]));
          return stillActive.map((o: Allocation) => ({
            ...o,
            pickup_code: o.pickup_code ?? prevMap.get(o.allocation_id)?.pickup_code ?? null,
          }));
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
    try {
      const fromDb = await getOrdersFromDb(storeId);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        const withItems = await Promise.all(
          fromDb.map(async (o: any) => {
            if (Array.isArray(o.order_items) && o.order_items.length > 0) return o;
            if (!o?.id) return o;
            try {
              const detail = await getOrderByIdFromDb(String(o.id));
              if (!detail) return o;
              return { ...o, order_items: detail.order_items };
            } catch {
              return o;
            }
          })
        );
        setAllOrders(withItems);
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

  // Keep the ref current so fetchActiveOrders can call it without a circular dep
  useEffect(() => { fetchPreviousOrdersRef.current = fetchPreviousOrders; }, [fetchPreviousOrders]);

  const acceptAllocation = useCallback(async (allocId: string, itemIds?: string[]) => {
    if (!session?.token || respondingId) return;
    setRespondingId(allocId);
    try {
      const alloc = allocations.find((a) => a.allocation_id === allocId);
      const ids = itemIds ?? alloc?.items.map((i) => i.id) ?? [];
      const res = await fetch(`${API_BASE}/shopkeeper/allocations/${allocId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accepted_item_ids: ids }),
      });
      const json = await res.json();
      if (json?.success) {
        setAllocations((prev) =>
          prev.map((a) =>
            a.allocation_id === allocId
              ? { ...a, alloc_status: "accepted", pickup_code: json.pickup_code ?? a.pickup_code }
              : a
          )
        );
      } else {
        Alert.alert("Error", json?.error || "Failed to accept order");
      }
    } catch {
      Alert.alert("Error", "Failed to accept order. Please try again.");
    } finally {
      setRespondingId(null);
    }
  }, [session?.token, allocations, respondingId]);

  const rejectAllocation = useCallback((allocId: string, orderCode: string) => {
    Alert.alert("Reject Order", `Reject order #${orderCode}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive",
        onPress: async () => {
          if (!session?.token) return;
          setRespondingId(allocId);
          try {
            await fetch(`${API_BASE}/shopkeeper/allocations/${allocId}/reject`, {
              method: "POST",
              headers: { Authorization: `Bearer ${session.token}` },
            });
            setAllocations((prev) => prev.filter((a) => a.allocation_id !== allocId));
          } catch {
            Alert.alert("Error", "Failed to reject. Please try again.");
          } finally {
            setRespondingId(null);
          }
        },
      },
    ]);
  }, [session?.token]);

  useEffect(() => {
    if (session && storeId) {
      fetchActiveOrders();
      fetchPreviousOrders();
    }
  }, [session, storeId]);

  // Sync incoming count to bottom tab badge
  useEffect(() => {
    const count = allocations.filter((a) => a.alloc_status === "pending_acceptance").length;
    setIncomingCount(count);
  }, [allocations, setIncomingCount]);

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

  // Group previous orders by date
  const groupedPreviousOrders = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const o of previousOrders) {
      const rawDate = o.created_at ?? o.createdAt ?? o.placed_at ?? "";
      const label = rawDate ? formatDateLabel(rawDate) : "Unknown Date";
      if (!groups[label]) groups[label] = [];
      groups[label].push(o);
    }
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [previousOrders]);

  if (allocLoading && prevLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header + tabs */}
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
            <View style={[styles.countBadge, { backgroundColor: colors.textTertiary }]}>
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
                style={[styles.tab, isActive && styles.tabActive, t === "incoming" && isActive && styles.tabActiveIncoming]}
                onPress={() => setTab(t)}
              >
                {t === "incoming" && incomingAllocations.length > 0 && !isActive && (
                  <View style={styles.tabIncomingDot} />
                )}
                <Ionicons
                  name={icons[t]}
                  size={16}
                  color={isActive ? "#fff" : colors.textTertiary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {labels[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* Incoming orders tab */}
      {tab === "incoming" ? (
        <FlatList
          data={incomingAllocations}
          keyExtractor={(a) => a.allocation_id}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={fetchActiveOrders}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="alert-circle-outline" size={40} color="#FF9800" />
              </View>
              <Text style={styles.emptyTitle}>No incoming orders</Text>
              <Text style={styles.emptySub}>New orders waiting for your response will appear here</Text>
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
        /* Active (accepted) orders tab */
        <FlatList
          data={activeAllocations}
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
              {/* Card top row */}
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
                <View style={[styles.statusBadge, { backgroundColor: colors.success + "20", borderColor: colors.success + "50" }]}>
                  <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.statusBadgeText, { color: colors.success }]}>Active</Text>
                </View>
              </View>

              {/* Pickup code */}
              {a.pickup_code && (
                <View style={styles.pickupCodeBox}>
                  <Ionicons name="key-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupCodeLabel}>Pickup Code</Text>
                    <Text style={styles.pickupCodeValue}>{a.pickup_code}</Text>
                  </View>
                  <Text style={styles.pickupCodeHint}>Give to driver</Text>
                </View>
              )}

              {/* Items */}
              <View style={styles.itemsDivider} />
              <View style={styles.itemsList}>
                {a.items.map((item, idx) => (
                  <View key={item.id} style={[styles.itemRow, idx < a.items.length - 1 && styles.itemRowBorder]}>
                    <View style={styles.itemBullet} />
                    <Text style={styles.itemText} numberOfLines={1}>
                      {item.quantity} {item.unit} — {item.product_name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Footer */}
              {a.placed_at && (
                <View style={styles.cardFooter}>
                  <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.orderTime}>
                    {formatTime(a.placed_at)} · {new Date(a.placed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </Text>
                  <Text style={styles.itemCountBadge}>{a.items.length} item{a.items.length !== 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>
          )}
        />
      ) : (
        /* Previous orders tab */
        previousOrders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="time-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No previous orders</Text>
            <Text style={styles.emptySub}>Delivered orders will appear here</Text>
          </View>
        ) : (
          <SectionList
            sections={groupedPreviousOrders}
            keyExtractor={(o) => o.id}
            contentContainerStyle={styles.list}
            refreshing={false}
            onRefresh={fetchPreviousOrders}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
                <View style={styles.sectionHeaderLine} />
              </View>
            )}
            renderItem={({ item: o }) => {
              const rawDate = o.created_at ?? o.createdAt ?? o.placed_at ?? "";
              const validDate = rawDate && !Number.isNaN(new Date(rawDate).getTime());
              const statusColor = getStatusColor(o.status);
              const itemCount = Array.isArray(o.order_items) ? o.order_items.length : 0;
              const itemPreview = Array.isArray(o.order_items)
                ? o.order_items.slice(0, 2).map((it: any) => it?.product_name).filter(Boolean).join(", ")
                : "";
              const hasMore = itemCount > 2;

              return (
                <TouchableOpacity
                  style={styles.prevCard}
                  onPress={() => router.push(`/invoice/${o.id}`)}
                  activeOpacity={0.72}
                >
                  <View style={[styles.prevCardAccent, { backgroundColor: statusColor }]} />

                  <View style={styles.prevCardBody}>
                    <Text style={styles.prevCardCode}>#{o.order_code}</Text>

                    {itemPreview ? (
                      <Text style={styles.prevCardItems} numberOfLines={1}>
                        {itemPreview}{hasMore ? ` +${itemCount - 2} more` : ""}
                      </Text>
                    ) : null}

                    <View style={styles.prevCardBottom}>
                      {validDate && (
                        <View style={styles.metaRow}>
                          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                          <Text style={styles.prevCardTime}>{formatTime(rawDate)}</Text>
                        </View>
                      )}
                      {itemCount > 0 && (
                        <Text style={styles.prevCardItemCount}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
                      )}
                      <View style={styles.spacer} />
                      <View style={[styles.statusPill, { backgroundColor: statusColor + "18", borderColor: statusColor + "50" }]}>
                        <Text style={[styles.statusPillText, { color: statusColor }]}>
                          {formatStatus(o.status)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.prevCardChevron} />
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
  tabActiveIncoming: {
    backgroundColor: "#FF9800",
    borderColor: "#FF9800",
    shadowColor: "#FF9800",
  },
  tabIncomingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF9800",
    marginRight: 4,
  },
  tabText: { color: colors.textTertiary, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },

  // ── Section header ─────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionHeaderText: {
    color: colors.textTertiary,
    fontSize: 12,
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

  // ── Previous order card ────────────────────────────────────────
  prevCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: spacing.xs,
  },
  prevCardAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  prevCardBody: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  prevCardCode: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  prevCardItems: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  prevCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 4,
  },
  prevCardTime: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  prevCardItemCount: {
    color: colors.textTertiary,
    fontSize: 11,
    marginLeft: spacing.xs,
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
    letterSpacing: 0.2,
  },
  prevCardChevron: {
    alignSelf: "center",
    marginRight: spacing.sm,
  },

  // ── Active order card ──────────────────────────────────────────
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    letterSpacing: 0.3,
  },

  pickupCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "10",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.primary + "25",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  },
  itemCountBadge: {
    color: colors.textTertiary,
    fontSize: 11,
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  // ── Pending order actions ──────────────────────────────────���──
  activeCardPending: {
    borderColor: "#FF9800" + "50",
    borderWidth: 1.5,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  rejectActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.error + "15",
    borderWidth: 1,
    borderColor: colors.error + "50",
  },
  rejectActionText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "700",
  },
  acceptActionBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  acceptActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Empty states ──────────────────────────────────────────────
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

const allocStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "#FF9800" + "55",
    marginBottom: spacing.sm,
    overflow: "hidden",
    shadowColor: "#FF9800",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
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
    fontSize: 16,
    fontWeight: "800",
  },
  distance: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgePending: {
    backgroundColor: "#FF9800" + "20",
    borderColor: "#FF9800" + "60",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  badgeTextPending: { color: "#FF9800" },
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
    borderRadius: 8,
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
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.error + "15",
    borderWidth: 1,
    borderColor: colors.error + "50",
  },
  rejectBtnText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "700",
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: "#FF9800",
  },
  acceptBtnDisabled: {
    backgroundColor: "#FF9800" + "60",
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
  },
});
