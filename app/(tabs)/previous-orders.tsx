import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { colors, layout, motion, radius, spacing } from "../../lib/theme";
import { useBottomPadding, useLayout } from "../../lib/useLayout";
import { useSelectedStore } from "../../lib/useSelectedStore";
import { isDelivered } from "../../lib/order-utils";
import { apiClient } from "../../lib/api-client";
import { useRequireStoreApproval } from "../../lib/useRequireStoreApproval";
import {
  ConfirmSheet,
  EmptyState,
  ErrorState,
  InlineNotice,
  Screen,
  Skeleton,
  triggerHaptic,
  useToast,
  type IoniconName,
} from "../../components/ui";
import {
  ActiveOrderCard,
  CollapsibleSectionHeader,
  IncomingOrderCard,
  ON_ACCENT,
  ORANGE,
  PreviousOrderCard,
  resolveOrderDate,
  resolveOrderDateStr,
  type Allocation,
} from "../../components/orders";
import { useOrdersFeed } from "../../components/orders/useOrdersFeed";

type OrdersTabKey = "incoming" | "active" | "previous";

type PreviousSection = { title: string; totalCount: number; data: any[] };

type RejectTarget = { allocId: string; orderCode: string };

const PLEASE_WAIT = "Still processing your last action — try again in a moment.";
const REJECT_FAILED = "Couldn't reject the order. Try again.";

/** Pre-redesign header entrance: 400ms fade + 16dp slide, ease-out quad. */
const HEADER_ENTRANCE_MS = 400;

/** Per-tab accent from the pre-redesign screen: count badge + active pill colour. */
const TABS: { key: OrdersTabKey; label: string; icon: IoniconName; color: string }[] = [
  { key: "incoming", label: "Incoming", icon: "alert-circle-outline", color: ORANGE },
  { key: "active", label: "Active", icon: "flash-outline", color: colors.primary },
  { key: "previous", label: "Previous", icon: "time-outline", color: colors.info },
];

/** 180ms layout transition for card add/remove and accordion expand. */
function animateLayout() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(motion.layout, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
  );
}

