import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  FlatList,
  ScrollView,
  Modal,
  Image,
  Alert,
  Animated,
  InteractionManager,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { config } from "../../lib/config";
import { colors, radius, spacing } from "../../lib/theme";
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
  peekStores,
  patchStoreActive,
  clearStoreCache,
  type CachedStore,
} from "../../lib/appCache";

const API_BASE = config.API_BASE;
const BRAND_LOGO = require("../../near_now_shopkeeper.png");
const INVENTORY_PERSISTED_KEY = "inventory_persisted_state";
const INVENTORY_CACHE_KEY = "inventory_products_cache";

type StoreRow = CachedStore;




export default function HomeTab() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [session, setSession] = useState<any | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [storeProducts, setStoreProducts] = useState<
    Array<{ id: string; name: string; unit?: string; storeProductId?: string; is_active?: boolean; quantity?: number }>
  >([]);
  const [storeProductsLoading, setStoreProductsLoading] = useState(false);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [stockExpanded, setStockExpanded] = useState(false);
  const [stockSearchOpen, setStockSearchOpen] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True when at least one Supabase channel reaches SUBSCRIBED — used to slow down polling

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

  const selectedStore = stores[0];
  const isStoreOnline = !!selectedStore?.is_active;

  const filteredStoreProducts = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return storeProducts;
    return storeProducts.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [storeProducts, debouncedSearchQuery]);

  const activeOrderCount = 0;

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
        let s: any = await getSession();
        // Retry once — AsyncStorage writes aren't always immediately visible
        // on the first read right after being written from another screen.
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

        // Use cached stores immediately — no loading spinner on warm starts
        const cached = peekStores();
        if (cached && cached.length > 0) {
          setStores(cached);
          setLoading(false);
          // Refresh in background without blocking UI
          fetchStoresCached(s.token, s.user?.id).then((fresh) => {
            if (!cancelled && fresh.length > 0) setStores(fresh);
          });
          return;
        }

        // Cold start: fetch and wait
        const currentStores = await fetchStoresCached(s.token, s.user?.id);
        if (cancelled) return;
        if (currentStores.length > 0) {
          setStores(currentStores);
          if (!currentStores[0].is_active) await invalidateAllCaches();
        }
      } catch (error) {
        if (__DEV__) console.warn("[home] Bootstrap failed", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const invalidateAllCaches = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
    } catch { /* non-fatal */ }
  }, []);

  // Initial data load when session + store are ready
  useEffect(() => {
    if (!session || !selectedStore) return;
    const task = InteractionManager.runAfterInteractions(() => {
      fetchStoreProducts();
    });
    return () => { task.cancel && task.cancel(); };
  }, [session, selectedStore]);

  useEffect(() => {
    if (!selectedStore?.id) return;

    let cancelled = false;
    let channel: any = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled || !selectedStore?.id || !supabase) return;

      channel = supabase
        .channel(`products-${selectedStore.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "products",
            filter: `store_id=eq.${selectedStore.id}`,
          },
          () => { fetchStoreProducts(true); }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      task.cancel && task.cancel();
      if (channel) {
        supabase?.removeChannel(channel);
        channel = null;
      }
    };
  }, [selectedStore?.id]);

  useEffect(() => {
    if (!selectedStore?.id || !session?.token) return;

    let cancelled = false;
    let channel: any = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled || !selectedStore?.id || !session?.token || !supabase) return;

      channel = supabase
        .channel(`store-${selectedStore.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "stores",
            filter: `id=eq.${selectedStore.id}`,
          },
          () => {
            if (session?.token) fetchStores(session.token, session.user?.id);
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      task.cancel && task.cancel();
      if (channel) {
        supabase?.removeChannel(channel);
        channel = null;
      }
    };
  }, [selectedStore?.id, session?.token]);

  useFocusEffect(
    React.useCallback(() => {
      if (session?.token && selectedStore?.id) {
        fetchStoreProducts(true);
      }
    }, [session?.token, selectedStore?.id])
  );


  const fetchStoreProducts = useCallback(async (silent = false) => {
    if (!session?.token || !selectedStore?.id) return;
    if (!silent) setStoreProductsLoading(true);

    try {
      const fromDb = await getStockListFromDb(selectedStore.id);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        const mapped = fromDb.map((item: any) => ({
          id: item.id,
          name: (item.name || item.product_name || "").trim() || "Product",
          unit: item.unit || "",
          storeProductId: item.storeProductId,
          is_active: item.is_active !== false,
        }));
        setStoreProducts(mapped);
        return;
      }
      setStoreProducts([]);
    } catch {
      setStoreProducts([]);
    } finally {
      if (!silent) setStoreProductsLoading(false);
    }
  }, [session?.token, selectedStore?.id]);

  const fetchStores = useCallback(async (token: string, userId?: string): Promise<StoreRow[]> => {
    try {
      const fetched = await fetchStoresCached(token, userId);
      if (fetched.length > 0) setStores(fetched);
      return fetched;
    } catch {
      return [];
    }
  }, []);

  const toggleOnline = (value: boolean) => {
    if (!session || !selectedStore) return;
    if (selectedStore.is_active === value) return;

    if (value) {
      setConfirmModal({
        title: "Go Online?",
        message: "Your store will become visible to customers. All active products will be available.",
        confirmText: "Go Online",
        confirmColor: colors.success,
        iconName: "storefront",
        onConfirm: async () => {
          const response = await fetch(`${API_BASE}/store-owner/stores/${selectedStore.id}/online`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${session.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ is_active: true }),
          });
          if (!response.ok) throw new Error(`Failed: ${response.status}`);
          await restoreActiveProductsOnline(selectedStore.id);
          patchStoreActive(selectedStore.id, true);
          clearStoreCache();
          await fetchStores(session.token, session.user?.id);
          await fetchStoreProducts(true);
        },
      });
    } else {
      setConfirmModal({
        title: "Go Offline?",
        message: "Your store will be hidden from customers. Your product list is preserved.",
        confirmText: "Go Offline",
        confirmColor: colors.error,
        iconName: "power",
        onConfirm: async () => {
          setStoreProductsLoading(true);
          try {
            await setAllProductsOffline(selectedStore.id);
            const response = await fetch(`${API_BASE}/store-owner/stores/${selectedStore.id}/online`, {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${session.token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ is_active: false }),
            });
            if (!response.ok) throw new Error(`Failed: ${response.status}`);
            patchStoreActive(selectedStore.id, false);
            clearStoreCache();
            await invalidateAllCaches();
            await fetchStores(session.token, session.user?.id);
            fetchStoreProducts(true).catch(() => {});
          } finally {
            setStoreProductsLoading(false);
          }
        },
      });
    }
  };

  const handleStatusToggle = async (value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleOnline(value);
  };

  const toggleProductActive = useCallback(async (product: any) => {
    if (!product.storeProductId) return;

    const wasActive = product.is_active !== false;
    const nowActive = !wasActive;

    setTogglingProductId(product.id);
    setStoreProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, is_active: nowActive } : p
      )
    );

    try {
      const success = await updateProductActiveState(
        product.storeProductId,
        nowActive,
        session?.token ?? null
      );
      if (!success) {
        setStoreProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, is_active: wasActive } : p
          )
        );
      } else {
        await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
        await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
        fetchStoreProducts(true);
      }
    } catch {
      setStoreProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, is_active: wasActive } : p
        )
      );
    } finally {
      setTogglingProductId(null);
    }
  }, [session?.token, fetchStoreProducts]);

  const deleteProduct = useCallback(async (product: any) => {
    if (!product.storeProductId || !supabase) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.storeProductId);

    if (error) return;

    setStoreProducts((prev) => prev.filter((p) => p.id !== product.id));
    await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
    await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} />
            <View>
              <Text style={styles.brand}>Near&Now</Text>
              <Text style={styles.subtitle}>Store Owner</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.statusChip}>
              <Animated.View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isStoreOnline ? colors.success : colors.error,
                    transform: [{ scale: isStoreOnline ? pulseAnim : 1 }],
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusLabel,
                  { color: isStoreOnline ? colors.success : colors.error },
                ]}
              >
                {isStoreOnline ? "Online" : "Offline"}
              </Text>
            </View>
            <Switch
              value={isStoreOnline}
              onValueChange={handleStatusToggle}
              trackColor={{ false: colors.error + "55", true: colors.primaryLight }}
              thumbColor={isStoreOnline ? colors.primary : colors.error}
              ios_backgroundColor={colors.border}
            />
            <TouchableOpacity onPress={() => router.push("/profile")} style={styles.iconBtn}>
              <Ionicons name="person-circle-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {selectedStore && (
          <StoreStatusCard
            store={selectedStore}
            isOnline={isStoreOnline}
            activeOrderCount={activeOrderCount}
            onToggle={handleStatusToggle}
          />
        )}

        {/* Store status confirm modal */}
        <Modal visible={!!confirmModal} transparent animationType="fade">
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmSheet}>
              {confirmModal && (
                <>
                  <View style={[styles.confirmIconWrap, { backgroundColor: confirmModal.confirmColor + "18" }]}>
                    <Ionicons name={confirmModal.iconName} size={32} color={confirmModal.confirmColor} />
                  </View>
                  <Text style={styles.confirmTitle}>{confirmModal.title}</Text>
                  <Text style={styles.confirmMsg}>{confirmModal.message}</Text>
                  <TouchableOpacity
                    style={[styles.confirmActionBtn, { backgroundColor: confirmModal.confirmColor }]}
                    activeOpacity={0.85}
                    disabled={confirmLoading}
                    onPress={async () => {
                      setConfirmLoading(true);
                      try {
                        await confirmModal.onConfirm();
                      } catch {
                        Alert.alert("Error", "Failed to update store status. Please try again.");
                      } finally {
                        setConfirmLoading(false);
                        setConfirmModal(null);
                      }
                    }}
                  >
                    {confirmLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmActionBtnText}>{confirmModal.confirmText}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmCancelBtn}
                    activeOpacity={0.75}
                    disabled={confirmLoading}
                    onPress={() => setConfirmModal(null)}
                  >
                    <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>



        <View>
          <View style={styles.stockSection}>
            <View
              style={[
                styles.stockHeader,
                stockSearchOpen ? { marginBottom: spacing.xs } : { marginBottom: spacing.lg },
              ]}
            >
              <TouchableOpacity
                style={styles.stockHeaderTitleArea}
                onPress={() => setStockExpanded(!stockExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.stockTitleRow}>
                  <Text style={styles.stockTitle}>Your Stock</Text>
                  {storeProducts.length > 0 && (
                    <View style={styles.stockCountBadge}>
                      <Text style={styles.stockCountBadgeText}>
                        {storeProducts.filter((p) => p.is_active !== false).length} active
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.stockSubtitle}>
                  {stockSearchQuery.trim()
                    ? filteredStoreProducts.length === storeProducts.length
                      ? `${storeProducts.length} product${storeProducts.length !== 1 ? "s" : ""} in store`
                      : `${filteredStoreProducts.length} of ${storeProducts.length} match`
                    : `${storeProducts.length} product${storeProducts.length !== 1 ? "s" : ""} in store`}
                </Text>
              </TouchableOpacity>
              <View style={styles.stockHeaderRight}>
                <TouchableOpacity
                  onPress={() => {
                    if (stockSearchOpen) {
                      setStockSearchOpen(false);
                      setStockSearchQuery("");
                    } else {
                      setStockSearchOpen(true);
                    }
                  }}
                  style={styles.stockSearchIconBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={stockSearchOpen ? "Close stock search" : "Search stock"}
                >
                  <Ionicons
                    name={stockSearchOpen ? "close-outline" : "search-outline"}
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStockExpanded(!stockExpanded)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={stockExpanded ? "Collapse stock list" : "Expand stock list"}
                >
                  <Ionicons
                    name={stockExpanded ? "chevron-up" : "chevron-down"}
                    size={24}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {stockSearchOpen && (
              <View style={styles.stockSearchBar}>
                <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.stockSearchIcon} />
                <TextInput
                  value={stockSearchQuery}
                  onChangeText={handleStockSearchChange}
                  placeholder="Search products by name…"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.stockSearchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                {stockSearchQuery.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setStockSearchQuery("")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {!stockExpanded && storeProducts.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                {filteredStoreProducts.length === 0 ? (
                  <View style={styles.stockNoMatchesChip}>
                    <Text style={styles.stockNoMatchesChipText}>No products match “{stockSearchQuery.trim()}”</Text>
                  </View>
                ) : (
                  <>
                    {filteredStoreProducts.slice(0, 15).map((p) => {
                      const isActive = p.is_active !== false;
                      const qty = p.quantity ?? 0;
                      return (
                        <View
                          key={p.id}
                          style={[styles.productChip, isActive ? styles.productChipActive : styles.productChipInactive]}
                        >
                          <View style={[styles.productChipDot, { backgroundColor: isActive ? colors.success : colors.textTertiary }]} />
                          <Text
                            style={[styles.productChipText, isActive ? styles.productChipTextActive : styles.productChipTextInactive]}
                            numberOfLines={1}
                          >
                            {p.name || "Product"}
                          </Text>
                          <Text style={[styles.productChipQty, isActive ? styles.productChipQtyActive : styles.productChipQtyInactive]}>
                            {qty}
                          </Text>
                        </View>
                      );
                    })}
                    {filteredStoreProducts.length > 15 && (
                      <TouchableOpacity
                        style={styles.moreChip}
                        onPress={() => setStockExpanded(true)}
                      >
                        <Text style={styles.moreChipText}>+{filteredStoreProducts.length - 15} more</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ScrollView>
            )}

            {!stockExpanded && storeProducts.length === 0 && !storeProductsLoading && (
              <View style={styles.emptyStockCompact}>
                <Text style={styles.emptyStockCompactText}>
                  {selectedStore?.is_active ? "No products yet. Go to Stock tab to add some." : "Go online to manage your stock."}
                </Text>
              </View>
            )}

            {stockExpanded && (
              storeProductsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
              ) : storeProducts.length === 0 ? (
                <View style={styles.emptyStock}>
                  <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
                  <Text style={styles.emptyStockTitle}>
                    {selectedStore?.is_active ? "No products yet" : "Store is Offline"}
                  </Text>
                  <Text style={styles.emptyStockText}>
                    {selectedStore?.is_active
                      ? "Add products from Stock tab to start tracking inventory"
                      : "Go online to set product quantities and accept orders"}
                  </Text>
                </View>
              ) : filteredStoreProducts.length === 0 ? (
                <View style={styles.emptyStock}>
                  <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
                  <Text style={styles.emptyStockTitle}>No matches</Text>
                  <Text style={styles.emptyStockText}>
                    Nothing in your stock matches “{stockSearchQuery.trim()}”. Try a different name or clear the search.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredStoreProducts}
                  keyExtractor={(p) => p.id}
                  scrollEnabled={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews={false}
                  contentContainerStyle={styles.stockList}
                  renderItem={({ item: p, index }) => {
                    const isActive = p.is_active !== false;
                    return (
                      <View style={[styles.stockItemCard, index === filteredStoreProducts.length - 1 && { marginBottom: 0 }]}>
                        <View style={[styles.stockItemAccent, { backgroundColor: isActive ? colors.success : colors.border }]} />
                        <View style={styles.stockItemInfo}>
                          <Text style={styles.stockItemName} numberOfLines={1}>{p.name || "Product"}</Text>
                          {p.unit ? (
                            <Text style={styles.stockItemUnit}>{p.unit}</Text>
                          ) : null}
                        </View>
                        <View style={styles.stockItemActions}>
                          <TouchableOpacity
                            style={[styles.activeToggleBtn, isActive ? styles.activeToggleBtnOn : styles.activeToggleBtnOff]}
                            onPress={() => toggleProductActive(p)}
                            disabled={togglingProductId === p.id || !selectedStore?.is_active}
                            activeOpacity={0.75}
                          >
                            {togglingProductId === p.id ? (
                              <ActivityIndicator size="small" color={isActive ? colors.surface : colors.textSecondary} />
                            ) : (
                              <Text style={isActive ? styles.activeToggleTextOn : styles.activeToggleTextOff}>
                                {isActive ? "Active" : "Inactive"}
                              </Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteProduct(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={17} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }}
                />
              )
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    alignItems: "center",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: "600" },
  brand: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: -2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },


  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  popup: {
    width: "92%",
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  popupTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", textAlign: "center" },
  orderCodeBig: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", textAlign: "center" },

  itemRow: { flexDirection: "row", gap: spacing.md, marginBottom: 10, alignItems: "center" },
  itemImg: { width: 48, height: 48, borderRadius: radius.sm },
  itemName: { color: colors.textPrimary, fontWeight: "600" },
  itemQty: { color: colors.textTertiary, fontSize: 12 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  btnText: { color: colors.surface, fontWeight: "800" },

  ordersSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  ordersSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  ordersSectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  ordersSectionSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  waitingCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  waitingTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  waitingText: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: "center",
  },
  orderCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 4,
    marginBottom: spacing.sm,
  },
  orderCardLeft: {
    gap: 3,
  },
  orderCardCode: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  orderCardTime: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  orderCardRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  orderCardAmount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  orderCardContainer: {
    marginBottom: spacing.sm,
  },
  orderItemsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingLeft: 12,
  },
  orderItemChip: {
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  orderItemText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },

  stockSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  stockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  stockHeaderTitleArea: {
    flex: 1,
    marginRight: spacing.sm,
  },
  stockSearchIconBtn: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  stockSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  stockSearchIcon: {
    marginRight: spacing.xs,
  },
  stockSearchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  stockNoMatchesChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: 280,
  },
  stockNoMatchesChipText: {
    color: colors.textTertiary,
    fontSize: 13,
  },
  stockTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stockTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  stockCountBadge: {
    backgroundColor: colors.success + "18",
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.success + "40",
  },
  stockCountBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
  },
  stockSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 3,
  },
  stockHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyStock: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyStockTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  emptyStockText: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  stockList: {
    gap: spacing.sm,
  },
  stockItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  stockItemAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  stockItemInfo: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  stockItemName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  stockItemUnit: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  stockItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  activeToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1.5,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  activeToggleBtnOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  activeToggleBtnOff: {
    backgroundColor: colors.surfaceVariant,
    borderColor: colors.border,
  },
  activeToggleTextOn: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "700",
  },
  activeToggleTextOff: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: "600",
  },

  chipScroll: {
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    flexDirection: "row",
  },
  productChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    maxWidth: 150,
  },
  productChipActive: {
    backgroundColor: colors.success + "15",
    borderColor: colors.success + "50",
  },
  productChipInactive: {
    backgroundColor: colors.surfaceVariant,
    borderColor: colors.border,
  },
  productChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  productChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  productChipTextActive: {
    color: colors.success,
    fontWeight: "600",
  },
  productChipTextInactive: {
    color: colors.textSecondary,
    fontWeight: "500",
  },
  productChipQty: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: "hidden",
    minWidth: 18,
    textAlign: "center",
  },
  productChipQtyActive: {
    backgroundColor: colors.success + "30",
    color: colors.success,
  },
  productChipQtyInactive: {
    backgroundColor: colors.surfaceVariant,
    color: colors.textTertiary,
  },

  quantityStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  stepperBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  stepperValueZero: {
    color: colors.textTertiary,
  },
  moreChip: {
    backgroundColor: colors.primary + "18",
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  moreChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyStockCompact: {
    paddingVertical: spacing.md,
  },
  emptyStockCompactText: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: "center",
  },

  // Store status confirm modal

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  confirmSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 36,
    alignItems: "center",
    gap: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  confirmIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  confirmTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  confirmMsg: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  confirmActionBtn: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: radius.lg,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  confirmActionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  confirmCancelBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
  },
  confirmCancelBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
});

