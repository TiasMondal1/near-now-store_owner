import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;

export default function OwnerOrdersScreen({ storeId }: { storeId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) return;
      setToken(s.token);
      fetchOrders(s.token);
    })();
  }, []);

  const fetchOrders = async (jwt: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/orders`,
        {
          headers: { Authorization: `Bearer ${jwt}` },
        }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
      setOrders(json?.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const openOrderDetails = async (orderId: string) => {
    if (!token) return;

    setDetailsLoading(true);
    setSelectedOrder(null);

    const res = await fetch(
      `${API_BASE}/store-owner/orders/${orderId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (json?.success) setSelectedOrder(json.order);

    setDetailsLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Orders</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : orders.length === 0 ? (
          <Text style={styles.empty}>No orders yet</Text>
        ) : (
          orders.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={styles.orderCard}
              onPress={() => openOrderDetails(o.id)}
            >
              <Text style={styles.orderCode}>#{o.order_code}</Text>
              <Text style={styles.status}>{o.status}</Text>
              <Text style={styles.meta}>
                {new Date(o.placed_at).toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={!!selectedOrder || detailsLoading} transparent>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {detailsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.modalCode}>
                  #{selectedOrder.order_code}
                </Text>

                <Text style={styles.modalStatus}>
                  Status: {selectedOrder.status}
                </Text>

                <Text style={styles.section}>Delivery Address</Text>
                <Text style={styles.text}>
                  {selectedOrder.delivery_address}
                </Text>

                <Text style={styles.section}>Items</Text>
                {selectedOrder.order_items.map((i: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {i.product_name}
                    </Text>
                    <Text style={styles.itemQty}>
                      {i.quantity} {i.unit}
                    </Text>
                  </View>
                ))}

                <Text style={styles.total}>
                  Total: ₹{selectedOrder.total_amount}
                </Text>

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setSelectedOrder(null)}
                >
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },

  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: spacing.md,
  },

  empty: { color: colors.textTertiary },

  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  orderCode: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  status: { color: colors.primary, fontSize: 12, marginTop: 4 },
  meta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "92%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalCode: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  modalStatus: {
    color: colors.primary,
    textAlign: "center",
    marginBottom: 10,
  },

  section: {
    color: colors.textTertiary,
    marginTop: spacing.md,
    fontSize: 12,
  },
  text: { color: colors.textPrimary, fontSize: 13 },

  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  itemName: { color: colors.textPrimary },
  itemQty: { color: colors.textTertiary },

  total: {
    color: colors.textPrimary,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "right",
  },

  closeBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  closeText: { color: colors.surface, fontWeight: "700" },
});
