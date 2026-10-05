import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { useBottomPadding, useLayout } from "../../lib/useLayout";
import { supabase } from "../../lib/supabase";
import { setAllProductsOffline, restoreActiveProductsOnline } from "../../lib/storeProducts";
import { StoreStatusCard } from "../../components/StoreStatusCard";
import { StockList, type StockListHandle } from "../../components/stock";
import { ConfirmSheet, ErrorState, Screen, Skeleton, useToast, type IoniconName } from "../../components/ui";
import { forceFetchStores, peekStores, patchStoreActive, type CachedStore } from "../../lib/appCache";
import { useSelectedStore } from "../../lib/useSelectedStore";
import { isStoreApproved, refreshStoreApproval } from "../../lib/storeApproval";
import { notificationService } from "../../lib/notifications";
import { onOrdersChanged } from "../../lib/orderEvents";
import { shouldAutoOpenAlertSetup, useAlertSetup } from "../../lib/alertSetup";
import { startOrderListener, stopOrderListener } from "../../lib/orderListenerService";
import { useSmartPoll } from "../../lib/useSmartPoll";
import { useIncomingOrdersCount } from "../../lib/incomingOrdersContext";
import { apiClient } from "../../lib/api-client";
import { hydrateCache, peekCache, sameData } from "../../lib/persistCache";
import { productsCacheKey, type StockProduct } from "../../lib/useStoreStock";
import { lastNotificationsReadMutationTs, peekNotifications, persistNotifications } from "../../lib/notificationsCache";
import { TodayCard, useTodayStats } from "../../components/home/TodayCard";
import { HomeCard, HomePrimaryButton } from "../../components/home/HomeCard";
import { StoreSwitcher } from "../../components/StoreSwitcher";

/** How long the "approved" notice stays up. */
const APPROVED_BANNER_MS = 4_700;
type StoreRow = CachedStore;
const TILE_GAP = 10;
/** How often the stat row re-reads the stock cache StockList writes (in-memory, no network). */
const STOCK_COUNTS_TICK_MS = 1_500;
type StockCounts = { total: number; active: number };
const EMPTY_STOCK_COUNTS: StockCounts = { total: 0, active: 0 };
function countStock(products: StockProduct[] | null | undefined): StockCounts {
  if (!products) return EMPTY_STOCK_COUNTS;
  return { total: products.length, active: products.filter((p) => p.is_active !== false).length };
}

const TILES = [
  { key: "orders", label: "Orders", desc: "View & manage", icon: "receipt-outline", route: "/(tabs)/previous-orders" },
  { key: "payouts", label: "Payouts", desc: "Earnings & history", icon: "wallet-outline", route: "/(tabs)/payments" },
  { key: "inventory", label: "Inventory", desc: "Add products", icon: "cube-outline", route: "/(tabs)/stock" },
  { key: "settings", label: "Settings", desc: "Store config", icon: "settings-outline", route: "/settings" },
] as const;

type ConfirmSpec = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  icon: IoniconName;
  fallbackErrorMessage: string;
  onConfirm: () => Promise<void>;
};

