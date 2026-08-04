import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Modal,
  Alert,
  Animated,
  TextInput,
  Easing,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import {
  getStockListFromDb,
  updateProductActiveState,
  setAllProductsOffline,
  restoreActiveProductsOnline,
} from "../../lib/storeProducts";
import { StoreStatusCard } from "../../components/StoreStatusCard";
import {
  fetchStoresCached,
  forceFetchStores,
  peekStores,
  patchStoreActive,
  clearStoreCache,
  type CachedStore,
} from "../../lib/appCache";
import { isStoreApproved } from "../../lib/storeApproval";
import { notificationService } from "../../lib/notifications";
import { useSmartPoll } from "../../lib/useSmartPoll";
import { apiClient } from "../../lib/api-client";

const SELECTED_STORE_KEY = "selected_store_id";
const INVENTORY_PERSISTED_KEY = "inventory_persisted_state";
const INVENTORY_CACHE_KEY = "inventory_products_cache";
const CACHE_KEYS = [INVENTORY_PERSISTED_KEY, INVENTORY_CACHE_KEY];
const TILE_GAP = 10;
const TILE_WIDTH = (Dimensions.get("window").width - spacing.lg * 2 - TILE_GAP) / 2;
// Width of one "Your Stock" swipeable page — screen width minus the outer
// scroll's own padding (s.scroll) and the stock card's own padding (s.stockCard),
// both spacing.lg on each side.
const STOCK_PAGE_WIDTH = Dimensions.get("window").width - spacing.lg * 4;

type StoreRow = CachedStore;

type StockProduct = { id: string; name: string; unit?: string; storeProductId?: string; is_active?: boolean; quantity?: number; is_loose?: boolean };

