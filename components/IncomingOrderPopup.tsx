import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
} from "react-native";

const BG = "#05030A";
const CARD = "#120D24";
const BORDER = "#392B6A";
const PRIMARY = "#765fba";
const DANGER = "#E54848";

export default function IncomingOrderPopup({
  visible,
  order,
  onAccept,
  onReject,
}: {
  visible: boolean;
  order: any;
  onAccept: () => void;
  onReject: () => void;
}) {
  if (!order) return null;

  const item = order.order_items?.[0];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>New order received</Text>

          <View style={styles.productRow}>
            <Image
              source={{ uri: item?.products?.image_url }}
              style={styles.image}
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>
                {item?.product_name}
              </Text>
              <Text style={styles.qty}>
                Quantity: {item?.quantity}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.reject]}
              onPress={onReject}
            >
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.accept]}
              onPress={onAccept}
            >
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "88%",
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
    textAlign: "center",
  },
  productRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#222",
  },
  productName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  qty: {
    color: "#9C94D7",
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  accept: {
    backgroundColor: PRIMARY,
  },
  reject: {
    backgroundColor: DANGER,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
