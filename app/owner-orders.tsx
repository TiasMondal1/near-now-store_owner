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


const API_BASE = "http://192.168.1.117:3001";

const BG = "#07050F";
const CARD = "#141027";
const BORDER = "#2E255A";
const PRIMARY = "#8B7CFF";
const MUTED = "#9C94D7";

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
      const json = await res.json();
      setOrders(json.orders || []);
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

    const json = await res.json();
    if (json.success) setSelectedOrder(json.order);

    setDetailsLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Orders</Text>

        {loading ? (
          <ActivityIndicator color={PRIMARY} />
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
              <ActivityIndicator color={PRIMARY} />
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
  safe: { flex: 1, backgroundColor: BG },
  container: { padding: 20 },

  title: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
  },

  empty: { color: MUTED },

  orderCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  orderCode: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  status: { color: PRIMARY, fontSize: 12, marginTop: 4 },
  meta: { color: MUTED, fontSize: 11, marginTop: 2 },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "92%",
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },

  modalCode: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  modalStatus: {
    color: PRIMARY,
    textAlign: "center",
    marginBottom: 10,
  },

  section: {
    color: MUTED,
    marginTop: 12,
    fontSize: 12,
  },
  text: { color: "#FFF", fontSize: 13 },

  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  itemName: { color: "#FFF" },
  itemQty: { color: MUTED },

  total: {
    color: "#FFF",
    fontWeight: "700",
    marginTop: 14,
    textAlign: "right",
  },

  closeBtn: {
    marginTop: 16,
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  closeText: { color: "#FFF", fontWeight: "700" },
});
