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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { getSession, clearSession } from "../session";
import { CameraView } from "expo-camera";
import { Camera, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";
import { getStockListFromDb, updateStoreProductQuantity } from "../lib/storeProducts";

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
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "scanning" | "success">("idle");;
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const slideAnim = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);

  const [session, setSession] = useState<UserSession | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [incomingOrder, setIncomingOrder] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "orders" | "inventory" | "payments" | "payouts">("orders");
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsDayTotal, setPaymentsDayTotal] = useState(0);

  const [storeProducts, setStoreProducts] = useState<Array<{ id: string; name: string; quantity: number; storeProductId?: string }>>([]);
  const [storeProductsLoading, setStoreProductsLoading] = useState(false);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  const [exportError, setExportError] = useState<string | null>(null);


  const selectedStore = stores[0];
  
  // Debug logging
  console.log(`[owner-home] stores array length: ${stores.length}`);
  console.log(`[owner-home] selectedStore:`, selectedStore ? {
    id: selectedStore.id,
    name: selectedStore.name,
    is_active: selectedStore.is_active
  } : 'null');

  useEffect(() => {
    if (activeTab === "payments") {
      fetchPayments();
    }
  }, [activeTab]);



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
            name: x.name || "Product",
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
            name: x.name || "Product",
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
          id: item.id, // master_product_id
          name: item.name || "Product",
          quantity: item.quantity || 0,
          storeProductId: item.storeProductId, // products table id
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

      const pending = json.orders?.find(
        (o: any) => o.status === "pending_store"
      );

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

    try {
      if (value) {
        // Going ONLINE - just enable quantity editing, start from 0
        Alert.alert(
          "Go Online?",
          "Your store will become visible to customers. You can set product quantities starting from 0.",
          [
            {
              text: "Cancel",
              style: "cancel"
            },
            {
              text: "Go Online",
              onPress: async () => {
                // Just update store status - quantities stay at 0
                await fetch(`${API_BASE}/store-owner/stores/${selectedStore.id}/online`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${session.token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ is_active: true }),
                });

                await fetchStores(session.token);
                await fetchStoreProducts(true);
                
                Alert.alert(
                  "Store Online", 
                  "You can now set product quantities. Use +/- buttons to add stock."
                );
              }
            }
          ]
        );
      } else {
        // Going OFFLINE - reset everything to 0
        Alert.alert(
          "Go Offline?",
          "Your store will be hidden from customers. All product quantities will be reset to 0.",
          [
            {
              text: "Cancel",
              style: "cancel"
            },
            {
              text: "Go Offline",
              style: "destructive",
              onPress: async () => {
                setStoreProductsLoading(true);
                
                try {
                  console.log("🔴 Going offline - resetting all quantities to 0");
                  
                  // Set all products to quantity 0
                  const productsToReset = storeProducts.filter(p => p.storeProductId && p.quantity > 0);
                  console.log(`Resetting ${productsToReset.length} products to 0`);
                  
                  for (const product of productsToReset) {
                    await updateStoreProductQuantity(product.storeProductId, 0);
                  }

                  // Update store status
                  await fetch(`${API_BASE}/store-owner/stores/${selectedStore.id}/online`, {
                    method: "PATCH",
                    headers: {
                      Authorization: `Bearer ${session.token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ is_active: false }),
                  });

                  // Clear all caches
                  await invalidateAllCaches();
                  
                  // Refresh store and products
                  await fetchStores(session.token);
                  await fetchStoreProducts(true);
                  
                  // Force UI to show 0
                  setStoreProducts(prev => prev.map(p => ({ ...p, quantity: 0 })));
                  
                  setStoreProductsLoading(false);
                  
                  Alert.alert("Store Offline", "All quantities reset to 0. Store hidden from customers.");
                } catch (error) {
                  console.error("Error going offline:", error);
                  setStoreProductsLoading(false);
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error("Error toggling store status:", error);
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
  };


  const acceptOrder = async () => {
    if (!incomingOrder || !session) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

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


  const updateProductQuantity = async (product: any, newQty: number) => {
    console.log("🔵 updateProductQuantity called", { productId: product.id, storeProductId: product.storeProductId, oldQty: product.quantity, newQty });
    
    // Check if store is online
    if (!selectedStore?.is_active) {
      console.log("❌ Store is offline, cannot update");
      return;
    }

    if (!product.storeProductId) {
      console.log("❌ No storeProductId found for product", product);
      return;
    }

    const qty = Math.max(0, newQty);
    setUpdatingProductId(product.id);

    // Optimistic update
    setStoreProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, quantity: qty } : p))
    );
    console.log("✅ Optimistic UI update applied, quantity:", qty);

    try {
      console.log("📡 Calling updateStoreProductQuantity...");
      const success = await updateStoreProductQuantity(product.storeProductId, qty);
      console.log("📡 updateStoreProductQuantity result:", success);
      
      if (!success) {
        console.log("❌ Update failed, reverting");
        // Revert on failure
        setStoreProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, quantity: product.quantity } : p))
        );
      } else {
        console.log("✅ Update successful, clearing caches");
        // Invalidate cache to refresh data
        await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
        await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
        console.log("✅ Quantity updated successfully");
      }
    } catch (error) {
      console.error("❌ Exception in updateProductQuantity:", error);
      // Revert on error
      setStoreProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, quantity: product.quantity } : p))
      );
    } finally {
      setUpdatingProductId(null);
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
          contentContainerStyle={styles.tabs}
        >
          <Tab label="Orders" active={activeTab === "orders"} onPress={() => setActiveTab("orders")} />
          <Tab label="Add product" active={false} onPress={() => router.push({ pathname: "/add.product", params: { storeId: selectedStore?.id } })} />
          <Tab label="Payments" active={activeTab === "payments"} onPress={() => setActiveTab("payments")} />
          <Tab label="Payouts" active={activeTab === "payouts"} onPress={() => setActiveTab("payouts")} />
          <Tab label="Inventory" active={false} onPress={() => router.push({ pathname: "/inventory", params: { storeId: selectedStore?.id } })} />

        </ScrollView>

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

        {activeTab === "orders" && (
          <>
            <View style={styles.stockSection}>
              <View style={styles.stockHeader}>
                <View>
                  <Text style={styles.stockTitle}>Your Stock</Text>
                  <Text style={styles.stockSubtitle}>
                    {storeProducts.length} products in inventory
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.manageBtn}
                  onPress={() => router.push({ pathname: "/inventory", params: { storeId: selectedStore?.id } })}
                >
                  <Ionicons name="settings-outline" size={16} color={colors.primary} />
                  <Text style={styles.manageBtnText}>Manage</Text>
                </TouchableOpacity>
              </View>

              {storeProductsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
              ) : storeProducts.length === 0 ? (
                <View style={styles.emptyStock}>
                  <Ionicons name="cube-outline" size={48} color={colors.textTertiary} />
                  <Text style={styles.emptyStockTitle}>
                    {selectedStore?.is_active 
                      ? "No products yet" 
                      : "Store is Offline"}
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
                        ? router.push({ pathname: "/inventory", params: { storeId: selectedStore?.id } })
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
                  {storeProducts.slice(0, 20).map((p, index) => {
                    // Always show actual quantity from database
                    const displayQty = p.quantity;
                    
                    return (
                      <View key={p.id} style={[styles.stockItemCard, index === storeProducts.slice(0, 20).length - 1 && { marginBottom: 0 }]}>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => deleteProduct(p)}
                        >
                          <Ionicons name="close-circle" size={24} color={colors.error} />
                        </TouchableOpacity>
                        <View style={styles.stockItemInfo}>
                          <Text style={styles.stockItemName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={styles.stockItemQty}>
                            {displayQty} units in stock
                          </Text>
                        </View>
                        <View style={styles.stockControls}>
                          <TouchableOpacity
                            style={[styles.stockBtn, styles.stockBtnMinus]}
                            onPress={() => updateProductQuantity(p, p.quantity - 1)}
                            disabled={updatingProductId === p.id || !selectedStore?.is_active || p.quantity <= 0}
                          >
                            {updatingProductId === p.id ? (
                              <ActivityIndicator size="small" color={colors.textSecondary} />
                            ) : (
                              <Ionicons 
                                name="remove" 
                                size={18} 
                                color={!selectedStore?.is_active || p.quantity <= 0 ? colors.textDisabled : colors.textSecondary} 
                              />
                            )}
                          </TouchableOpacity>
                          <Text style={styles.stockQtyNum}>{displayQty}</Text>
                          <TouchableOpacity
                            style={[styles.stockBtn, styles.stockBtnPlus]}
                            onPress={() => updateProductQuantity(p, p.quantity + 1)}
                            disabled={updatingProductId === p.id || !selectedStore?.is_active}
                          >
                            {updatingProductId === p.id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Ionicons 
                                name="add" 
                                size={18} 
                                color={!selectedStore?.is_active ? colors.textDisabled : colors.primary} 
                              />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  {storeProducts.length > 20 && (
                    <Text style={styles.stockShowingText}>
                      Showing 20 of {storeProducts.length} products
                    </Text>
                  )}
                </View>
              )}
            </View>
            {orders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Waiting for orders</Text>
                <Text style={styles.emptyText}>New orders will appear automatically</Text>
              </View>
            ) : (
              orders.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={styles.orderRow}
                  onPress={() => openOrderDetails(o.id)}
                >
                  <Text style={styles.orderCode}>#{o.order_code}</Text>
                  <Text style={styles.orderStatus}>{o.status}</Text>
                </TouchableOpacity>
              ))
            )}
          </>
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

function Tab({ label, active, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && { color: colors.surface }]}>
        {label}
      </Text>
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

  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  tab: { alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: 19 },
  tabActive: { backgroundColor: colors.primary, borderRadius: radius.full },
  tabText: { color: colors.textTertiary, fontSize: 12, fontWeight: "600" },

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
  stockItemQty: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  stockControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stockBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stockBtnMinus: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  stockBtnPlus: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  stockQtyNum: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    minWidth: 32,
    textAlign: "center",
  },
  stockShowingText: {
    color: colors.textTertiary,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.sm,
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
});