/** One of the two "Your Stock" boxes — packaged/branded products, or loose products. */
function StockSection({
  products,
  togglingProductId,
  storeActive,
  onToggle,
  onDeleteOne,
  onDeleteAll,
  emptyText,
}: {
  products: StockProduct[];
  togglingProductId: string | null;
  storeActive: boolean;
  onToggle: (p: StockProduct) => void;
  onDeleteOne: (p: StockProduct) => void;
  onDeleteAll: () => void;
  emptyText: string;
}) {
  return (
    <View style={s.stockSection}>
      {products.length > 0 && (
        <View style={s.stockSectionHeader}>
          <TouchableOpacity onPress={onDeleteAll} style={s.stockSectionDeleteAllBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={13} color={colors.error} />
            <Text style={s.stockSectionDeleteAllText}>Delete all</Text>
          </TouchableOpacity>
        </View>
      )}
      {products.length === 0 ? (
        <Text style={s.stockSectionEmptyText}>{emptyText}</Text>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item: p }) => {
            const isActive = p.is_active !== false;
            return (
              <View style={s.productRow}>
                <View style={[s.productDot, { backgroundColor: isActive ? colors.success : colors.border }]} />
                <Text style={s.productName} numberOfLines={1}>{p.name}</Text>
                {p.unit ? <Text style={s.productUnit}>{p.unit}</Text> : null}
                <TouchableOpacity
                  style={[s.toggleBtn, isActive ? s.toggleBtnOn : s.toggleBtnOff]}
                  onPress={() => onToggle(p)}
                  disabled={togglingProductId === p.id || !storeActive}
                  activeOpacity={0.75}
                >
                  {togglingProductId === p.id ? (
                    <ActivityIndicator size="small" color={isActive ? "#fff" : colors.textTertiary} />
                  ) : (
                    <Text style={isActive ? s.toggleTextOn : s.toggleTextOff}>{isActive ? "Active" : "Off"}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDeleteOne(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={15} color={colors.error + "80"} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

/* ─── Quick-action tile data ─────────────────────────────────────────────── */
const TILES = [
  { key: "orders", label: "Orders", desc: "View & manage", icon: "receipt-outline" as const, route: "/(tabs)/previous-orders" },
  { key: "payouts", label: "Payouts", desc: "Earnings & history", icon: "wallet-outline" as const, route: "/(tabs)/payments" },
  { key: "inventory", label: "Inventory", desc: "Add products", icon: "cube-outline" as const, route: "/(tabs)/stock" },
  { key: "settings", label: "Settings", desc: "Store config", icon: "settings-outline" as const, route: "/settings" },
] as const;

export default function HomeTab() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  const [session, setSession] = useState<any | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvedBanner, setApprovedBanner] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const approvedBannerAnim = useRef(new Animated.Value(0)).current;
  const approvalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [storeProducts, setStoreProducts] = useState<
    Array<{ id: string; name: string; unit?: string; storeProductId?: string; is_active?: boolean; quantity?: number; is_loose?: boolean }>
  >([]);
  const [storeProductsLoading, setStoreProductsLoading] = useState(true);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [stockSearchOpen, setStockSearchOpen] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Your Stock" tab bar (Packaged/Loose) — swipeable pager plus tap-to-jump
  // buttons, matching the segmented-control pattern already used for
  // Inventory/Add Custom in app/(tabs)/stock.tsx. Each page's natural height
  // is measured via onLayout (lines below) since a horizontal ScrollView
  // nested inside this screen's outer vertical ScrollView has no way to
  // auto-size to variable-height content otherwise.
  const [activeStockTab, setActiveStockTab] = useState<"packaged" | "loose">("packaged");
  const stockPagerRef = useRef<ScrollView>(null);
  const [stockPageHeights, setStockPageHeights] = useState({ packaged: 0, loose: 0 });

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText: string;
    confirmColor: string;
    iconName: React.ComponentProps<typeof Ionicons>["name"];
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const handleStockSearchChange = useCallback((text: string) => {
    setStockSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearchQuery(text), 200);
  }, []);

  // Clears both the input text and the debounced value that actually drives
  // filteredStoreProducts, and cancels any pending debounce timer — closing
  // the search bar with only setStockSearchQuery("") left debouncedSearchQuery
  // holding the last-typed text, so "Your Stock" stayed invisibly filtered
  // with no search box visible to explain why.
  const closeStockSearch = useCallback(() => {
    if (searchDebounceRef.current) { clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null; }
    setStockSearchQuery("");
    setDebouncedSearchQuery("");
    setStockSearchOpen(false);
  }, []);

  const selectStockTab = useCallback((tab: "packaged" | "loose") => {
    setActiveStockTab(tab);
    stockPagerRef.current?.scrollTo({ x: tab === "packaged" ? 0 : STOCK_PAGE_WIDTH, animated: true });
  }, []);

  const handleStockPagerScrollEnd = useCallback((e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / STOCK_PAGE_WIDTH);
    setActiveStockTab(page === 0 ? "packaged" : "loose");
  }, []);

  const selectedStore = (selectedStoreId ? stores.find(s => s.id === selectedStoreId) : undefined) ?? stores[0] ?? null;
  const isStoreOnline = !!selectedStore?.is_active;

  const filteredStoreProducts = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return storeProducts;
    return storeProducts.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [storeProducts, debouncedSearchQuery]);

  const activeProductCount = useMemo(() => storeProducts.filter((p) => p.is_active !== false).length, [storeProducts]);

  const packagedProducts = useMemo(() => filteredStoreProducts.filter((p) => !p.is_loose), [filteredStoreProducts]);
  const looseProducts = useMemo(() => filteredStoreProducts.filter((p) => p.is_loose), [filteredStoreProducts]);
  const searchActive = debouncedSearchQuery.trim().length > 0;
  const packagedEmptyText = searchActive ? `No packaged products match "${stockSearchQuery.trim()}"` : "No packaged products yet";
  const looseEmptyText = searchActive ? `No loose products match "${stockSearchQuery.trim()}"` : "No loose products added yet";
  // Was hardcoded to 0 — the dashboard always showed "Waiting for orders..."
  // even with real orders in progress. "Active" here means accepted-but-not-yet-
  // handed-off allocations, matching previous-orders.tsx's own activeAllocations
  // filter (alloc_status === "accepted"); pending_acceptance ones are "incoming",
  // surfaced separately, not counted as already-active here.
  const [activeOrderCount, setActiveOrderCount] = useState(0);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isStoreOnline) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isStoreOnline, pulseAnim]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) { if (!cancelled) router.replace("/landing"); return; }
        if (cancelled) return;
        setSession(s);
        // Push notifications were never actually turned on for anyone — the only
        // way a token got registered was a shopkeeper manually finding
        // Settings → Notifications → Enable. Register on every app-session start
        // instead, matching what login already implies. Fire-and-forget: this
        // must never block or fail the screen (no permission, Expo Go, etc. are
        // all handled internally and are non-fatal).
        notificationService.initialize().catch(() => {});
        const cached = peekStores();
        if (cached && cached.length > 0) {
          setStores(cached);
          if (!isStoreApproved(cached[0])) {
            if (!cancelled) router.replace("/pending-verification");
            return;
          }
          setLoading(false);
          // Genuinely refetch here, not fetchStoresCached — that would just
          // return the same cached array back while it's still warm (up to
          // 10 minutes), so a stale/wrong store name or address shown from
          // cache would never actually get corrected in the background.
          forceFetchStores(s.token, s.user?.id).then((fresh) => {
            if (!cancelled && fresh.length > 0) {
              if (!isStoreApproved(fresh[0])) {
                router.replace("/pending-verification");
                return;
              }
              setStores(fresh);
            }
          });
          return;
        }
        const currentStores = await fetchStoresCached(s.token, s.user?.id);
        if (cancelled) return;
        if (currentStores.length > 0) {
          setStores(currentStores);
          if (!isStoreApproved(currentStores[0])) {
            if (!cancelled) router.replace("/pending-verification");
            return;
          }
          if (!currentStores[0].is_active) await invalidateAllCaches();
        }
      } catch (error) { if (__DEV__) console.warn("[home] Bootstrap failed", error); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll every 30s in BOTH directions — was pending-only (stopped entirely
  // once approved), so an admin revoking an already-approved store while the
  // shopkeeper sat on this screen was never detected at all. This is a
  // robustness fallback independent of the stores-table realtime
  // subscription below; the actual redirect decision lives in the single
  // watcher effect further down so it fires no matter which of these two
  // mechanisms is the one that actually notices the change.
  useEffect(() => {
    if (!session?.token || !selectedStore?.id) {
      if (approvalPollRef.current) { clearInterval(approvalPollRef.current); approvalPollRef.current = null; }
      return;
    }
    const wasApproved = isStoreApproved(selectedStore);
    const checkApproval = async () => {
      try {
        const res = await apiClient.get<{ stores?: StoreRow[] }>("/store-owner/stores", { Authorization: `Bearer ${session.token}` });
        if (!res.success) return;
        const fresh: StoreRow[] = res.data?.stores ?? [];
        if (!fresh.length) return;
        const updated = fresh.find(s => s.id === selectedStore?.id);
        setStores(fresh);
        if (updated && !wasApproved && isStoreApproved(updated)) {
          setApprovedBanner(true);
          Animated.sequence([
            Animated.timing(approvedBannerAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.delay(4000),
            Animated.timing(approvedBannerAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
          ]).start(() => setApprovedBanner(false));
        }
      } catch (error) {
        if (__DEV__) console.warn('[home] Approval poll failed', error);
      }
    };
    approvalPollRef.current = setInterval(checkApproval, 30_000);
    return () => { if (approvalPollRef.current) { clearInterval(approvalPollRef.current); approvalPollRef.current = null; } };
  }, [selectedStore?.is_approved, selectedStore?.id, session?.token]);

  const fetchActiveOrderCount = useCallback(async () => {
    if (!session?.token || !selectedStore?.id) return;
    try {
      const res = await apiClient.get<{ orders?: Array<{ store_id?: string; alloc_status?: string }> }>(
        "/shopkeeper/orders?active=true",
        { Authorization: `Bearer ${session.token}` }
      );
      if (!res.success) return;
      const orders: Array<{ store_id?: string; alloc_status?: string }> = res.data?.orders ?? [];
      const count = orders.filter((o) => o.store_id === selectedStore.id && o.alloc_status === "accepted").length;
      setActiveOrderCount(count);
    } catch {
      // Non-fatal — dashboard stays on its last known count rather than flashing 0.
    }
  }, [session?.token, selectedStore?.id]);

  useEffect(() => { fetchActiveOrderCount(); }, [fetchActiveOrderCount]);

  useSmartPoll(fetchActiveOrderCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!(session?.token && selectedStore?.id),
  });

  useFocusEffect(
    React.useCallback(() => {
      fetchActiveOrderCount();
    }, [fetchActiveOrderCount])
  );

  const fetchUnreadNotificationCount = useCallback(async () => {
    if (!session?.token) return;
    try {
      const res = await apiClient.get<Array<{ is_read: boolean }>>(
        "/store-owner/notifications",
        { Authorization: `Bearer ${session.token}` }
      );
      const notifications = Array.isArray(res.data) ? res.data : [];
      setUnreadNotificationCount(notifications.filter((n) => !n.is_read).length);
    } catch {
      // Non-fatal — bell keeps its last known count.
    }
  }, [session?.token]);

  useSmartPoll(fetchUnreadNotificationCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!session?.token,
  });

  useFocusEffect(
    React.useCallback(() => {
      fetchUnreadNotificationCount();
    }, [fetchUnreadNotificationCount])
  );

  // Single source of truth for "should we be here at all" — reacts to
  // is_approved flipping to false regardless of what caused the refresh
  // (this poll, the stores realtime subscription, a manual action's own
  // refetch, etc.), instead of duplicating a redirect check into every
  // individual place that can update `stores`.
  useEffect(() => {
    if (loading || !selectedStore) return;
    if (!isStoreApproved(selectedStore)) {
      router.replace("/pending-verification");
    }
  }, [selectedStore?.is_approved, selectedStore?.id, loading]);

  // Resolve & persist the selected store whenever the store list changes.
  useEffect(() => {
    if (stores.length === 0) return;
    AsyncStorage.getItem(SELECTED_STORE_KEY).then((id) => {
      const picked = (id && stores.find(s => s.id === id)) || stores[0];
      if (picked) {
        setSelectedStoreId(picked.id);
        if (!id) AsyncStorage.setItem(SELECTED_STORE_KEY, picked.id).catch(() => {});
      }
    }).catch(() => {
      if (stores[0]) setSelectedStoreId(stores[0].id);
    });
  }, [stores]);

  const invalidateAllCaches = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
    } catch (error) {
      if (__DEV__) console.warn('[home] Cache invalidation failed', error);
    }
  }, []);

  useEffect(() => {
    if (!session?.token || !selectedStore?.id) return;
    fetchStoreProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, selectedStore?.id]);

  const fetchStoreProductsRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!selectedStore?.id || !supabase) return;
    // Stable channel name (no Date.now() suffix) so switching stores doesn't
    // churn out a brand-new, never-reused channel identity on every switch —
    // cleanup below already unsubscribes the old one before this re-fires.
    const channel = supabase.channel(`products-${selectedStore.id}`).on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${selectedStore.id}` }, () => { fetchStoreProductsRef.current?.(true); }).subscribe();
    return () => { supabase?.removeChannel(channel); };
  }, [selectedStore?.id]);

  useEffect(() => {
    if (!selectedStore?.id || !session?.token || !supabase) return;
    const token = session.token; const userId = session.user?.id;
    // Stable channel name — see the products-channel effect above for why.
    const channel = supabase.channel(`store-${selectedStore.id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "stores", filter: `id=eq.${selectedStore.id}` }, () => {
      // fetchStores() -> fetchStoresCached() is cache-first (up to a 10min
      // TTL) — without clearing it here, this event firing because the row
      // genuinely changed could still just hand back the stale cached data,
      // defeating the entire point of the realtime nudge.
      clearStoreCache();
      fetchStores(token, userId);
    }).subscribe();
    return () => { supabase?.removeChannel(channel); };
  }, [selectedStore?.id, session?.token]);

  const firstFocusRef = useRef(true);
  useFocusEffect(React.useCallback(() => {
    if (firstFocusRef.current) { firstFocusRef.current = false; return; }
    if (session?.token && selectedStore?.id) fetchStoreProducts(true);
  }, [session?.token, selectedStore?.id]));

  const fetchStoreProducts = useCallback(async (silent = false) => {
    if (!session?.token || !selectedStore?.id) return;
    if (!silent) setStoreProductsLoading(true);
    try {
      const fromDb = await getStockListFromDb(selectedStore.id);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        setStoreProducts(fromDb.map((item: any) => ({ id: item.id, name: (item.name || item.product_name || "").trim() || "Product", unit: item.unit || "", storeProductId: item.storeProductId, is_active: item.is_active !== false, is_loose: item.is_loose === true })));
        return;
      }
      setStoreProducts([]);
    } catch { setStoreProducts([]); }
    finally { if (!silent) setStoreProductsLoading(false); }
  }, [session?.token, selectedStore?.id]);
  useEffect(() => { fetchStoreProductsRef.current = fetchStoreProducts; }, [fetchStoreProducts]);

  const fetchStores = useCallback(async (token: string, userId?: string): Promise<StoreRow[]> => {
    try { const fetched = await fetchStoresCached(token, userId); if (fetched.length > 0) setStores(fetched); return fetched; } catch { return []; }
  }, []);

  const toggleOnline = (value: boolean) => {
    if (!session || !selectedStore) return;
    if (!isStoreApproved(selectedStore)) return;
    if (selectedStore.is_active === value) return;
    if (value) {
      setConfirmModal({ title: "Go Online?", message: "Your store will become visible to customers.", confirmText: "Go Online", confirmColor: colors.success, iconName: "storefront", onConfirm: async () => {
        const response = await apiClient.patch(`/store-owner/stores/${selectedStore.id}/online`, { is_active: true }, { Authorization: `Bearer ${session.token}` });
        if (!response.success) throw new Error(response.error || "Failed to go online");
        await restoreActiveProductsOnline(selectedStore.id); patchStoreActive(selectedStore.id, true); clearStoreCache();
        await fetchStores(session.token, session.user?.id); await fetchStoreProducts(true);
      }});
    } else {
      setConfirmModal({ title: "Go Offline?", message: "Your store will be hidden from customers.", confirmText: "Go Offline", confirmColor: colors.error, iconName: "power", onConfirm: async () => {
        setStoreProductsLoading(true);
        try {
          await setAllProductsOffline(selectedStore.id);
          const response = await apiClient.patch(`/store-owner/stores/${selectedStore.id}/online`, { is_active: false }, { Authorization: `Bearer ${session.token}` });
          if (!response.success) throw new Error(response.error || "Failed to go offline");
          patchStoreActive(selectedStore.id, false); clearStoreCache(); await invalidateAllCaches();
          await fetchStores(session.token, session.user?.id); fetchStoreProducts(true).catch(() => {});
        } finally { setStoreProductsLoading(false); }
      }});
    }
  };

  const handleStatusToggle = async (value: boolean) => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleOnline(value); };

  const toggleProductActive = useCallback(async (product: any) => {
    if (!product.storeProductId) return;
    const wasActive = product.is_active !== false; const nowActive = !wasActive;
    setTogglingProductId(product.id);
    setStoreProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: nowActive } : p));
    try {
      const success = await updateProductActiveState(product.storeProductId, nowActive, session?.token ?? null);
      if (!success) { setStoreProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: wasActive } : p)); }
      else { await AsyncStorage.multiRemove(CACHE_KEYS); fetchStoreProducts(true); }
    } catch { setStoreProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: wasActive } : p)); }
    finally { setTogglingProductId(null); }
  }, [session?.token, fetchStoreProducts]);

  const deleteProduct = useCallback(async (product: any) => {
    if (!product.storeProductId || !supabase) return;
    const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", product.storeProductId);
    if (error) { Alert.alert("Error", "Failed to remove product."); return; }
    setStoreProducts((prev) => prev.filter((p) => p.id !== product.id));
    await AsyncStorage.multiRemove(CACHE_KEYS);
  }, []);

  // A single stray tap on the small trash icon (right next to the
  // active/off toggle) used to soft-delete a live product with no way to
  // undo — every other destructive action in this file (going online/
  // offline) already confirms first, so this now matches that convention.
  const confirmDeleteProduct = useCallback((product: any) => {
    setConfirmModal({
      title: "Remove product?",
      message: `"${product.name}" will be removed from your store. This can't be undone from here.`,
      confirmText: "Remove",
      confirmColor: colors.error,
      iconName: "trash-outline",
      onConfirm: () => deleteProduct(product),
    });
  }, [deleteProduct]);

  const deleteAllInSection = useCallback(async (section: Array<{ id: string; storeProductId?: string }>) => {
    if (!supabase) return;
    const ids = section.map((p) => p.storeProductId).filter(Boolean) as string[];
    if (ids.length === 0) return;
    const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    if (error) { Alert.alert("Error", "Failed to remove products."); return; }
    const removedIds = new Set(section.map((p) => p.id));
    setStoreProducts((prev) => prev.filter((p) => !removedIds.has(p.id)));
    await AsyncStorage.multiRemove(CACHE_KEYS);
  }, []);

  const confirmDeleteAllInSection = useCallback((section: Array<{ id: string; storeProductId?: string }>, sectionLabel: string) => {
    if (section.length === 0) return;
    setConfirmModal({
      title: `Delete all ${sectionLabel.toLowerCase()}?`,
      message: `${section.length} product${section.length !== 1 ? "s" : ""} will be removed from your store. This can't be undone from here.`,
      confirmText: "Delete All",
      confirmColor: colors.error,
      iconName: "trash-outline",
      onConfirm: () => deleteAllInSection(section),
    });
  }, [deleteAllInSection]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const ownerName = session?.user?.name || "Shopkeeper";
  const firstName = ownerName.split(" ")[0];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Header ────────────────────────────────────────────── */}
          <View style={s.header}>
            <View>
              <Text style={s.greeting}>Hello, {firstName}</Text>
              <Text style={s.storeName}>{selectedStore?.name || "My Store"}</Text>
            </View>
            <View style={s.headerActions}>
              <TouchableOpacity onPress={() => router.push("/notification-inbox")} style={s.bellBtn}>
                <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
                {unreadNotificationCount > 0 && (
                  <View style={s.bellBadge}>
                    <Text style={s.bellBadgeText}>
                      {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/profile")} style={s.avatarBtn}>
                <Text style={s.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Approval success banner ───────────────────────────── */}
          {approvedBanner && (
            <Animated.View style={[s.approvedBanner, { opacity: approvedBannerAnim, transform: [{ translateY: approvedBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
              <Ionicons name="checkmark-circle" size={16} color="#065F46" />
              <Text style={s.approvedBannerText}>Your store has been approved! You can now go online.</Text>
            </Animated.View>
          )}

          {/* ── Store Status ──────────────────────────────────────── */}
          {selectedStore && (
            <StoreStatusCard store={selectedStore} isOnline={isStoreOnline} activeOrderCount={activeOrderCount} onToggle={handleStatusToggle} pendingApproval={!isStoreApproved(selectedStore)} />
          )}

          {/* ── Quick Stats Row ───────────────────────────────────── */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{storeProducts.length}</Text>
              <Text style={s.statLabel}>Products</Text>
            </View>
            <View style={[s.statCard, { borderColor: colors.success + "30" }]}>
              <Text style={[s.statValue, { color: colors.success }]}>{activeProductCount}</Text>
              <Text style={s.statLabel}>Active</Text>
            </View>
            <View style={[s.statCard, { borderColor: colors.primary + "30" }]}>
              <Text style={[s.statValue, { color: colors.primary }]}>{isStoreOnline ? "ON" : "OFF"}</Text>
              <Text style={s.statLabel}>Status</Text>
            </View>
          </View>

          {/* ── Quick Actions (Tiles) ─────────────────────────────── */}
          <Text style={s.sectionLabel}>Quick Actions</Text>
          <View style={s.tilesGrid}>
            {TILES.map((tile) => (
              <TouchableOpacity
                key={tile.key}
                style={s.tile}
                onPress={() => router.push(tile.route as any)}
                activeOpacity={0.6}
              >
                <View style={s.tileTop}>
                  <Ionicons name={tile.icon} size={20} color={colors.textSecondary} />
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                </View>
                <Text style={s.tileLabel}>{tile.label}</Text>
                <Text style={s.tileDesc}>{tile.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Your Stock ────────────────────────────────────────── */}
          <View style={s.stockCard}>
            <View style={s.stockHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.stockTitle}>Your Stock</Text>
                <Text style={s.stockSub}>
                  {storeProducts.length} product{storeProducts.length !== 1 ? "s" : ""} in store
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { if (stockSearchOpen) { closeStockSearch(); } else { setStockSearchOpen(true); } }}
                style={s.stockIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={stockSearchOpen ? "close" : "search"} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {stockSearchOpen && (
              <View style={s.searchBar}>
                <Ionicons name="search" size={16} color={colors.textTertiary} />
                <TextInput
                  value={stockSearchQuery}
                  onChangeText={handleStockSearchChange}
                  placeholder="Search products..."
                  placeholderTextColor={colors.textTertiary}
                  style={s.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {stockSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => handleStockSearchChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {storeProductsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : storeProducts.length === 0 ? (
              <View style={s.emptyStock}>
                <Ionicons name="cube-outline" size={32} color={colors.textTertiary} />
                <Text style={s.emptyStockTitle}>{selectedStore?.is_active ? "No products yet" : "Store is Offline"}</Text>
                <Text style={s.emptyStockText}>
                  {selectedStore?.is_active ? "Go to Inventory tab to add products" : "Go online to manage your stock"}
                </Text>
              </View>
            ) : (
              <>
                <View style={s.stockTabRow}>
                  <TouchableOpacity
                    style={[s.stockTabBtn, activeStockTab === "packaged" && s.stockTabBtnActive]}
                    onPress={() => selectStockTab("packaged")}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="pricetag-outline" size={14} color={activeStockTab === "packaged" ? "#fff" : colors.textSecondary} />
                    <Text style={[s.stockTabBtnText, activeStockTab === "packaged" && s.stockTabBtnTextActive]} numberOfLines={1}>
                      Packaged ({packagedProducts.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.stockTabBtn, activeStockTab === "loose" && s.stockTabBtnActive]}
                    onPress={() => selectStockTab("loose")}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="scale-outline" size={14} color={activeStockTab === "loose" ? "#fff" : colors.textSecondary} />
                    <Text style={[s.stockTabBtnText, activeStockTab === "loose" && s.stockTabBtnTextActive]} numberOfLines={1}>
                      Loose ({looseProducts.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  ref={stockPagerRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={handleStockPagerScrollEnd}
                  style={{ height: (activeStockTab === "packaged" ? stockPageHeights.packaged : stockPageHeights.loose) || undefined }}
                >
                  <View
                    style={{ width: STOCK_PAGE_WIDTH }}
                    onLayout={(e) => {
                      const height = e.nativeEvent.layout.height;
                      setStockPageHeights((prev) => ({ ...prev, packaged: height }));
                    }}
                  >
                    <StockSection
                      products={packagedProducts}
                      togglingProductId={togglingProductId}
                      storeActive={!!selectedStore?.is_active}
                      onToggle={toggleProductActive}
                      onDeleteOne={confirmDeleteProduct}
                      onDeleteAll={() => confirmDeleteAllInSection(packagedProducts, "packaged products")}
                      emptyText={packagedEmptyText}
                    />
                  </View>
                  <View
                    style={{ width: STOCK_PAGE_WIDTH }}
                    onLayout={(e) => {
                      const height = e.nativeEvent.layout.height;
                      setStockPageHeights((prev) => ({ ...prev, loose: height }));
                    }}
                  >
                    <StockSection
                      products={looseProducts}
                      togglingProductId={togglingProductId}
                      storeActive={!!selectedStore?.is_active}
                      onToggle={toggleProductActive}
                      onDeleteOne={confirmDeleteProduct}
                      onDeleteAll={() => confirmDeleteAllInSection(looseProducts, "loose products")}
                      emptyText={looseEmptyText}
                    />
                  </View>
                </ScrollView>
              </>
            )}
          </View>

        </Animated.View>
      </ScrollView>

      {/* ── Confirm Modal ──────────────────────────────────────── */}
      <Modal
        visible={!!confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!confirmLoading) setConfirmModal(null); }}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {confirmModal && (
              <>
                <View style={s.modalHandle} />
                <View style={[s.modalIconWrap, { backgroundColor: confirmModal.confirmColor + "12" }]}>
                  <Ionicons name={confirmModal.iconName} size={28} color={confirmModal.confirmColor} />
                </View>
                <Text style={s.modalTitle}>{confirmModal.title}</Text>
                <Text style={s.modalMsg}>{confirmModal.message}</Text>
                <TouchableOpacity
                  style={[s.modalConfirmBtn, { backgroundColor: confirmModal.confirmColor }]}
                  activeOpacity={0.85}
                  disabled={confirmLoading}
                  onPress={async () => {
                    setConfirmLoading(true);
                    try { await confirmModal.onConfirm(); }
                    catch { Alert.alert("Error", "Failed to update store status."); }
                    finally { setConfirmLoading(false); setConfirmModal(null); }
                  }}
                >
                  {confirmLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmText}>{confirmModal.confirmText}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.modalCancelBtn} activeOpacity={0.75} disabled={confirmLoading} onPress={() => setConfirmModal(null)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  approvedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#D1FAE5", borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md, borderWidth: 1, borderColor: "#6EE7B7" },
  approvedBannerText: { color: "#065F46", fontSize: 13, fontWeight: "600", flex: 1 },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl },
  greeting: { fontSize: 14, color: colors.textSecondary },
  storeName: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginTop: 2 },
  avatarBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.primary + "25",
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.primary },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bellBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.primary + "25",
  },
  bellBadge: {
    position: "absolute", top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: { fontSize: 9, fontWeight: "700", color: "#FFFFFF" },

  // Stats
  statsRow: { flexDirection: "row", gap: TILE_GAP, marginBottom: spacing.xl },
  statCard: {
    flex: 1, alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 11, fontWeight: "500", color: colors.textTertiary, marginTop: 2 },

  // Section label
  sectionLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.md },

  // Tiles
  tilesGrid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, marginBottom: spacing.xl },
  tile: {
    width: TILE_WIDTH, backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  tileTop: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: spacing.md,
  },
  tileLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  tileDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },

  // Stock card
  stockCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  stockHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  stockTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  stockSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  stockIconBtn: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: "center", justifyContent: "center",
  },

  // Search
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },

  // Stock tab bar (Packaged / Loose swipeable pager)
  stockTabRow: {
    flexDirection: "row", gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stockTabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  stockTabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stockTabBtnText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  stockTabBtnTextActive: { color: "#fff" },

  // Stock sections (Packaged / Loose boxes)
  stockSection: { gap: spacing.sm },
  stockSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginBottom: spacing.xs },
  stockSectionDeleteAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  stockSectionDeleteAllText: { fontSize: 11, fontWeight: "600", color: colors.error },
  stockSectionEmptyText: { fontSize: 13, color: colors.textTertiary, paddingVertical: spacing.md },

  // Product list
  productRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  productDot: { width: 6, height: 6, borderRadius: 3 },
  productName: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.textPrimary },
  productUnit: { fontSize: 11, color: colors.textTertiary },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, minWidth: 56, alignItems: "center" },
  toggleBtnOn: { backgroundColor: colors.success },
  toggleBtnOff: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  toggleTextOn: { color: "#fff", fontSize: 11, fontWeight: "700" },
  toggleTextOff: { color: colors.textTertiary, fontSize: 11, fontWeight: "600" },

  // Empty
  emptyStock: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyStockTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  emptyStockText: { fontSize: 13, color: colors.textTertiary, textAlign: "center" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 40,
    alignItems: "center", gap: spacing.md,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  modalMsg: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: spacing.sm },
  modalConfirmBtn: { width: "100%", paddingVertical: 15, borderRadius: radius.md, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalCancelBtn: { width: "100%", paddingVertical: 14, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.background },
  modalCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "500" },
});