function errorMessageOf(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

export default function OrdersTab() {
  useRequireStoreApproval();
  const isFocused = useIsFocused();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { show: showToast } = useToast();
  const [tab, setTab] = useState<OrdersTabKey>("incoming");

  // Header block fade + slide in once on mount, as the pre-redesign screen did.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: HEADER_ENTRANCE_MS,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: HEADER_ENTRANCE_MS,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Deep links (Home's "Review orders", the inbox's new_order tap) push this
  // tab with `?tab=incoming`. The tab screen stays mounted, so the segment is
  // local state and must be driven from the param, not just its initial value.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: OrdersTabKey }>();
  useEffect(() => {
    if (tabParam === "incoming" || tabParam === "active" || tabParam === "previous") setTab(tabParam);
  }, [tabParam]);

  // Store resolution is the shared hook (selected_store_id -> store cache ->
  // fetch fallback, is_active re-read on every focus); the feed takes its
  // result. Both feeds, cache seed, polling, realtime nudge and the focus
  // refetch live in the feed hook; this file is presentation + actions.
  const selected = useSelectedStore();
  const {
    session,
    storeActive,
    allocations,
    setAllocations,
    allocLoading,
    activeLoaded,
    activeOrdersError,
    allOrders,
    prevLoading,
    prevLoaded,
    previousOrdersError,
    refreshingActive,
    refreshingPrevious,
    handleRefreshActive,
    handleRefreshPrevious,
    markLocalMutation,
  } = useOrdersFeed(isFocused, selected);

  // Only the card being responded to is disabled; a second card's tap gets
  // the "please wait" toast from the guards below.
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  // Reject confirmation. `rejectTarget` outlives `rejectVisible` so the sheet
  // keeps its title while it animates out.
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectVisible, setRejectVisible] = useState(false);

  const toggleDate = useCallback((title: string) => {
    animateLayout();
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const acceptAllocation = useCallback(
    async (allocId: string, itemIds?: string[]) => {
      if (!session?.token) return;
      if (respondingId) {
        // A different card's accept/reject is already in flight — the button
        // guard only disables the card actually being responded to
        // (accepting={respondingId === a.allocation_id}), so a second card is
        // still tappable and would otherwise silently no-op here with zero
        // feedback.
        if (respondingId !== allocId) showToast({ message: PLEASE_WAIT });
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
          markLocalMutation();
          animateLayout();
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
          void triggerHaptic("success");
          showToast({
            message: "Order accepted · moved to Active",
            tone: "success",
            action: { label: "View", onPress: () => setTab("active") },
          });
        } else {
          void triggerHaptic("error");
          showToast({
            message: errorMessageOf(json?.error, response.error) ?? "Couldn't accept the order. Try again.",
            tone: "error",
          });
        }
      } catch {
        void triggerHaptic("error");
        showToast({ message: "Couldn't accept the order. Try again.", tone: "error" });
      } finally {
        setRespondingId(null);
      }
    },
    [session?.token, allocations, respondingId, showToast, markLocalMutation, setAllocations]
  );

  const rejectAllocation = useCallback(
    (allocId: string, orderCode: string) => {
      if (respondingId && respondingId !== allocId) {
        showToast({ message: PLEASE_WAIT });
        return;
      }
      setRejectTarget({ allocId, orderCode });
      setRejectVisible(true);
    },
    [respondingId, showToast]
  );

  // Runs inside ConfirmSheet: a thrown error is shown inline in the sheet
  // (which stays open for a retry) and ConfirmSheet fires the error haptic;
  // resolving closes it.
  const confirmReject = useCallback(async () => {
    const target = rejectTarget;
    if (!target || !session?.token) return;
    setRespondingId(target.allocId);
    try {
      const response = await apiClient.post(`/shopkeeper/allocations/${target.allocId}/reject`, undefined, {
        Authorization: `Bearer ${session.token}`,
      });
      if (!response.success) throw new Error(REJECT_FAILED);
      markLocalMutation();
      animateLayout();
      setAllocations((prev) => prev.filter((a) => a.allocation_id !== target.allocId));
      showToast({ message: "Order rejected" });
    } catch (e) {
      throw e instanceof Error ? e : new Error(REJECT_FAILED);
    } finally {
      setRespondingId(null);
    }
  }, [rejectTarget, session?.token, showToast, markLocalMutation, setAllocations]);

  const closeReject = useCallback(() => setRejectVisible(false), []);

  const incomingAllocations = useMemo(
    () => allocations.filter((a) => a.alloc_status === "pending_acceptance"),
    [allocations]
  );

  const activeAllocations = useMemo(() => allocations.filter((a) => a.alloc_status === "accepted"), [allocations]);

  const previousOrders = useMemo(
    () =>
      allOrders.filter((o: any) => {
        const s = (o.status || "").toLowerCase().replace(/-/g, "_");
        return isDelivered(o.status) || s === "picked_up" || s === "store_accepted" || s === "ready_for_pickup";
      }),
    [allOrders]
  );

  const groupedPreviousOrders = useMemo<PreviousSection[]>(() => {
    const sorted = [...previousOrders].sort((a, b) => {
      const ta = resolveOrderDate(a)?.getTime() ?? 0;
      const tb = resolveOrderDate(b)?.getTime() ?? 0;
      return tb - ta;
    });
    const groups: Record<string, any[]> = {};
    const groupOrder: string[] = [];
    for (const o of sorted) {
      const d = resolveOrderDate(o);
      const label = d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unknown date";
      if (!groups[label]) {
        groups[label] = [];
        groupOrder.push(label);
      }
      groups[label].push(o);
    }
    return groupOrder.map((title) => ({ title, totalCount: groups[title].length, data: groups[title] }));
  }, [previousOrders]);

  const visibleSections = useMemo(
    () =>
      groupedPreviousOrders.map((s) => ({
        ...s,
        data: collapsedDates.has(s.title) ? [] : s.data,
      })),
    [groupedPreviousOrders, collapsedDates]
  );

  // Count shown in the header badge beside the title, per tab.
  const tabCounts = useMemo<Record<OrdersTabKey, number>>(
    () => ({
      incoming: incomingAllocations.length,
      active: activeAllocations.length,
      previous: previousOrders.length,
    }),
    [incomingAllocations.length, activeAllocations.length, previousOrders.length]
  );
  const currentTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const headerCount = tabCounts[tab];

  const selectTab = useCallback(
    (key: OrdersTabKey) => {
      if (key === tab) return;
      void triggerHaptic("light");
      setTab(key);
    },
    [tab]
  );

  // The online toggle (approval check, confirm sheet, PATCH, cache patch and
  // reconciliation) lives on Home; this only takes the shopkeeper to it, so
  // the button says exactly that rather than promising to flip the state.
  const openStoreStatus = useCallback(() => router.push("/(tabs)/home"), []);

  // Centred content column capped at contentWidth. The gutter is applied per
  // row / header body / empty wrapper (same mechanics as Payouts) so the
  // header keeps its own padding intact.
  const contentStyle = useMemo(
    () => [styles.list, { paddingBottom, maxWidth: contentWidth + gutter * 2 }],
    [gutter, paddingBottom, contentWidth]
  );
  const gutterStyle = useMemo(() => ({ paddingHorizontal: gutter }), [gutter]);

  const isLive = tab !== "previous";
  // "Loaded" is feed-level, not per-tab: after one successful fetch with zero
  // pending orders, a later 10s poll blip must NOT flip Incoming from "No
  // incoming orders" to a full ErrorState while Active (same feed) is intact.
  // ErrorState only when nothing has ever loaded; otherwise EmptyState plus
  // the stale-data notice. Length checks cover the persisted-cache seed and
  // the pre-first-success case where data is already on screen.
  const liveLoaded = activeLoaded || allocations.length > 0;
  const historyLoaded = prevLoaded || allOrders.length > 0;
  const currentLoaded = isLive ? liveLoaded : historyLoaded;
  const currentError = isLive ? activeOrdersError : previousOrdersError;
  const showStaleNotice = currentError && currentLoaded;
  // No store resolved (lookup failed / none on the account): the fetchers
  // never ran, so "Try again" must re-run the store bootstrap, not the feed.
  const noStore = !selected.loading && !selected.storeId;
  const retryCurrent = noStore ? selected.retry : isLive ? handleRefreshActive : handleRefreshPrevious;
  const refreshingCurrent = noStore ? selected.loading : isLive ? refreshingActive : refreshingPrevious;

  // Header lives inside each list so it scrolls with the content and the tab
  // pills stay mounted through loading / error / empty states. Look is the
  // pre-redesign one: 28/800 title with the per-tab count badge, then
  // content-sized pills whose active fill takes the tab's accent colour.
  const listHeader = (
    <View style={styles.header}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={[styles.headerRow, gutterStyle]}>
          <Text style={styles.title} accessibilityRole="header">
            Orders
          </Text>
          {headerCount > 0 ? (
            <View
              style={[styles.countBadge, { backgroundColor: currentTab.color }]}
              accessible
              accessibilityLabel={`${headerCount} ${currentTab.label.toLowerCase()} orders`}
            >
              <Text style={styles.countBadgeText}>{headerCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.tabs, gutterStyle]} accessibilityRole="tablist" accessibilityLabel="Order lists">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            const showDot = t.key === "incoming" && !isActive && tabCounts.incoming > 0;
            return (
              <Pressable
                key={t.key}
                style={({ pressed }) => [
                  styles.tab,
                  isActive && { backgroundColor: t.color, borderColor: t.color },
                  pressed && !isActive && styles.tabPressed,
                ]}
                onPress={() => selectTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={
                  t.key === "incoming" && tabCounts.incoming > 0
                    ? `${t.label} orders, ${tabCounts.incoming} new`
                    : `${t.label} orders`
                }
              >
                {showDot ? <View style={styles.tabIncomingDot} /> : null}
                <Ionicons name={t.icon} size={15} color={isActive ? ON_ACCENT : colors.textTertiary} style={styles.tabIcon} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {tab === "incoming" && !storeActive ? (
        <View style={[styles.notice, gutterStyle]}>
          <InlineNotice
            tone="warning"
            title="Your store is offline"
            message="Incoming orders can't be accepted until you go online."
            action={{ label: "Open store status", onPress: openStoreStatus }}
          />
        </View>
      ) : null}
      {showStaleNotice ? (
        <View style={[styles.notice, gutterStyle]}>
          <InlineNotice
            tone="warning"
            title="Couldn't refresh"
            message="Showing saved data"
            action={{ label: "Retry", onPress: retryCurrent }}
          />
        </View>
      ) : null}
    </View>
  );

  // Per-list loading / error / empty states, rendered as ListEmptyComponent so
  // pull-to-refresh keeps working. Each list keeps its skeleton until ITS
  // first fetch settles; a failure before anything has loaded becomes a
  // retryable error instead of a false "No ... orders" empty state, while a
  // failure after a load keeps the empty state (the stale notice above says why).
  const renderListState = (
    loading: boolean,
    error: boolean,
    loaded: boolean,
    skeleton: React.ReactElement,
    empty: React.ReactElement
  ) => {
    let state: React.ReactElement;
    if (loading) state = skeleton;
    else if (error && !loaded) {
      state = (
        <ErrorState
          title="Couldn't load orders"
          message="Check your connection and try again."
          action={{ onPress: retryCurrent, loading: refreshingCurrent }}
        />
      );
    } else state = empty;
    return <View style={[styles.emptyWrap, gutterStyle]}>{state}</View>;
  };

  // Incoming / Active rows are cards, so their skeleton is card-shaped.
  const cardSkeleton = (
    <View style={styles.skeletonStack}>
      <Skeleton.Card lines={3} />
      <Skeleton.Card lines={3} />
    </View>
  );

  // Previous rows are compact cards under a 44dp date header, so the
  // skeleton mirrors that: one short header line, then one-line cards.
  const historySkeleton = (
    <View style={styles.skeletonStack}>
      <View style={styles.skeletonSectionHeader}>
        <Skeleton.Box width={layout.listRowLeadingSlot * 3} height={spacing.lg} />
      </View>
      <Skeleton.Card lines={1} />
      <Skeleton.Card lines={1} />
      <Skeleton.Card lines={1} />
      <Skeleton.Card lines={1} />
    </View>
  );

  const renderIncoming = useCallback(
    ({ item: a }: { item: Allocation }) => (
      <View style={[styles.incomingRow, gutterStyle]}>
        <IncomingOrderCard
          alloc={a}
          accepting={respondingId === a.allocation_id}
          storeActive={storeActive}
          onAccept={acceptAllocation}
          onReject={rejectAllocation}
        />
      </View>
    ),
    [gutterStyle, respondingId, storeActive, acceptAllocation, rejectAllocation]
  );

  const renderActive = useCallback(
    ({ item: a }: { item: Allocation }) => (
      <View style={gutterStyle}>
        <ActiveOrderCard alloc={a} />
      </View>
    ),
    [gutterStyle]
  );

  const renderPreviousHeader = useCallback(
    ({ section }: { section: PreviousSection }) => (
      <View style={gutterStyle}>
        <CollapsibleSectionHeader
          title={section.title}
          count={section.totalCount}
          expanded={!collapsedDates.has(section.title)}
          onToggle={() => toggleDate(section.title)}
        />
      </View>
    ),
    [gutterStyle, collapsedDates, toggleDate]
  );

  const renderPrevious = useCallback(
    ({ item: o }: { item: any }) => {
      const items: any[] = Array.isArray(o.order_items) ? o.order_items : [];
      const amount = Number(o.total_amount ?? 0);
      return (
        <View style={gutterStyle}>
          <PreviousOrderCard
            orderCode={o.order_code ?? "—"}
            dateTime={resolveOrderDateStr(o)}
            itemCount={items.length}
            status={o.status}
            amount={amount > 0 ? amount : null}
            onPress={() => router.push(`/invoice/${o.id}?source=orders`)}
          />
        </View>
      );
    },
    [gutterStyle]
  );

  const keyAllocation = useCallback((a: Allocation) => a.allocation_id, []);
  const keyOrder = useCallback((o: any) => String(o.id), []);

  return (
    <Screen>
      {tab === "incoming" ? (
        <FlatList
          data={incomingAllocations}
          keyExtractor={keyAllocation}
          contentContainerStyle={contentStyle}
          refreshing={refreshingActive}
          onRefresh={handleRefreshActive}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={renderListState(
            allocLoading,
            activeOrdersError,
            liveLoaded,
            cardSkeleton,
            <EmptyState icon="notifications-outline" title="No incoming orders" message="New orders will appear here." />
          )}
          renderItem={renderIncoming}
        />
      ) : tab === "active" ? (
        <FlatList
          data={activeAllocations}
          keyExtractor={keyAllocation}
          contentContainerStyle={contentStyle}
          refreshing={refreshingActive}
          onRefresh={handleRefreshActive}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={renderListState(
            allocLoading,
            activeOrdersError,
            liveLoaded,
            cardSkeleton,
            <EmptyState icon="flash-outline" title="No active orders" message="Accepted orders will appear here." />
          )}
          renderItem={renderActive}
        />
      ) : (
        <SectionList<any, PreviousSection>
          sections={visibleSections}
          keyExtractor={keyOrder}
          contentContainerStyle={contentStyle}
          refreshing={refreshingPrevious}
          onRefresh={handleRefreshPrevious}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={renderListState(
            prevLoading,
            previousOrdersError,
            historyLoaded,
            historySkeleton,
            <EmptyState icon="time-outline" title="No previous orders" message="Completed orders will appear here." />
          )}
          renderSectionHeader={renderPreviousHeader}
          renderItem={renderPrevious}
        />
      )}

      <ConfirmSheet
        visible={rejectVisible}
        onClose={closeReject}
        destructive
        icon="close-circle-outline"
        title={rejectTarget ? `Reject order #${rejectTarget.orderCode}?` : "Reject order?"}
        message="This cannot be undone."
        confirmLabel="Reject"
        onConfirm={confirmReject}
        fallbackErrorMessage={REJECT_FAILED}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 1,
    gap: spacing.sm,
    width: "100%",
    alignSelf: "center",
  },
  header: { paddingBottom: spacing.xs },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: { color: ON_ACCENT, fontSize: 12, fontWeight: "700" },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.touchTargetCompact,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabPressed: { opacity: 0.8 },
  tabIncomingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ORANGE, marginRight: 4 },
  tabIcon: { marginRight: 5 },
  tabText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: ON_ACCENT },
  notice: { marginTop: spacing.sm },
  // The old AllocationCard carried its own 12dp bottom margin on top of the list gap.
  incomingRow: { marginBottom: spacing.xs },
  emptyWrap: { flexGrow: 1 },
  skeletonStack: { gap: spacing.md },
  skeletonSectionHeader: { minHeight: layout.touchTarget, justifyContent: "center" },
});