export default function HomeTab() {
  const isFocused = useIsFocused();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { incomingCount } = useIncomingOrdersCount();
  const toast = useToast();

  // 450ms fade + slide entrance for the whole dashboard (pre-redesign look).
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Store resolution (session → selected_store_id → store cache → fetch) is
  // the shared hook's job. `stores` below is only the fresh-data override
  // layer written by commitStores (forced refetch / realtime / toggle) so the
  // card reflects a change before the hook's next focus re-read.
  const { session, store: pickedStore, storeId, loading: storeLoading, retry } = useSelectedStore();
  const [stores, setStores] = useState<StoreRow[]>([]);
  // Push registration + battery nudge run once per screen mount, not per retry.
  const bootedOnceRef = useRef(false);
  const [approvedBanner, setApprovedBanner] = useState(false);
  const approvedBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seed the bell badge from the cached notification list (warmed at splash)
  // so it doesn't flash 0 while the first count fetch is in flight.
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    () => peekNotifications()?.filter((n) => !n.is_read).length ?? 0
  );

  // Timestamp of the most recent local store mutation (go online/offline).
  // A store fetch that was already in flight when the toggle landed carries
  // pre-mutation is_active — committing it would visibly flip the status card
  // back for up to a poll cycle. Same pattern as previous-orders.tsx.
  const storesMutationRef = useRef(0);
  const commitStores = useCallback((next: StoreRow[], requestStartedAt: number) => {
    if (storesMutationRef.current > requestStartedAt) return;
    setStores((prev) => (sameData(prev, next) ? prev : next));
  }, []);

  const stockRef = useRef<StockListHandle>(null);

  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const selectedStore = (storeId ? stores.find((s) => s.id === storeId) : undefined) ?? pickedStore ?? stores[0] ?? null;
  const isStoreOnline = !!selectedStore?.is_active;
  // Cold start with no store cache and a failed / empty stores fetch -> the
  // dashboard has nothing to show. Surfaced as an ErrorState with Try again
  // instead of an empty screen with a skeleton that never resolves.
  const storeError = !storeLoading && !selectedStore;

  // Was hardcoded to 0 — the dashboard always showed "Waiting for orders..."
  // even with real orders in progress. "Active" here means accepted-but-not-yet-
  // handed-off allocations, matching previous-orders.tsx's own activeAllocations
  // filter (alloc_status === "accepted"); pending_acceptance ones are "incoming",
  // surfaced separately, not counted as already-active here.
  const [activeOrderCount, setActiveOrderCount] = useState(0);

  // One-time per mount, once a session is known.
  useEffect(() => {
    if (!session?.token || bootedOnceRef.current) return;
    bootedOnceRef.current = true;
    // Push registration on every app-session start (login already implies
    // it). Fire-and-forget: never blocks or fails the screen — no permission,
    // Expo Go, etc. are all handled internally and are non-fatal.
    notificationService.initialize().catch(() => {});
    // First login on this install with alert settings missing: walk the
    // shopkeeper through them once. The Home card below keeps nagging after.
    shouldAutoOpenAlertSetup()
      .then((open) => {
        if (open) router.push("/alert-setup");
      })
      .catch(() => {});
  }, [session?.token]);

  // Live status of the phone settings order alerts depend on (lib/alertSetup).
  const alertSetup = useAlertSetup();

  // "Store online — listening for orders" foreground service follows the
  // store's online state (lib/orderListenerService). Logout stops it via
  // notificationService.unregister().
  useEffect(() => {
    if (!selectedStore) return;
    if (isStoreOnline) startOrderListener(selectedStore.name).catch(() => {});
    else stopOrderListener().catch(() => {});
  }, [isStoreOnline, selectedStore?.id, selectedStore?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warm start: the hook painted from the store cache, which can hold a stale
  // name / address for up to 10 minutes — genuinely refetch once in the
  // background (forceFetchStores, not fetchStoresCached, which would hand the
  // same warm array back). A cold start already came from the network.
  const warmStartRef = useRef(peekStores() != null);
  useEffect(() => {
    if (storeLoading || !session?.token || !warmStartRef.current) return;
    warmStartRef.current = false;
    let cancelled = false;
    const startedAt = Date.now();
    forceFetchStores(session.token, session.user?.id)
      .then((fresh) => {
        if (!cancelled && fresh.length > 0) commitStores(fresh, startedAt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeLoading, session?.token, session?.user?.id, commitStores]);

  // (The "remember the default store" step that used to live here is now in
  // lib/useSelectedStore, next to the selection rule it belongs with.)

  // Approved banner: show for APPROVED_BANNER_MS, then auto-dismiss.
  const showApprovedBanner = useCallback(() => {
    setApprovedBanner(true);
    if (approvedBannerTimerRef.current) clearTimeout(approvedBannerTimerRef.current);
    approvedBannerTimerRef.current = setTimeout(() => {
      approvedBannerTimerRef.current = null;
      setApprovedBanner(false);
    }, APPROVED_BANNER_MS);
  }, []);
  const dismissApprovedBanner = useCallback(() => {
    if (approvedBannerTimerRef.current) {
      clearTimeout(approvedBannerTimerRef.current);
      approvedBannerTimerRef.current = null;
    }
    setApprovedBanner(false);
  }, []);
  useEffect(() => {
    return () => {
      if (approvedBannerTimerRef.current) clearTimeout(approvedBannerTimerRef.current);
    };
  }, []);

  // Poll every 30s in BOTH directions so an admin revoking an already-approved
  // store while the shopkeeper sits on this screen is detected. This is a
  // robustness fallback independent of the stores-table realtime
  // subscription below; the actual redirect decision lives in the single
  // watcher effect further down so it fires no matter which of these two
  // mechanisms is the one that actually notices the change.
  // Routed through refreshStoreApproval so it shares one request (and a short
  // reuse window) with the approval gates instead of adding another
  // independent GET /store-owner/stores every 30s.
  const checkApproval = useCallback(async () => {
    if (!session?.token || !selectedStore?.id) return;
    const wasApproved = isStoreApproved(selectedStore);
    const startedAt = Date.now();
    try {
      await refreshStoreApproval(session.token, session.user?.id);
      const fresh = peekStores();
      if (!fresh?.length) return;
      const updated = fresh.find((s) => s.id === selectedStore?.id);
      commitStores(fresh, startedAt);
      if (updated && !wasApproved && isStoreApproved(updated)) {
        showApprovedBanner();
      }
    } catch (error) {
      if (__DEV__) console.warn("[home] Approval poll failed", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, selectedStore?.id, selectedStore?.is_approved, commitStores, showApprovedBanner]);

  useSmartPoll(checkApproval, {
    intervalMs: 30_000,
    enabled: !!(session?.token && selectedStore?.id) && isFocused,
  });

  // The mount effect and useFocusEffect below both fire when deps resolve, so
  // without this the same request went out 2-3 times back to back.
  const lastCountFetchRef = useRef(0);
  const fetchActiveOrderCount = useCallback(async () => {
    if (!session?.token || !selectedStore?.id) return;
    lastCountFetchRef.current = Date.now();
    try {
      const res = await apiClient.get<{ orders?: { store_id?: string; alloc_status?: string }[] }>(
        "/shopkeeper/orders?active=true",
        { Authorization: `Bearer ${session.token}` }
      );
      if (!res.success) return;
      const orders: { store_id?: string; alloc_status?: string }[] = res.data?.orders ?? [];
      const count = orders.filter((o) => o.store_id === selectedStore.id && o.alloc_status === "accepted").length;
      setActiveOrderCount(count);
    } catch {
      // Non-fatal — dashboard stays on its last known count rather than flashing 0.
    }
  }, [session?.token, selectedStore?.id]);

  useEffect(() => {
    fetchActiveOrderCount();
  }, [fetchActiveOrderCount]);
  // Push / realtime nudge — refresh the dashboard count immediately.
  useEffect(() => onOrdersChanged(fetchActiveOrderCount), [fetchActiveOrderCount]);

  useSmartPoll(fetchActiveOrderCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!(session?.token && selectedStore?.id) && isFocused,
  });

  useFocusEffect(
    React.useCallback(() => {
      if (Date.now() - lastCountFetchRef.current < 3_000) return;
      fetchActiveOrderCount();
    }, [fetchActiveOrderCount])
  );

  // Today stat card (delivered · order value -> Payouts); see components/home/TodayCard.
  const { stats: todayStats, refresh: fetchTodayStats } = useTodayStats(selectedStore?.id, session?.token);

  const fetchUnreadNotificationCount = useCallback(async () => {
    if (!session?.token) return;
    const requestStartedAt = Date.now();
    try {
      const res = await apiClient.get<Parameters<typeof persistNotifications>[0]>(
        "/store-owner/notifications",
        { Authorization: `Bearer ${session.token}` }
      );
      // apiClient signals failure via success:false with no data — a failed
      // tick must neither zero the badge nor overwrite the shared cache with
      // an empty list.
      if (!res.success || !Array.isArray(res.data)) return;
      const notifications = res.data;
      // The inbox may have optimistically marked rows read while this request
      // was in flight — its pre-mutation payload must not clobber that.
      if (lastNotificationsReadMutationTs() > requestStartedAt) return;
      setUnreadNotificationCount(notifications.filter((n) => !n.is_read).length);
      // This poll already paid for the full list — persist it so the inbox
      // screen opens instantly with current data instead of refetching the
      // identical payload behind a spinner.
      persistNotifications(notifications);
    } catch {
      // Non-fatal — bell keeps its last known count.
    }
  }, [session?.token]);

  useSmartPoll(fetchUnreadNotificationCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!session?.token && isFocused,
  });

  useFocusEffect(
    React.useCallback(() => {
      // Instant badge update from the shared cache (e.g. returning from the
      // inbox after marking things read), then a background refresh.
      const cached = peekNotifications();
      if (cached) setUnreadNotificationCount(cached.filter((n) => !n.is_read).length);
      fetchUnreadNotificationCount();
    }, [fetchUnreadNotificationCount])
  );

  // Single source of truth for "should we be here at all" — reacts to
  // is_approved flipping to false regardless of what caused the refresh
  // (this poll, the stores realtime subscription, a manual action's own
  // refetch, etc.), instead of duplicating a redirect check into every
  // individual place that can update `stores`.
  useEffect(() => {
    if (storeLoading || !selectedStore) return;
    if (!isStoreApproved(selectedStore)) {
      router.replace("/pending-verification");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.is_approved, selectedStore?.id, storeLoading]);

  useEffect(() => {
    if (!selectedStore?.id || !session?.token || !supabase) return;
    const token = session.token;
    const userId = session.user?.id;
    // Stable channel name (no Date.now() suffix) so switching stores doesn't
    // churn out a brand-new, never-reused channel identity on every switch —
    // cleanup below already unsubscribes the old one before this re-fires.
    const channel = supabase
      .channel(`store-${selectedStore.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stores", filter: `id=eq.${selectedStore.id}` }, () => {
        // The row genuinely changed, so bypass the warm cache — but do NOT
        // clearStoreCache() first. Clearing nulls the last-known-good copy that
        // forceFetchStores/refreshStoreApproval fall back to when the follow-up
        // GET fails, so a flaky connection at this moment would leave every
        // tab with no store id (empty "No orders yet" states shown as truth),
        // and let an older in-flight pre-toggle GET win the generation guard
        // and flip the status card back. forceFetchStores already skips the
        // cache and handles its own generation/mutation checks.
        const startedAt = Date.now();
        forceFetchStores(token, userId)
          .then((fresh) => {
            if (fresh.length > 0) commitStores(fresh, startedAt);
          })
          .catch(() => {});
      })
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.id, session?.token]);

  // Products / Active stat cards. The compact StockList owns the product
  // fetch + poll + realtime and writes every result to the shared persistCache
  // entry; reading that entry here (in-memory, no network) keeps the stat row
  // in step without a second fetcher. Re-read on a cheap tick while focused
  // and right after the refresh flows below.
  const [stockCounts, setStockCounts] = useState<StockCounts>(() =>
    countStock(selectedStore?.id ? peekCache<StockProduct[]>(productsCacheKey(selectedStore.id)) : null)
  );
  const readStockCounts = useCallback(() => {
    if (!selectedStore?.id) return;
    const next = countStock(peekCache<StockProduct[]>(productsCacheKey(selectedStore.id)));
    setStockCounts((prev) => (sameData(prev, next) ? prev : next));
  }, [selectedStore?.id]);
  useEffect(() => {
    if (!selectedStore?.id) return;
    const key = productsCacheKey(selectedStore.id);
    let cancelled = false;
    if (peekCache<StockProduct[]>(key)) readStockCounts();
    else
      hydrateCache<StockProduct[]>(key)
        .then(() => {
          if (!cancelled) readStockCounts();
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedStore?.id, readStockCounts]);
  useEffect(() => {
    if (!isFocused || !selectedStore?.id) return;
    readStockCounts();
    const id = setInterval(readStockCounts, STOCK_COUNTS_TICK_MS);
    return () => clearInterval(id);
  }, [isFocused, selectedStore?.id, readStockCounts]);

  // Pull-to-refresh for the dashboard: force a store refetch (status, name)
  // and a background product refresh. Both already carry their own
  // generation/mutation guards, so this can't clobber a toggle in flight.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!session?.token) return;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      await Promise.all([
        forceFetchStores(session.token, session.user?.id).then((fresh) => {
          if (fresh.length > 0) commitStores(fresh, startedAt);
        }),
        stockRef.current?.refresh(true).catch(() => {}),
        fetchActiveOrderCount(),
        fetchTodayStats(true),
      ]);
      readStockCounts();
    } finally {
      setRefreshing(false);
    }
  }, [session?.token, session?.user?.id, commitStores, fetchActiveOrderCount, fetchTodayStats, readStockCounts]);

  const toggleOnline = (value: boolean) => {
    if (!session || !selectedStore) return;
    if (!isStoreApproved(selectedStore)) return;
    if (selectedStore.is_active === value) return;
    const target = selectedStore;
    // After the server confirms the PATCH: patch the shared cache in place
    // (persisted; bumps the cache generation so any in-flight pre-toggle
    // fetch can't overwrite it), stamp the local mutation time so this
    // screen's own pollers drop pre-toggle responses, update the UI
    // immediately, then reconcile with one forced refetch. Clearing the cache
    // and refetching instead would leave a window where a concurrent poll
    // re-persists pre-toggle data as fresh and visibly flips the card back.
    const applyToggle = async (isActive: boolean) => {
      const response = await apiClient.patch(
        `/store-owner/stores/${target.id}/online`,
        { is_active: isActive },
        { Authorization: `Bearer ${session.token}` }
      );
      if (!response.success) throw new Error(response.error || `Failed to go ${isActive ? "online" : "offline"}`);
      patchStoreActive(target.id, isActive);
      storesMutationRef.current = Date.now();
      // Seed the override layer from the hook's pick if no fresh fetch has
      // landed yet, so the card flips immediately either way.
      setStores((prev) => (prev.length > 0 ? prev : [target]).map((s) => (s.id === target.id ? { ...s, is_active: isActive } : s)));
      const startedAt = Date.now();
      await Promise.all([
        forceFetchStores(session.token, session.user?.id).then((fresh) => {
          if (fresh.length > 0) commitStores(fresh, startedAt);
        }),
        stockRef.current?.refresh(true).catch(() => {}),
      ]);
      readStockCounts();
      toast.show({ message: isActive ? "Your store is online" : "Your store is offline", tone: "success" });
    };
    if (value) {
      setConfirm({
        title: "Go online?",
        message: "Your store will become visible to customers.",
        confirmLabel: "Go online",
        destructive: false,
        icon: "storefront-outline",
        fallbackErrorMessage: "Couldn't take your store online. Please try again.",
        onConfirm: async () => {
          await restoreActiveProductsOnline(target.id);
          await applyToggle(true);
        },
      });
    } else {
      setConfirm({
        title: "Go offline?",
        message: "Your store will be hidden from customers.",
        confirmLabel: "Go offline",
        destructive: true,
        icon: "power-outline",
        fallbackErrorMessage: "Couldn't take your store offline. Please try again.",
        onConfirm: async () => {
          await setAllProductsOffline(target.id);
          await applyToggle(false);
        },
      });
    }
    setConfirmVisible(true);
  };

  // The Button's own light haptic covers the tap; ConfirmSheet's confirm
  // button carries the success haptic.
  const handleStatusToggle = (value: boolean) => toggleOnline(value);

  const ownerName = session?.user?.name || "Shopkeeper";
  const firstName = ownerName.split(" ")[0];
  const approved = selectedStore ? isStoreApproved(selectedStore) : false;
  const tileWidth = (contentWidth - TILE_GAP) / 2;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom, paddingTop: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={[styles.column, { paddingHorizontal: gutter }]}>
          <Animated.View style={[{ width: contentWidth }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* ── Header ────────────────────────────────────────────── */}
            <View style={styles.header}>
              {/* flex:1 + numberOfLines so a long store name can't push the
                  buttons off the right edge of the screen. */}
              <View style={styles.headerText}>
                <Text style={styles.greeting} numberOfLines={1}>
                  Hello, {firstName}
                </Text>
                {/* Tappable: switch between stores, or add one. */}
                <StoreSwitcher variant="header" />
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => router.push("/notification-inbox")}
                  style={styles.circleBtn}
                  accessibilityRole="button"
                  accessibilityLabel={unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} unread` : "Notifications"}
                >
                  <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
                  {unreadNotificationCount > 0 && (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push("/settings")} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Settings">
                  <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push("/profile")} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Profile">
                  <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {storeLoading ? (
              <View style={styles.sections}>
                <Skeleton.Card lines={3} />
                <Skeleton.Card lines={1} />
                <Skeleton.Card lines={1} />
              </View>
            ) : storeError || !selectedStore ? (
              <ErrorState
                icon="cloud-offline-outline"
                title="Couldn't load your store"
                message="Check your connection and try again."
                action={{ onPress: retry }}
              />
            ) : (
              <>
                {/* ── Approval success banner ───────────────────────────── */}
                {approvedBanner ? <ApprovedBanner onDismiss={dismissApprovedBanner} /> : null}

                {/* ── Store Status ──────────────────────────────────────── */}
                <View style={styles.block}>
                  <StoreStatusCard
                    store={selectedStore}
                    isOnline={isStoreOnline}
                    activeOrderCount={activeOrderCount}
                    onToggle={handleStatusToggle}
                    pendingApproval={!approved}
                  />
                </View>

                {/* ── Alert setup warning ───────────────────────────────── */}
                {!alertSetup.complete ? (
                  <HomeCard
                    title="Order alerts need setup"
                    style={styles.block}
                    footer={
                      <HomePrimaryButton
                        label="Fix now"
                        onPress={() => router.push("/alert-setup")}
                        accessibilityHint="Opens the order alert setup checklist"
                      />
                    }
                  >
                    <Text style={styles.body}>
                      {alertSetup.missingCount} phone setting{alertSetup.missingCount === 1 ? "" : "s"} can stop new orders from
                      ringing when the phone is locked.
                    </Text>
                  </HomeCard>
                ) : null}

                {/* ── Incoming orders ───────────────────────────────────── */}
                {incomingCount > 0 ? (
                  <HomeCard
                    title={`Incoming orders · ${incomingCount}`}
                    style={styles.block}
                    footer={
                      <HomePrimaryButton
                        label="Review orders"
                        onPress={() => router.push("/(tabs)/previous-orders")}
                        accessibilityHint="Opens the Orders tab"
                      />
                    }
                  >
                    <Text style={styles.body}>Accept or reject {incomingCount === 1 ? "it" : "them"} before the customer moves on.</Text>
                  </HomeCard>
                ) : null}

                {/* ── Quick Stats Row ───────────────────────────────────── */}
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{stockCounts.total}</Text>
                    <Text style={styles.statLabel}>Products</Text>
                  </View>
                  <View style={[styles.statCard, { borderColor: colors.success + "30" }]}>
                    <Text style={[styles.statValue, { color: colors.success }]}>{stockCounts.active}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                  </View>
                  <View style={[styles.statCard, { borderColor: colors.primary + "30" }]}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{isStoreOnline ? "ON" : "OFF"}</Text>
                    <Text style={styles.statLabel}>Status</Text>
                  </View>
                </View>

                {/* ── Today ─────────────────────────────────────────────── */}
                <View style={styles.block}>
                  <TodayCard stats={todayStats} />
                </View>

                {/* ── Quick Actions (Tiles) ─────────────────────────────── */}
                <Text style={styles.sectionLabel}>Quick Actions</Text>
                <View style={styles.tilesGrid}>
                  {TILES.map((tile) => (
                    <TouchableOpacity
                      key={tile.key}
                      style={[styles.tile, { width: tileWidth }]}
                      onPress={() => router.push(tile.route)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={tile.label}
                      accessibilityHint={tile.desc}
                    >
                      <View style={styles.tileTop}>
                        <View style={styles.tileIcon}>
                          <Ionicons name={tile.icon} size={20} color={colors.textSecondary} />
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                      </View>
                      <Text style={styles.tileLabel}>{tile.label}</Text>
                      <Text style={styles.tileDesc}>{tile.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Your Stock (compact summary; visuals owned by components/stock) ── */}
                <StockList
                  ref={stockRef}
                  variant="compact"
                  storeId={selectedStore.id}
                  token={session?.token}
                  storeActive={isStoreOnline}
                  enabled={isFocused}
                />
              </>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={confirmVisible && !!confirm}
        onClose={() => setConfirmVisible(false)}
        title={confirm?.title ?? ""}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel ?? "Confirm"}
        destructive={confirm?.destructive ?? false}
        tone={confirm?.destructive ? "error" : "success"}
        icon={confirm?.icon}
        onConfirm={confirm?.onConfirm ?? (async () => {})}
        fallbackErrorMessage={confirm?.fallbackErrorMessage}
      />
    </Screen>
  );
}

/** Pre-redesign green "approved" banner: fades/slides in; the X dismisses it early (it also auto-hides). */
function ApprovedBanner({ onDismiss }: { onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[styles.approvedBanner, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}
    >
      <Ionicons name="checkmark-circle" size={16} color={APPROVED_TEXT} />
      <Text style={styles.approvedBannerText}>Your store has been approved! You can now go online.</Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={APPROVED_TEXT} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Literal greens kept for fidelity with the pre-redesign banner.
const APPROVED_TEXT = "#065F46";
const APPROVED_BG = "#D1FAE5";
const APPROVED_BORDER = "#6EE7B7";

const styles = StyleSheet.create({
  column: { alignItems: "center" },
  sections: { gap: spacing.xl },
  block: { marginBottom: spacing.lg },
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },

  // Approved banner
  approvedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: APPROVED_BG,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: APPROVED_BORDER,
  },
  approvedBannerText: { color: APPROVED_TEXT, fontSize: 13, fontWeight: "600", flex: 1 },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl },
  headerText: { flex: 1, marginRight: spacing.sm },
  greeting: { fontSize: 14, color: colors.textSecondary },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.primary + "25",
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.primary },
  bellBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: { fontSize: 9, fontWeight: "700", color: colors.onPrimary },

  // Stats
  statsRow: { flexDirection: "row", gap: TILE_GAP, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 11, fontWeight: "500", color: colors.textTertiary, marginTop: 2 },

  // Section label
  sectionLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.md },

  // Tiles
  tilesGrid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, marginBottom: spacing.lg },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  tileIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  tileDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
});
