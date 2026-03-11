import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  ScrollView,
  Modal,
  Image,
  Alert,
  Animated,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { getSession, clearSession } from "../session";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";
import {
  getStockListFromDb,
  updateProductActiveState,
  setAllProductsOffline,
  restoreActiveProductsOnline,
  getMergedInventoryFromDb,
  upsertStoreProduct,
} from "../lib/storeProducts";
import { getOrdersFromDb, getOrderByIdFromDb } from "../lib/orders-db";

const API_BASE = config.API_BASE;
const INVENTORY_PERSISTED_KEY = "inventory_persisted_state";
const INVENTORY_CACHE_KEY = "inventory_products_cache";
const ORDER_TIMEOUT_SECONDS = 20;



type UserSession = {
  token: string;
  user: { id: string; name: string; role: string };
};

type StoreRow = {
  id: string;
  name: string;
  address: string | null;
  delivery_radius_km: number;
  is_active: boolean;
};


export default function OwnerHomeScreen() {
  const [, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "scanning" | "success">("idle");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const slideAnim = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);

  // Orders accepted by this store should never trigger the popup again.
  // Rejected orders are suppressed for REJECT_COOLDOWN_MS, after which the
  // algorithm may re-route them back and the popup can re-appear.
  const acceptedOrderIdsRef = useRef<Set<string>>(new Set());
  const rejectedCooldownRef = useRef<Map<string, number>>(new Map());
  const REJECT_COOLDOWN_MS = 60_000;

  const [session, setSession] = useState<UserSession | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [incomingOrder, setIncomingOrder] = useState<any | null>(null);
  const [, setDetailsLoading] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "orders" | "previous_orders" | "add_custom" | "inventory" | "payments" | "payouts"
  >("orders");
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsDayTotal, setPaymentsDayTotal] = useState(0);

  const [storeProducts, setStoreProducts] = useState<
    Array<{ id: string; name: string; quantity: number; storeProductId?: string; is_active?: boolean }>
  >([]);
  const [storeProductsLoading, setStoreProductsLoading] = useState(false);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [stockExpanded, setStockExpanded] = useState(false);

  const selectedStore = stores[0];

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

  // Active = any order not yet delivered. Previous = only when status is order_delivered/delivered.
  const DELIVERED_STATUSES = ["delivered", "order_delivered"];
  const isDelivered = (o: any) =>
    DELIVERED_STATUSES.includes((o.status || "").toLowerCase().replace(/-/g, "_"));
  const activeOrders = orders.filter((o: any) => !isDelivered(o));
  const previousOrders = orders.filter((o: any) => isDelivered(o));

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) return router.replace("/landing");

      setSession(s);
      await fetchStores(s.token);

      // Ensure store starts offline - set all quantities to 0
      const stores = await (async () => {
        try {
          const session = await getSession();
          const userId = session?.user?.id;
          const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
            headers: { Authorization: `Bearer ${s.token}` },
          });
          const raw = await res.text();
          const json = raw ? JSON.parse(raw) : null;
          return json?.stores || [];
        } catch {
          return [];
        }
      })();

      if (stores[0] && !stores[0].is_active) {
        console.log("⚠️ Store is offline on app start - ensuring all quantities are 0");
        // Force all quantities to 0 when starting offline
        await invalidateAllCaches();
      }

      setLoading(false);
    })();
  }, []);

  const invalidateAllCaches = async () => {
    try {
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
      console.log("🗑️ Cleared all inventory caches");
    } catch (error) {
      console.error("Failed to clear caches:", error);
    }
  };

  useEffect(() => {
    if (!session || !selectedStore) return;

    fetchOrders();
    fetchStoreProducts();
    fetchPayments();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [session, selectedStore]);

  // Realtime subscription for products table
  useEffect(() => {
    if (!selectedStore?.id) return;

    console.log("🔴 Setting up realtime subscription for products, store:", selectedStore.id);

    const { supabase } = require("../lib/supabase");

    const channel = supabase
      .channel(`products-${selectedStore.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `store_id=eq.${selectedStore.id}`,
        },
        (payload: any) => {
          console.log("🔴 Realtime update received:", payload);

          // Refresh products from database
          fetchStoreProducts(true);
        }
      )
      .subscribe((status: string) => {
        console.log("🔴 Realtime subscription status:", status);
      });

    return () => {
      console.log("🔴 Cleaning up realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [selectedStore?.id]);

  // Realtime subscription for stores table (for online/offline status)
  useEffect(() => {
    if (!selectedStore?.id || !session?.token) return;

    console.log("🟢 Setting up realtime subscription for store status");

    const { supabase } = require("../lib/supabase");

    const channel = supabase
      .channel(`store-${selectedStore.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "stores",
          filter: `id=eq.${selectedStore.id}`,
        },
        (payload: any) => {
          console.log("🟢 Store status changed:", payload.new);

          // Refresh store data
          if (session?.token) {
            fetchStores(session.token);
          }
        }
      )
      .subscribe((status: string) => {
        console.log("🟢 Store subscription status:", status);
      });

    return () => {
      console.log("🟢 Cleaning up store subscription");
      supabase.removeChannel(channel);
    };
  }, [selectedStore?.id, session?.token]);

  useFocusEffect(
    React.useCallback(() => {
      if (session?.token && selectedStore?.id) {
        fetchStoreProducts(true);
      }
    }, [session?.token, selectedStore?.id])
  );

  const fetchStoreProducts = async (silent = false) => {
    if (!session?.token || !selectedStore?.id) return;
    if (!silent) setStoreProductsLoading(true);

    const applyInventoryCache = (raw: string | null): boolean => {
      if (!raw) return false;
      try {
        const p = JSON.parse(raw);
        const list = p?.products;
        if (!Array.isArray(list) || list.length === 0) return false;
        if (p.storeId && selectedStore?.id && p.storeId !== selectedStore.id) return false;
        const out = list
          .map((x: any) => ({
            id: x.id,
            name: x.name || x.product_name || "Product",
            quantity: Number(x.quantity ?? 0),
          }));
        // Keep products in order they were added (no sorting by quantity)
        if (out.length === 0) return false;
        setStoreProducts(out);
        return true;
      } catch {
        return false;
      }
    };

    const applyProductsArrayCache = (raw: string | null): boolean => {
      if (!raw) return false;
      try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || list.length === 0) return false;
        const out = list
          .map((x: any) => ({
            id: x.id,
            name: x.name || x.product_name || "Product",
            quantity: Number(x.quantity ?? 0),
          }));
        // Keep products in order they were added (no sorting by quantity)
        if (out.length === 0) return false;
        setStoreProducts(out);
        return true;
      } catch {
        return false;
      }
    };

    try {
      // ALWAYS try database first for real-time updates
      const fromDb = await getStockListFromDb(selectedStore.id);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        const mapped = fromDb.map((item: any) => ({
          id: item.id,
          name: (item.name || item.product_name || "").trim() || "Product",
          quantity: item.quantity || 0,
          storeProductId: item.storeProductId,
          is_active: item.is_active !== false,
        }));
        setStoreProducts(mapped);
        if (!silent) setStoreProductsLoading(false);
        return;
      }

      // Only use cache if database returns nothing
      const [cacheRaw, arrayCacheRaw] = await Promise.all([
        AsyncStorage.getItem(INVENTORY_PERSISTED_KEY),
        AsyncStorage.getItem(INVENTORY_CACHE_KEY),
      ]);
      const fromCache = applyInventoryCache(cacheRaw) || applyProductsArrayCache(arrayCacheRaw);

      if (fromCache) {
        if (!silent) setStoreProductsLoading(false);
        return;
      }

      const storeRes = await fetch(
        `${API_BASE}/store-owner/stores/${selectedStore.id}/products`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const storeRaw = await storeRes.text();
      let storeList: any[] = [];
      try {
        const storeJson = storeRaw ? JSON.parse(storeRaw) : null;
        storeList =
          storeJson?.products ??
          storeJson?.data ??
          (Array.isArray(storeJson) ? storeJson : []);
      } catch {
        storeList = [];
      }
      if (!Array.isArray(storeList)) storeList = [];

      const masterRes = await fetch(
        `${API_BASE}/api/products/master-products?isActive=true`
      );
      const masterRaw = await masterRes.text();
      let masterList: any[] = [];
      try {
        masterList = masterRaw ? JSON.parse(masterRaw) : [];
      } catch {
        masterList = [];
      }
      if (!Array.isArray(masterList)) masterList = [];

      const byMasterId: Record<string, { quantity: number; name?: string }> = {};
      storeList.forEach((sp: any) => {
        const mid =
          sp.master_product_id ??
          sp.masterProductId ??
          sp.master_product?.id ??
          sp.product_id;
        if (mid) {
          const qty = Number(sp.quantity ?? 0);
          const name =
            sp.name ??
            sp.product_name ??
            sp.master_product?.name ??
            "Product";
          byMasterId[mid] = { quantity: qty, name };
        }
      });

      let merged: Array<{ id: string; name: string; quantity: number }>;
      if (Object.keys(byMasterId).length === 0) {
        merged = [];
      } else {
        const fromMaster = masterList
          .filter((mp: any) => byMasterId[mp.id] !== undefined)
          .map((mp: any) => ({
            id: mp.id,
            name: mp.name || byMasterId[mp.id]?.name || "Product",
            quantity: byMasterId[mp.id]?.quantity ?? 0,
          }));
        const matchedIds = new Set(fromMaster.map((m) => m.id));
        const storeOnly = Object.entries(byMasterId)
          .filter(([id]) => !matchedIds.has(id))
          .map(([id, v]) => ({
            id,
            name: v.name || "Product",
            quantity: v.quantity ?? 0,
          }));
        merged = [...fromMaster, ...storeOnly].sort(
          (a, b) => (b.quantity ?? 0) - (a.quantity ?? 0)
        );
      }

      if (merged.length > 0) {
        setStoreProducts(merged);
      }
    } catch {
      const [cacheRaw, arrayCacheRaw] = await Promise.all([
        AsyncStorage.getItem(INVENTORY_PERSISTED_KEY),
        AsyncStorage.getItem(INVENTORY_CACHE_KEY),
      ]);
      const fromCache = applyInventoryCache(cacheRaw) || applyProductsArrayCache(arrayCacheRaw);
      if (!fromCache && !silent) setStoreProducts([]);
    } finally {
      if (!silent) setStoreProductsLoading(false);
    }
  };

  const fetchStores = async (token: string) => {
    try {
      const session = await getSession();
      const userId = session?.user?.id;
      console.log(`[fetchStores] Fetching stores for userId: ${userId}`);
      const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      console.log(`[fetchStores] Response status: ${res.status}`);
      console.log(`[fetchStores] Response raw (first 200 chars): ${raw.substring(0, 200)}`);
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error(`[fetchStores] Failed to parse JSON:`, e);
        // HTML or non-JSON response
      }
      console.log(`[fetchStores] Parsed stores:`, json?.stores);
      setStores(json?.stores || []);
    } catch (e) {
      console.error(`[fetchStores] Error:`, e);
      setStores([]);
    }
  };

  const fetchOrders = async () => {
    if (!session || !selectedStore) return;

    const shouldShowPopup = (o: any): boolean => {
      if (o.status !== "pending_store") return false;
      if (acceptedOrderIdsRef.current.has(o.id)) return false;
      const cooldownExpiry = rejectedCooldownRef.current.get(o.id);
      if (cooldownExpiry && Date.now() < cooldownExpiry) return false;
      // Cooldown elapsed — clean up the entry so it can show freely again
      if (cooldownExpiry) rejectedCooldownRef.current.delete(o.id);
      return true;
    };

    try {
      const fromDb = await getOrdersFromDb(selectedStore.id);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        setOrders(fromDb);
        const pending = fromDb.find(shouldShowPopup);
        if (pending && !incomingOrder) openIncomingOrder(pending);
        return;
      }
    } catch (e) {
      console.warn("[fetchOrders] DB failed:", e);
    }

    try {
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${selectedStore.id}/orders`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!json?.success) return;

      setOrders(json.orders || []);

      const pending = (json.orders ?? []).find(shouldShowPopup);
      if (pending && !incomingOrder) openIncomingOrder(pending);
    } catch {
      setOrders([]);
    }
  };

  const fetchPayments = async () => {
    if (!session || !selectedStore) return;

    try {
      setPaymentsLoading(true);

      const today = new Date().toISOString().slice(0, 10);

      const res = await fetch(
        `${API_BASE}/store-owner/stores/${selectedStore.id}/payments?date=${today}`,
        {
          headers: { Authorization: `Bearer ${session.token}` },
        }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!json?.success) return;

      setPayments(json.payments || []);
      setPaymentsDayTotal(json.day_total || 0);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const openOrderDetails = async (orderId: string) => {
    if (!session) return;

    try {
      setDetailsLoading(true);
      setSelectedOrder(null);

      const fromDb = await getOrderByIdFromDb(orderId);
      if (fromDb) {
        setSelectedOrder(fromDb);
        setDetailsLoading(false);
        return;
      }

      const res = await fetch(
        `${API_BASE}/store-owner/orders/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }

      if (!json?.success) {
        console.log("Failed to load order details", json);
        return;
      }

      setSelectedOrder(json.order);
    } catch (e) {
      console.log("Order details error", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const onQrScanned = async ({ data }: { data: string }) => {
    if (exportState !== "scanning" || !selectedOrder || !session) return;

    try {
      setExportState("success");

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await fetch(
        `${API_BASE}/store-owner/orders/${selectedOrder.id}/verify-qr`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: data }),
        }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error("Invalid response");
      }

      if (!res.ok || !json?.success) {
        throw json;
      }

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      setTimeout(() => {
        setScannerVisible(false);
        setExportState("idle");
        setSelectedOrder(null);
        fetchOrders();
      }, 1200);

    } catch (err: any) {
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error
      );

      const errorMap: Record<string, string> = {
        MISSING_TOKEN: "Invalid QR code.",
        ORDER_NOT_FOUND: "Order not found.",
        INVALID_ORDER_STATE: "Order is not ready for verification.",
        QR_ALREADY_USED: "This QR code has already been used.",
        QR_MISMATCH: "This QR does not belong to the selected order.",
        ORDER_FETCH_FAILED: "Could not verify order. Please try again.",
        UPDATE_FAILED: "Verification failed. Please retry.",
      };

      Alert.alert(
        "QR Verification Failed",
        errorMap[err?.error_code] || "Something went wrong while verifying the QR."
      );

      setExportState("scanning");
    }
  };

  const handleExportPress = async (order: any) => {
    const { granted } = await requestPermission();
    if (!granted) {
      Alert.alert(
        "Camera required",
        "Camera access is needed to scan QR."
      );
      return;
    }

    setSelectedOrder(order);
    setExportState("scanning");
    setScannerVisible(true);
  };

  const handleCancelScan = () => {
    setScannerVisible(false);
    setExportState("idle");
    setSelectedOrder(null);
  };

  const toggleOnline = async (value: boolean) => {
    if (!session || !selectedStore) return;

    // Prevent toggle if already in the desired state
    if (selectedStore.is_active === value) {
      console.log("Store already in desired state:", value ? "online" : "offline");
      return;
    }

    try {
      if (value) {
        // Going ONLINE
        Alert.alert(
          "Go Online?",
          "Your store will become visible to customers. All active products will be available with stock of 100.",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => fetchStores(session.token),
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

                  // Restore qty=100 for all active products in DB
                  await restoreActiveProductsOnline(selectedStore.id);

                  await fetchStores(session.token);
                  await fetchStoreProducts(true);

                  Alert.alert("Store Online", "Your store is now visible to customers.");
                } catch (error) {
                  console.error("Error going online:", error);
                  Alert.alert("Error", "Failed to update store status. Please try again.");
                  fetchStores(session.token);
                }
              },
            },
          ]
        );
      } else {
        // Going OFFLINE
        Alert.alert(
          "Go Offline?",
          "Your store will be hidden from customers. Product list is preserved.",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => fetchStores(session.token),
            },
            {
              text: "Go Offline",
              style: "destructive",
              onPress: async () => {
                setStoreProductsLoading(true);
                try {
                  // Set all product quantities to 0 in DB (preserve is_active flags)
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
                  await fetchStores(session.token);
                  fetchStoreProducts(true).catch(() => {});

                  Alert.alert("Store Offline", "Store is now hidden from customers. Your products are saved.");
                } catch (error) {
                  console.error("Error going offline:", error);
                  Alert.alert("Error", "Failed to update store status. Please try again.");
                  fetchStores(session.token);
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

  const openIncomingOrder = async (order: any) => {
    if (incomingOrder?.id === order.id) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    setIncomingOrder(order);

    const deadline = Date.now() + ORDER_TIMEOUT_SECONDS * 1000;
    deadlineRef.current = deadline;

    setCountdown(ORDER_TIMEOUT_SECONDS);

    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning
    );

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    countdownRef.current = setInterval(() => {
      const remainingMs = (deadlineRef.current ?? 0) - Date.now();
      const remainingSec = Math.max(
        0,
        Math.ceil(remainingMs / 1000)
      );

      setCountdown(remainingSec);

      if (remainingSec <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        rejectOrder();
      }
    }, 500);
  };

  const closePopup = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    deadlineRef.current = null;

    slideAnim.setValue(24);
    scaleAnim.setValue(1);

    setIncomingOrder(null);

    // Show main page: switch to Orders tab and refresh so active orders list is populated
    setActiveTab("orders");
    fetchOrders();
  };

  const acceptOrder = async () => {
    if (!incomingOrder || !session) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    // Permanently suppress this order from re-triggering the popup
    acceptedOrderIdsRef.current.add(incomingOrder.id);

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await fetch(
      `${API_BASE}/store-owner/orders/${incomingOrder.id}/accept`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      }
    );

    closePopup();
  };

  const rejectOrder = async () => {
    if (!incomingOrder || !session) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    // Suppress popup for this order for REJECT_COOLDOWN_MS.
    // After the cooldown the algorithm may re-route it back and the popup
    // will re-appear naturally on the next fetchOrders tick.
    rejectedCooldownRef.current.set(
      incomingOrder.id,
      Date.now() + REJECT_COOLDOWN_MS
    );

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await fetch(
      `${API_BASE}/store-owner/orders/${incomingOrder.id}/reject`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      }
    );

    closePopup();
  };

  const toggleProductActive = async (product: any) => {
    if (!product.storeProductId) return;

    const wasActive = product.is_active !== false;
    const nowActive = !wasActive;

    setTogglingProductId(product.id);

    // Optimistic update
    setStoreProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? { ...p, is_active: nowActive, quantity: nowActive ? 100 : 0 }
          : p
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
            p.id === product.id
              ? { ...p, is_active: wasActive, quantity: product.quantity }
              : p
          )
        );
      } else {
        await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
        await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
        fetchStoreProducts(true);
      }
    } catch (error) {
      console.error("Exception in toggleProductActive:", error);
      setStoreProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, is_active: wasActive, quantity: product.quantity }
            : p
        )
      );
    } finally {
      setTogglingProductId(null);
    }
  };

  const deleteProduct = async (product: any) => {
    if (!product.storeProductId) {
      console.log("❌ No storeProductId found for delete");
      return;
    }

    try {
      console.log("🗑️ Deleting product from store:", product.storeProductId);

      // Delete from products table
      const { supabase } = require("../lib/supabase");

      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.storeProductId);

      if (error) {
        console.error("Failed to delete product:", error);
        return;
      }

      // Update UI
      setStoreProducts((prev) => prev.filter((p) => p.id !== product.id));

      // Clear caches
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);

      console.log("✅ Product removed successfully");
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace("/landing");
  };

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
            <Ionicons name="storefront" size={24} color={colors.primary} />
            <View>
              <Text style={styles.brand}>Near&Now</Text>
              <Text style={styles.subtitle}>Store Owner</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push("/profile")} style={styles.iconBtn}>
              <Ionicons name="person-circle-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

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
                          <Image
                            source={{ uri: item.image_url }}
                            style={styles.itemImg}
                          />
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
                    <ActionBtn
                      label="Close"
                      color="#ae1616ff"
                      onPress={() => setSelectedOrder(null)}
                    />
                    <ActionBtn

                      label="Export Order"
                      color="#71f331ff"
                      onPress={() => handleExportPress(selectedOrder)}
                    />
                  </View>
                </>
              ) : (
                <ActivityIndicator color="#fff" />
              )}
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={scannerVisible} animationType="slide">
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={
                exportState === "scanning" ? onQrScanned : undefined
              }
            />

            <TouchableOpacity
              onPress={handleCancelScan}
              style={{
                position: "absolute",
                bottom: 40,
                alignSelf: "center",
                backgroundColor: "#E74C3C",
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
        <Modal visible={!!incomingOrder} transparent animationType="fade">
          <View style={styles.overlay}>
            <Animated.View
              style={[
                styles.popup,
                {
                  transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
                },
              ]}
            >
              <Text style={styles.popupTitle}>New Order</Text>
              <Text style={styles.orderCodeBig}>#{incomingOrder?.order_code}</Text>
              <Text style={styles.countdown}>Accept in {countdown}s</Text>

              <ScrollView style={{ maxHeight: 260 }}>
                {incomingOrder?.order_items?.map((i: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Image source={{ uri: i.image_url }} style={styles.itemImg} />
                    <View>
                      <Text style={styles.itemName}>{i.product_name}</Text>
                      <Text style={styles.itemQty}>{i.quantity} {i.unit}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <ActionBtn label="Reject" color="#E74C3C" onPress={rejectOrder} />
                <ActionBtn label="Accept" color={colors.primary} onPress={acceptOrder} />
              </View>
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
              <Text style={styles.storeMeta}>
                Delivery · {selectedStore.delivery_radius_km} km
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[
                styles.switchLabel,
                { color: selectedStore.is_active ? colors.success : colors.error }
              ]}>
                {selectedStore.is_active ? "Online" : "Offline"}
              </Text>
              <Switch
                value={selectedStore.is_active}
                onValueChange={toggleOnline}
                trackColor={{
                  false: colors.error + "40",
                  true: colors.success + "40"
                }}
                thumbColor={selectedStore.is_active ? colors.success : colors.error}
                ios_backgroundColor={colors.error + "40"}
              />
            </View>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navScroll}
        >
          <NavButton
            label="Orders"
            icon="receipt-outline"
            active={activeTab === "orders"}
            onPress={() => setActiveTab("orders")}
          />
          <NavButton
            label="Previous"
            icon="time-outline"
            active={activeTab === "previous_orders"}
            onPress={() => setActiveTab("previous_orders")}
          />
          <NavButton
            label="Add Custom"
            icon="add-circle-outline"
            active={activeTab === "add_custom"}
            onPress={() => setActiveTab("add_custom")}
          />
          <NavButton
            label="Payments"
            icon="card-outline"
            active={activeTab === "payments"}
            onPress={() => setActiveTab("payments")}
          />
          <NavButton
            label="Payouts"
            icon="cash-outline"
            active={activeTab === "payouts"}
            onPress={() => setActiveTab("payouts")}
          />
          <NavButton
            label="Inventory"
            icon="cube-outline"
            active={activeTab === "inventory"}
            onPress={() => {
              setActiveTab("inventory");
              setStockExpanded(true);
            }}
          />
        </ScrollView>

        {activeTab === "add_custom" && (
          <AddCustomSection storeId={selectedStore?.id} token={session?.token} />
        )}

        {activeTab === "payments" && (
          paymentsLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : payments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No payments today</Text>
              <Text style={styles.emptyText}>
                Delivered orders will appear here automatically.
              </Text>
            </View>
          ) : (
            <>
              {payments.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.paymentRow}
                >
                  <View>
                    <Text style={styles.paymentCode}>
                      #{p.order_code}
                    </Text>
                    <Text style={styles.paymentMeta}>
                      Items ₹{p.items_total} + Bonus ₹{p.delivery_bonus}
                    </Text>
                  </View>

                  <Text style={styles.paymentAmount}>
                    ₹{p.total_amount}
                  </Text>
                </TouchableOpacity>
              ))}

              <View style={styles.paymentFooter}>
                <Text style={styles.paymentFooterText}>Today’s Total</Text>
                <Text style={styles.paymentFooterAmount}>
                  ₹{paymentsDayTotal}
                </Text>
              </View>
            </>
          )
        )}

        {activeTab === "payouts" && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No payouts yet</Text>
            <Text style={styles.emptyText}>
              Payouts from Near&Now will appear here once they’re processed.
            </Text>
          </View>
        )}

        {activeTab === "previous_orders" && (
          <View style={styles.ordersSection}>
            <View style={styles.ordersSectionHeader}>
              <View>
                <Text style={styles.ordersSectionTitle}>Previous Orders</Text>
                <Text style={styles.ordersSectionSubtitle}>
                  {previousOrders.length === 0
                    ? "No past orders yet"
                    : `${previousOrders.length} order${previousOrders.length > 1 ? "s" : ""}`}
                </Text>
              </View>
              <TouchableOpacity onPress={fetchOrders} style={styles.refreshBtn}>
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {previousOrders.length === 0 ? (
              <View style={styles.waitingCard}>
                <Ionicons name="receipt-outline" size={36} color={colors.textTertiary} />
                <Text style={styles.waitingTitle}>No previous orders</Text>
                <Text style={styles.waitingText}>Orders that have been delivered will appear here</Text>
              </View>
            ) : (
              previousOrders.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.orderCard, { borderLeftColor: getStatusColor(o.status) }]}
                  onPress={() => openOrderDetails(o.id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.orderCardLeft}>
                    <Text style={styles.orderCardCode}>#{o.order_code}</Text>
                    {o.created_at && (
                      <Text style={styles.orderCardTime}>
                        {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {new Date(o.created_at).toLocaleDateString()}
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
              ))
            )}
          </View>
        )}

        {activeTab === "orders" && (
          <>
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
                  activeOrders.map((o) => (
                    <View key={o.id} style={styles.orderCardContainer}>
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
                  ))
                )}
              </View>
            )}

            {/* ── YOUR STOCK – collapsible ── */}
            <View style={styles.stockSection}>
              <View style={styles.stockHeader}>
                <View>
                  <Text style={styles.stockTitle}>Your Stock</Text>
                  <Text style={styles.stockSubtitle}>
                    {storeProducts.length} product{storeProducts.length !== 1 ? "s" : ""} in store
                  </Text>
                </View>
                <View style={styles.stockHeaderRight}>
                  <TouchableOpacity
                    style={styles.manageBtn}
                    onPress={() => {
                      setActiveTab("inventory");
                      setStockExpanded(true);
                    }}
                  >
                    <Ionicons name="settings-outline" size={14} color={colors.primary} />
                    <Text style={styles.manageBtnText}>Manage</Text>
                  </TouchableOpacity>
                  <Ionicons
                    name={stockExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.textTertiary}
                  />
                </View>
              </View>

              {/* Collapsed: horizontal chip scroll */}
              {!stockExpanded && storeProducts.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipScroll}
                >
                  {storeProducts.slice(0, 15).map((p) => (
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
                  {storeProducts.length > 15 && (
                    <TouchableOpacity
                      style={styles.moreChip}
                      onPress={() => setStockExpanded(true)}
                    >
                      <Text style={styles.moreChipText}>+{storeProducts.length - 15} more</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}

              {/* Collapsed: empty state */}
              {!stockExpanded && storeProducts.length === 0 && !storeProductsLoading && (
                <View style={styles.emptyStockCompact}>
                  <Text style={styles.emptyStockCompactText}>
                    {selectedStore?.is_active ? "No products yet. Go to Inventory to add some." : "Go online to manage your stock."}
                  </Text>
                </View>
              )}

              {/* Expanded: full list with quantity controls */}
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
                        ? "Add products from Inventory to start tracking stock"
                        : "Go online to set product quantities and accept orders"}
                    </Text>
                    <TouchableOpacity
                      style={styles.addStockBtn}
                      onPress={() =>
                        selectedStore?.is_active
                          ? (setActiveTab("inventory"), setStockExpanded(true))
                          : toggleOnline(true)
                      }
                    >
                      <Text style={styles.addStockBtnText}>
                        {selectedStore?.is_active ? "Go to Inventory" : "Go Online"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.stockList}>
                    {storeProducts.map((p, index) => (
                      <View key={p.id} style={[styles.stockItemCard, index === storeProducts.length - 1 && { marginBottom: 0 }]}>
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

          </>
        )}

        {activeTab === "inventory" && (
          <InventoryCatalogSection storeId={selectedStore?.id} token={session?.token} />
        )}
      </ScrollView>

      <Modal visible={!!incomingOrder} transparent animationType="fade">
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.popup,
              {
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              },
            ]}
          >
            <Text style={styles.popupTitle}>New Order</Text>
            <Text style={styles.orderCodeBig}>#{incomingOrder?.order_code}</Text>
            <Text style={styles.countdown}>Accept in {countdown}s</Text>

            <ScrollView style={{ maxHeight: 260 }}>
              {incomingOrder?.order_items?.map((i: any, idx: number) => (
                <View key={idx} style={styles.itemRow}>
                  <Image source={{ uri: i.image_url }} style={styles.itemImg} />
                  <View>
                    <Text style={styles.itemName}>{i.product_name}</Text>
                    <Text style={styles.itemQty}>{i.quantity} {i.unit}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.actions}>
              <ActionBtn label="Reject" color="#E74C3C" onPress={rejectOrder} />
              <ActionBtn label="Accept" color="#2ECC71" onPress={acceptOrder} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AddCustomSection({ storeId, token }: { storeId?: string; token?: string }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"];

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Camera access is needed.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      setImageUri(res.assets[0].uri);
      setImageBase64(res.assets[0].base64 || null);
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      setImageUri(res.assets[0].uri);
      setImageBase64(res.assets[0].base64 || null);
    }
  };

  const addCustom = async () => {
    if (!storeId || !token) {
      Alert.alert("Not ready", "Store information is still loading. Please try again in a moment.");
      return;
    }
    if (!name || !category || !unit || !price || !imageUri || !imageBase64) {
      Alert.alert("Missing fields", "All fields marked * are required.");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/products/custom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            brand,
            category,
            subcategory,
            unit,
            image_url: `data:image/jpeg;base64,${imageBase64}`,
            price: Number(price),
            quantity: 100,
          }),
        }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json?.success) {
        Alert.alert("Error", "Failed to add product.");
        return;
      }
      Alert.alert("Success", "Custom product added.");
      setName("");
      setBrand("");
      setCategory("");
      setSubcategory("");
      setUnit("");
      setPrice("");
      setImageUri(null);
      setImageBase64(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCustomCard}>
      <Text style={styles.addCustomTitle}>Add Custom Product</Text>
      <Text style={styles.addCustomSubtitle}>Create a product unique to your store.</Text>

      <Text style={styles.addCustomLabel}>Product Name *</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Fresh Tomatoes"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Brand</Text>
      <TextInput
        value={brand}
        onChangeText={setBrand}
        placeholder="e.g. Local Farm (optional)"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Category *</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder="e.g. Vegetables"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Subcategory</Text>
      <TextInput
        value={subcategory}
        onChangeText={setSubcategory}
        placeholder="e.g. Leafy Greens"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Unit *</Text>
      <View style={styles.addCustomChipsRow}>
        {UNITS.map((u) => (
          <TouchableOpacity
            key={u}
            onPress={() => setUnit(u)}
            style={[
              styles.addCustomChip,
              unit === u && styles.addCustomChipActive,
            ]}
          >
            <Text
              style={[
                styles.addCustomChipText,
                unit === u && styles.addCustomChipTextActive,
              ]}
            >
              {u}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.addCustomLabel}>Product Image *</Text>
      {imageUri ? (
        <View style={styles.addCustomImageBlock}>
          <Image source={{ uri: imageUri }} style={styles.addCustomImage} />
          <View style={styles.addCustomImageActions}>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromCamera}>
              <Text style={styles.addCustomSmallBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromGallery}>
              <Text style={styles.addCustomSmallBtnText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addCustomRemoveBtn}
              onPress={() => {
                setImageUri(null);
                setImageBase64(null);
              }}
            >
              <Text style={styles.addCustomRemoveBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.addCustomImagePicker}>
          <Text style={styles.addCustomImageIcon}>📷</Text>
          <Text style={styles.addCustomImageLabel}>Add a photo of your product</Text>
          <View style={styles.addCustomImageActions}>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromCamera}>
              <Text style={styles.addCustomSmallBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromGallery}>
              <Text style={styles.addCustomSmallBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.addCustomLabel}>Price (₹) *</Text>
      <TextInput
        value={price}
        onChangeText={setPrice}
        placeholder="0"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
        keyboardType="numeric"
      />
      <Text style={styles.addCustomHint}>
        Stock is automatically set to 100 when the product is active.
      </Text>

      <TouchableOpacity
        style={[styles.addCustomSubmit, saving && styles.addCustomSubmitDisabled]}
        onPress={addCustom}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.addCustomSubmitText}>Add Custom Product</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function InventoryCatalogSection({ storeId, token }: { storeId?: string; token?: string }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!storeId || !token) {
        setLoading(false);
        return;
      }
      try {
        const fromDb = await getMergedInventoryFromDb(storeId);
        if (Array.isArray(fromDb) && fromDb.length > 0) {
          setProducts(fromDb);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to network fetch
      }

      try {
        const [masterRes, storeProductsRes] = await Promise.all([
          fetch(`${API_BASE}/api/products/master-products?isActive=true`),
          fetch(`${API_BASE}/store-owner/stores/${storeId}/products`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const [masterRaw, storeRaw] = await Promise.all([
          masterRes.text(),
          storeProductsRes.text(),
        ]);
        let masterList: any[] = [];
        let storeList: any[] = [];
        try {
          masterList = masterRaw ? JSON.parse(masterRaw) : [];
        } catch {
          masterList = [];
        }
        try {
          const storeJson = storeRaw ? JSON.parse(storeRaw) : null;
          storeList = storeJson?.products || [];
        } catch {
          storeList = [];
        }
        if (!Array.isArray(masterList)) masterList = [];

        const byMasterId: Record<
          string,
          { id: string; quantity: number; is_active: boolean }
        > = {};
        storeList.forEach((sp: any) => {
          const mid = sp.master_product_id ?? sp.masterProductId;
          if (mid) {
            byMasterId[mid] = {
              id: sp.id,
              quantity: sp.quantity ?? 0,
              is_active: sp.is_active !== false,
            };
          }
        });

        const merged = masterList.map((mp: any) => {
          const storeRow = byMasterId[mp.id];
          return {
            ...mp,
            price: mp.base_price ?? mp.price,
            quantity: storeRow ? storeRow.quantity : 0,
            storeProductId: storeRow?.id ?? null,
            is_active: storeRow?.is_active ?? false,
          };
        });
        setProducts(merged);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId, token]);

  const notInStore = products.filter((p) => !p.storeProductId);
  const q = search.trim().toLowerCase();

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    notInStore.forEach((p) => {
      const c = (p.category || "").trim();
      if (c) set.add(c);
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [notInStore]);

  const filteredBySearch = notInStore.filter((p) =>
    [p.name, p.product_name, p.brand, p.category]
      .filter(Boolean)
      .some((x: string) => String(x).toLowerCase().includes(q))
  );
  const filtered =
    !selectedCategory || selectedCategory === "All"
      ? filteredBySearch
      : filteredBySearch.filter(
          (p) => (p.category || "").trim() === selectedCategory
        );
  const visible = filtered.slice(0, q === "" ? 40 : 60);

  const addProduct = async (product: any) => {
    if (!storeId || !token) return;
    setTogglingId(product.id);
    try {
      const inserted = await upsertStoreProduct(storeId, product.id, 100);
      if (inserted && "id" in inserted && inserted.id) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? {
                  ...p,
                  storeProductId: inserted.id,
                  quantity: 100,
                  is_active: true,
                }
              : p
          )
        );
      } else if (inserted && "error" in inserted) {
        Alert.alert("Error", "Could not add product. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setTogglingId(null);
    }
  };

  const formatCategoryLabel = (raw: string): string => {
    if (!raw || raw === "All") return raw;
    const withSpaces = String(raw).replace(/-/g, " ").trim();
    return withSpaces
      .split(/\s+/)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");
  };

  return (
    <View style={styles.catalogCard}>
      <Text style={styles.catalogTitle}>Add from Near&Now catalog</Text>
      <Text style={styles.catalogSubtitle}>
        Browse master products and add them to your store.
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, brands or categories"
        placeholderTextColor={colors.textTertiary}
        style={styles.catalogSearch}
      />

      {categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogCategoryRow}
        >
          {categories.map((cat) => {
            const isAll = cat === "All";
            const isSelected = isAll
              ? !selectedCategory || selectedCategory === "All"
              : selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(isAll ? null : cat)}
                style={[
                  styles.catalogCategoryChip,
                  isSelected && styles.catalogCategoryChipActive,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.catalogCategoryText,
                    isSelected && styles.catalogCategoryTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {formatCategoryLabel(cat)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && products.length === 0 ? (
        <View style={styles.catalogLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.catalogLoadingText}>Loading products...</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.catalogEmpty}>
          <Text style={styles.catalogEmptyTitle}>
            {products.length === 0
              ? "No products available"
              : "No products match your filters"}
          </Text>
          <Text style={styles.catalogEmptyText}>
            {products.length === 0
              ? "Could not load master products. Check your connection."
              : "Try a different search or clear the category filter."}
          </Text>
        </View>
      ) : (
        <View style={styles.catalogList}>
          {visible.map((p) => {
            const name = p.name || p.product_name || "Product";
            const brand = p.brand;
            const cat = p.category ? formatCategoryLabel(p.category) : "";
            return (
              <View key={p.id} style={styles.catalogItem}>
                <Image
                  source={{ uri: p.image_url }}
                  style={styles.catalogItemImage}
                />
                <View style={styles.catalogItemInfo}>
                  <Text style={styles.catalogItemName} numberOfLines={2}>
                    {name}
                  </Text>
                  <Text style={styles.catalogItemMeta} numberOfLines={1}>
                    {brand ? `${brand} · ` : ""}
                    {cat}
                  </Text>
                  <Text style={styles.catalogItemPrice}>
                    ₹{p.price ?? p.base_price ?? 0}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.catalogAddBtn}
                  onPress={() => addProduct(p)}
                  disabled={togglingId === p.id}
                  activeOpacity={0.8}
                >
                  {togglingId === p.id ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Text style={styles.catalogAddBtnText}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function NavButton({ label, icon, active, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.navButton, active && styles.navButtonActive]}
    >
      <View style={styles.navButtonInner}>
        {icon ? (
          <Ionicons
            name={icon}
            size={16}
            color={active ? colors.surface : colors.primary}
          />
        ) : null}
        <Text style={[styles.navButtonText, active && styles.navButtonTextActive]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function ActionBtn({ label, color, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, { backgroundColor: color }]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
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
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
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
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error + "30",
  },
  logoutText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "600",
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
  },

  navScroll: {
    paddingVertical: 2,
    paddingRight: 6,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  navButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  navButtonTextActive: {
    color: colors.surface,
  },

  catalogCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  catalogTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  catalogSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  catalogSearch: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 13,
  },
  catalogCategoryRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  catalogCategoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  catalogCategoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catalogCategoryText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  catalogCategoryTextActive: {
    color: colors.surface,
    fontWeight: "600",
  },
  catalogLoading: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  catalogLoadingText: {
    color: colors.textTertiary,
    fontSize: 13,
  },
  catalogEmpty: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  catalogEmptyTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  catalogEmptyText: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  catalogList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  catalogItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  catalogItemImage: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  catalogItemInfo: {
    flex: 1,
    gap: 2,
  },
  catalogItemName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  catalogItemMeta: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  catalogItemPrice: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  catalogAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  catalogAddBtnText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },

  addCustomCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  addCustomTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  addCustomSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  addCustomLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  addCustomInput: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  addCustomChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  addCustomChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  addCustomChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  addCustomChipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  addCustomChipTextActive: {
    color: colors.surface,
    fontWeight: "600",
  },
  addCustomImageBlock: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  addCustomImage: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  addCustomImagePicker: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  addCustomImageIcon: {
    fontSize: 28,
  },
  addCustomImageLabel: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  addCustomImageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  addCustomSmallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addCustomSmallBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "500",
  },
  addCustomRemoveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  addCustomRemoveBtnText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "500",
  },
  addCustomHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
  },
  addCustomSubmit: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  addCustomSubmitDisabled: {
    opacity: 0.6,
  },
  addCustomSubmitText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "700",
  },

  emptyCard: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  emptyText: { color: colors.textTertiary, fontSize: 12, marginTop: 6 },

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
    marginBottom: spacing.lg,
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
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manageBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
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
  addStockBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  addStockBtnText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "700",
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

  orderRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  orderCode: { color: colors.textPrimary, fontWeight: "700" },
  orderStatus: { color: colors.textTertiary, fontSize: 12 },

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
  countdown: { textAlign: "center", color: colors.error, fontWeight: "700", marginBottom: 8 },

  itemRow: { flexDirection: "row", gap: spacing.md, marginBottom: 10, alignItems: "center" },
  itemImg: { width: 48, height: 48, borderRadius: radius.sm },
  itemName: { color: colors.textPrimary, fontWeight: "600" },
  itemQty: { color: colors.textTertiary, fontSize: 12 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  btnText: { color: colors.surface, fontWeight: "800" },

  scannerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 40,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  scanText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  successText: {
    color: colors.success,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginTop: 12,
  },
  retry: {
    color: colors.surface,
    marginTop: 16,
    fontWeight: "600",
  },

  paymentRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentCode: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  paymentMeta: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
  },
  paymentAmount: {
    color: colors.success,
    fontSize: 16,
    fontWeight: "800",
  },
  paymentFooter: {
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  paymentFooterText: {
    color: colors.textTertiary,
    fontWeight: "600",
  },
  paymentFooterAmount: {
    color: colors.success,
    fontSize: 18,
    fontWeight: "800",
  },

  // ── Active Orders section ──
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

  // ── Stock section collapsed/expanded ──
  stockHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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