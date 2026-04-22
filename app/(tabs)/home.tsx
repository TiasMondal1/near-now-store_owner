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
import {
  getStockListFromDb,
  updateProductActiveState,
  setAllProductsOffline,
  restoreActiveProductsOnline,
} from "../../lib/storeProducts";
import { getOrdersFromDb, getOrderByIdFromDb } from "../../lib/orders-db";

const API_BASE = config.API_BASE;
const INVENTORY_PERSISTED_KEY = "inventory_persisted_state";
const INVENTORY_CACHE_KEY = "inventory_products_cache";
const BRAND_LOGO = require("../../near_now_shopkeeper.png");

type StoreRow = {
  id: string;
  name: string;
  address: string | null;
  delivery_radius_km: number;
  is_active: boolean;
};

export default function HomeTab() {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const slideAnim = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [session, setSession] = useState<any | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [storeProducts, setStoreProducts] = useState<
    Array<{ id: string; name: string; storeProductId?: string; is_active?: boolean }>
  >([]);
  const [storeProductsLoading, setStoreProductsLoading] = useState(false);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [stockExpanded, setStockExpanded] = useState(false);
  const [stockSearchOpen, setStockSearchOpen] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState("");

  const selectedStore = stores[0];
  const isStoreOnline = !!selectedStore?.is_active;

  const filteredStoreProducts = useMemo(() => {
    const q = stockSearchQuery.trim().toLowerCase();
    if (!q) return storeProducts;
    return storeProducts.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [storeProducts, stockSearchQuery]);

  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "pending_store" || s === "pending_at_store") return "#F59E0B";
    if (s === "accepted") return colors.success;
    if (s === "rejected" || s === "cancelled") return colors.error;
    if (s === "ready") return "#3B82F6";
    if (s === "delivered" || s === "order_delivered") return colors.textTertiary;
    return colors.textTertiary;
  };

  const formatStatus = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "pending_store" || s === "pending_at_store") return "Pending";
    if (s === "accepted") return "Accepted";
    if (s === "rejected") return "Rejected";
    if (s === "ready") return "Ready";
    if (s === "delivered" || s === "order_delivered") return "Delivered";
    if (s === "cancelled") return "Cancelled";
    return status;
  };

  const activeOrders = useMemo(() => {
    const DELIVERED = ["delivered", "order_delivered"];
    return orders.filter(
      (o: any) => !DELIVERED.includes((o.status || "").toLowerCase().replace(/-/g, "_"))
    );
  }, [orders]);

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
        if (!s?.token) {
          if (!cancelled) router.replace("/landing");
          return;
        }

        if (cancelled) return;
        setSession(s);

        const currentStores = await fetchStores(s.token, s.user?.id);

        if (cancelled) return;

        if (currentStores.length > 0 && !currentStores[0].is_active) {
          await invalidateAllCaches();
        }
      } catch (error) {
        console.warn("[home] Initial bootstrap failed", error);
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

  useEffect(() => {
    if (!session || !selectedStore) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      fetchOrders();
      fetchStoreProducts();
      interval = setInterval(fetchOrders, 10000);
    });

    return () => {
      cancelled = true;
      task.cancel && task.cancel();
      if (interval) clearInterval(interval);
    };
  }, [session, selectedStore]);

  useEffect(() => {
    if (!selectedStore?.id) return;

    let cancelled = false;
    let channel: any = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled || !selectedStore?.id) return;

      const { supabase } = require("../../lib/supabase");
      if (!supabase) return;

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
        try {
          const { supabase } = require("../../lib/supabase");
          supabase?.removeChannel(channel);
        } catch { /* ignore cleanup errors */ }
        channel = null;
      }
    };
  }, [selectedStore?.id]);

  useEffect(() => {
    if (!selectedStore?.id || !session?.token) return;

    let cancelled = false;
    let channel: any = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled || !selectedStore?.id || !session?.token) return;

      const { supabase } = require("../../lib/supabase");
      if (!supabase) return;

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
        try {
          const { supabase } = require("../../lib/supabase");
          supabase?.removeChannel(channel);
        } catch { /* ignore cleanup errors */ }
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch { /* non-JSON response */ }
      const fetched: StoreRow[] = json?.stores || [];
      if (fetched.length > 0) {
        setStores(fetched);
      }
      return fetched;
    } catch {
      clearTimeout(timeoutId);
      return [];
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!session || !selectedStore) return;

    try {
      const fromDb = await getOrdersFromDb(selectedStore.id);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        setOrders(fromDb);
        return;
      }
    } catch { /* fall through to HTTP */ }

    try {
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${selectedStore.id}/orders`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const raw = await res.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { return; }
      if (!json?.success) return;
      setOrders(json.orders || []);
    } catch {
      setOrders([]);
    }
  }, [session, selectedStore]);

  const openOrderDetails = useCallback(async (orderId: string) => {
    if (!session) return;

    try {
      const fromDb = await getOrderByIdFromDb(orderId);
      if (fromDb) { setSelectedOrder(fromDb); return; }

      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const raw = await res.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { return; }
      if (!json?.success) return;
      setSelectedOrder(json.order);
    } catch { /* ignore */ }
  }, [session]);

  const toggleOnline = async (value: boolean) => {
    if (!session || !selectedStore) return;

    if (selectedStore.is_active === value) {
      console.log("Store already in desired state:", value ? "online" : "offline");
      return;
    }

    try {
      if (value) {
        Alert.alert(
          "Go Online?",
          "Your store will become visible to customers. All active products will be available with stock of 100.",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => fetchStores(session.token, session.user?.id),
            },
            {
              text: "Go Online",
              onPress: async () => {
                try {
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
                  await fetchStores(session.token, session.user?.id);
                  await fetchStoreProducts(true);

                  Alert.alert("Store Online", "Your store is now visible to customers.");
                } catch (error) {
                  console.error("Error going online:", error);
                  Alert.alert("Error", "Failed to update store status. Please try again.");
                  fetchStores(session.token, session.user?.id);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Go Offline?",
          "Your store will be hidden from customers. Product list is preserved.",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => fetchStores(session.token, session.user?.id),
            },
            {
              text: "Go Offline",
              style: "destructive",
              onPress: async () => {
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

                  await invalidateAllCaches();
                  await fetchStores(session.token, session.user?.id);
                  fetchStoreProducts(true).catch(() => {});

                  Alert.alert("Store Offline", "Store is now hidden from customers. Your products are saved.");
                } catch (error) {
                  console.error("Error going offline:", error);
                  Alert.alert("Error", "Failed to update store status. Please try again.");
                  fetchStores(session.token, session.user?.id);
                  fetchStoreProducts(true);
                } finally {
                  setStoreProductsLoading(false);
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error("Error toggling store status:", error);
      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    }
  };

  const handleStatusToggle = async (value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleOnline(value);
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
    if (!product.storeProductId) return;

    try {
      const { supabase } = require("../../lib/supabase");
      if (!supabase) return;

      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.storeProductId);

      if (error) {
        if (__DEV__) console.error("Failed to delete product:", error);
        return;
      }

      setStoreProducts((prev) => prev.filter((p) => p.id !== product.id));
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
    } catch (error) {
      if (__DEV__) console.error("Error deleting product:", error);
    }
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
                    backgroundColor: isStoreOnline ? colors.success : colors.textTertiary,
                    transform: [{ scale: isStoreOnline ? pulseAnim : 1 }],
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusLabel,
                  { color: isStoreOnline ? colors.success : colors.textTertiary },
                ]}
              >
                {isStoreOnline ? "Online" : "Offline"}
              </Text>
            </View>
            <Switch
              value={isStoreOnline}
              onValueChange={handleStatusToggle}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={isStoreOnline ? colors.primary : colors.textTertiary}
              ios_backgroundColor={colors.border}
            />
            <TouchableOpacity onPress={() => router.push("/profile")} style={styles.iconBtn}>
              <Ionicons name="person-circle-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {selectedStore && (
          <View style={[styles.statusBanner, isStoreOnline ? styles.bannerOnline : styles.bannerOffline]}>
            <View style={[styles.bannerIcon, isStoreOnline ? styles.bannerIconOnline : styles.bannerIconOffline]}>
              <Ionicons
                name={isStoreOnline ? "storefront-outline" : "power-outline"}
                size={24}
                color={isStoreOnline ? colors.primary : colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {isStoreOnline ? "You're Online" : "You're Offline"}
              </Text>
              <Text style={styles.bannerSubtext}>
                {isStoreOnline
                  ? activeOrders.length > 0
                    ? `${activeOrders.length} active order${activeOrders.length > 1 ? "s" : ""}`
                    : "Waiting for new orders..."
                  : "Go online to receive orders"}
              </Text>
            </View>
            {!isStoreOnline && (
              <TouchableOpacity
                style={styles.goOnlineBtn}
                onPress={() => handleStatusToggle(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.goOnlineBtnText}>Go Online</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Modal visible={!!selectedOrder} transparent animationType="fade">
          <View style={styles.overlay}>
            <Animated.View
              style={[
                styles.popup,
                {
                  transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
                },
              ]}
            >
              {selectedOrder ? (
                <>
                  <Text style={styles.popupTitle}>Order Details</Text>

                  <Text style={styles.orderCodeBig}>
                    #{selectedOrder?.order_code ?? "---"}
                  </Text>

                  <ScrollView style={{ maxHeight: 260 }}>
                    {Array.isArray(selectedOrder.order_items) &&
                      selectedOrder.order_items.map((item: any, idx: number) => (
                        <View key={idx} style={styles.itemRow}>
                          {item?.image_url ? (
                            <Image
                              source={{ uri: item.image_url }}
                              style={styles.itemImg}
                            />
                          ) : (
                            <View style={styles.itemImg} />
                          )}
                          <View>
                            <Text style={styles.itemName}>
                              {item.product_name}
                            </Text>
                            <Text style={styles.itemQty}>
                              {item.quantity} {item.unit}
                            </Text>
                          </View>
                        </View>
                      ))}
                  </ScrollView>

                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => setSelectedOrder(null)}
                      style={[styles.btn, { backgroundColor: "#ae1616ff" }]}
                    >
                      <Text style={styles.btnText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <ActivityIndicator color="#fff" />
              )}
            </Animated.View>
          </View>
        </Modal>

        {selectedStore && (
          <View style={[
            styles.storeCard,
            !selectedStore.is_active && styles.storeCardOffline
          ]}>
            <View style={{ flex: 1 }}>
              <View style={styles.storeHeader}>
                <Text style={styles.storeName}>{selectedStore.name}</Text>
                {!selectedStore.is_active && (
                  <View style={styles.offlineBadge}>
                    <Text style={styles.offlineBadgeText}>OFFLINE</Text>
                  </View>
                )}
              </View>
              <Text style={styles.storeAddress}>
                {selectedStore.address || "No address"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.switchLabel}>Status shown in header</Text>
            </View>
          </View>
        )}

        <View>
          <View style={styles.ordersSection}>
            <View style={styles.ordersSectionHeader}>
              <View>
                <Text style={styles.ordersSectionTitle}>Active Orders</Text>
                <Text style={styles.ordersSectionSubtitle}>
                  {activeOrders.length === 0
                    ? "Waiting for new orders..."
                    : `${activeOrders.length} order${activeOrders.length > 1 ? "s" : ""}`}
                </Text>
              </View>
              <TouchableOpacity onPress={fetchOrders} style={styles.refreshBtn}>
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {activeOrders.length === 0 ? (
              <View style={styles.waitingCard}>
                <Ionicons name="time-outline" size={36} color={colors.textTertiary} />
                <Text style={styles.waitingTitle}>Waiting for orders</Text>
                <Text style={styles.waitingText}>New orders appear here automatically every 10s</Text>
              </View>
            ) : (
              <FlatList
                data={activeOrders}
                keyExtractor={(o) => o.id}
                scrollEnabled={false}
                initialNumToRender={5}
                maxToRenderPerBatch={5}
                windowSize={3}
                renderItem={({ item: o }) => (
                  <View style={styles.orderCardContainer}>
                    <TouchableOpacity
                      style={[styles.orderCard, { borderLeftColor: getStatusColor(o.status) }]}
                      onPress={() => openOrderDetails(o.id)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.orderCardLeft}>
                        <Text style={styles.orderCardCode}>#{o.order_code}</Text>
                        {o.created_at && (
                          <Text style={styles.orderCardTime}>
                            {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        )}
                      </View>
                      <View style={styles.orderCardRight}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(o.status) + "22" }]}>
                          <Text style={[styles.statusBadgeText, { color: getStatusColor(o.status) }]}>
                            {formatStatus(o.status)}
                          </Text>
                        </View>
                        {o.total_amount != null && (
                          <Text style={styles.orderCardAmount}>₹{o.total_amount}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    {Array.isArray(o.order_items) && o.order_items.length > 0 && (
                      <View style={styles.orderItemsList}>
                        {o.order_items.map((item: any, idx: number) => (
                          <View key={idx} style={styles.orderItemChip}>
                            <Text style={styles.orderItemText} numberOfLines={1}>
                              {item.quantity} {item.unit} {item.product_name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              />
            )}
          </View>

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
                <View>
                  <Text style={styles.stockTitle}>Your Stock</Text>
                  <Text style={styles.stockSubtitle}>
                    {stockSearchQuery.trim()
                      ? filteredStoreProducts.length === storeProducts.length
                        ? `${storeProducts.length} product${storeProducts.length !== 1 ? "s" : ""} in store`
                        : `${filteredStoreProducts.length} of ${storeProducts.length} match`
                      : `${storeProducts.length} product${storeProducts.length !== 1 ? "s" : ""} in store`}
                  </Text>
                </View>
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
                  onChangeText={setStockSearchQuery}
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
                    {filteredStoreProducts.slice(0, 15).map((p) => (
                      <View
                        key={p.id}
                        style={[
                          styles.productChip,
                          p.is_active !== false && styles.productChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.productChipText,
                            p.is_active !== false && styles.productChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {p.name || "Product"}
                        </Text>
                      </View>
                    ))}
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
                <View style={styles.stockList}>
                  {filteredStoreProducts.map((p, index) => (
                    <View key={p.id} style={[styles.stockItemCard, index === filteredStoreProducts.length - 1 && { marginBottom: 0 }]}>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => deleteProduct(p)}
                      >
                        <Ionicons name="close-circle" size={22} color={colors.error} />
                      </TouchableOpacity>
                      <View style={styles.stockItemInfo}>
                        <Text style={styles.stockItemName} numberOfLines={1}>
                          {p.name || "Product"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.activeToggleBtn,
                          p.is_active !== false ? styles.activeToggleBtnOn : styles.activeToggleBtnOff,
                        ]}
                        onPress={() => toggleProductActive(p)}
                        disabled={togglingProductId === p.id || !selectedStore?.is_active}
                        activeOpacity={0.75}
                      >
                        {togglingProductId === p.id ? (
                          <ActivityIndicator
                            size="small"
                            color={p.is_active !== false ? colors.surface : colors.textSecondary}
                          />
                        ) : (
                          <Text style={p.is_active !== false ? styles.activeToggleTextOn : styles.activeToggleTextOff}>
                            {p.is_active !== false ? "Active" : "Inactive"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
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

  storeCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.success + "30",
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  storeCardOffline: {
    backgroundColor: colors.error + "08",
    borderColor: colors.error + "60",
    shadowColor: colors.error,
  },
  storeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 4,
  },
  offlineBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  offlineBadgeText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  storeName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  storeAddress: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  storeMeta: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 6,
  },
  switchLabel: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerOnline: {
    backgroundColor: colors.primaryLight + "22",
    borderWidth: 1,
    borderColor: colors.primary + "33",
  },
  bannerOffline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerIconOnline: { backgroundColor: colors.surface },
  bannerIconOffline: { backgroundColor: colors.surfaceVariant },
  bannerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  bannerSubtext: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  goOnlineBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  goOnlineBtnText: { color: colors.surface, fontSize: 13, fontWeight: "700" },

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
  stockTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  stockSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
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
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    position: "relative",
  },
  deleteBtn: {
    position: "absolute",
    left: -8,
    top: "50%",
    transform: [{ translateY: -12 }],
    zIndex: 10,
    padding: 4,
  },
  stockItemInfo: {
    flex: 1,
    marginRight: spacing.md,
    marginLeft: 20,
  },
  stockItemName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
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
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 120,
  },
  productChipActive: {
    backgroundColor: colors.success + "20",
    borderColor: colors.success + "60",
  },
  productChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  productChipTextActive: {
    color: colors.success,
    fontWeight: "600",
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
});
