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
import { getStockListFromDb } from "../lib/storeProducts";

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

  const [storeProducts, setStoreProducts] = useState<Array<{ id: string; name: string; quantity: number }>>([]);
  const [storeProductsLoading, setStoreProductsLoading] = useState(false);

  const [exportError, setExportError] = useState<string | null>(null);


  const selectedStore = stores[0];

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
      setLoading(false);
    })();
  }, []);


  useEffect(() => {
    if (!session || !selectedStore) return;

    fetchOrders();
    fetchStoreProducts();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [session, selectedStore]);

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
        const out = list
          .map((x: any) => ({
            id: x.id,
            name: x.name || "Product",
            quantity: Number(x.quantity ?? 0),
          }))
          .sort((a: any, b: any) => (b.quantity ?? 0) - (a.quantity ?? 0));
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
          }))
          .sort((a: any, b: any) => (b.quantity ?? 0) - (a.quantity ?? 0));
        setStoreProducts(out);
        return true;
      } catch {
        return false;
      }
    };

    try {
      const [cacheRaw, arrayCacheRaw] = await Promise.all([
        AsyncStorage.getItem(INVENTORY_PERSISTED_KEY),
        AsyncStorage.getItem(INVENTORY_CACHE_KEY),
      ]);
      const fromCache = applyInventoryCache(cacheRaw) || applyProductsArrayCache(arrayCacheRaw);

      const fromDb = await getStockListFromDb(selectedStore.id);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        setStoreProducts(fromDb);
        if (!silent) setStoreProductsLoading(false);
        return;
      }

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
      const res = await fetch(`${API_BASE}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        // HTML or non-JSON response
      }
      setStores(json?.stores || []);
    } catch {
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

    await fetch(`${API_BASE}/store-owner/stores/${selectedStore.id}/online`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_active: value }),
    });

    fetchStores(session.token);
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
          <View>
            <Text style={styles.brand}>Near&Now</Text>
            <Text style={styles.subtitle}>Store Dashboard</Text>
          </View>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
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
          <View style={styles.storeCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeName}>{selectedStore.name}</Text>
              <Text style={styles.storeAddress}>
                {selectedStore.address || "No address"}
              </Text>
              <Text style={styles.storeMeta}>
                Delivery · {selectedStore.delivery_radius_km} km
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.switchLabel}>
                {selectedStore.is_active ? "Online" : "Offline"}
              </Text>
              <Switch
                value={selectedStore.is_active}
                onValueChange={toggleOnline}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFF"
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
              <Text style={styles.stockTitle}>Your stock (quantity stored)</Text>
              {storeProductsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
              ) : storeProducts.length === 0 ? (
                <Text style={styles.stockEmpty}>No products in inventory yet. Add from Inventory or Catalog.</Text>
              ) : (
                storeProducts.map((p) => (
                  <View key={p.id} style={styles.stockRow}>
                    <Text style={styles.stockName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.stockQty}>Qty: {p.quantity}</Text>
                  </View>
                ))
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

  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  brand: { color: colors.textPrimary, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.textTertiary, fontSize: 11 },
  logout: { color: colors.primary, fontSize: 12, fontWeight: "600" },

  storeCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  storeName: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  storeAddress: { color: colors.textSecondary, fontSize: 12 },
  storeMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 6 },
  switchLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },

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
  },
  stockTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: spacing.sm },
  stockEmpty: { color: colors.textTertiary, fontSize: 12 },
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stockName: { color: colors.textPrimary, fontSize: 13, flex: 1 },
  stockQty: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginLeft: spacing.sm },

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