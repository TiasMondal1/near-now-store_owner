import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Allocation } from "../hooks/useOrders";

const CARD = "#120D24";
const BORDER = "#392B6A";
const PRIMARY = "#765fba";
const DANGER = "#E54848";
const MUTED = "#9C94D7";

export default function IncomingOrderPopup({
  visible,
  alloc,
  countdown,
  onAccept,
  onReject,
}: {
  visible: boolean;
  alloc: Allocation | null;
  countdown: number;
  onAccept: (acceptedItemIds: string[]) => void;
  onReject: () => void;
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() =>
    new Set(alloc?.items.map((i) => i.id) ?? [])
  );

  // Reset checkboxes when a new alloc comes in
  React.useEffect(() => {
    setCheckedIds(new Set(alloc?.items.map((i) => i.id) ?? []));
  }, [alloc?.allocation_id]);

  if (!alloc) return null;

  const toggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCount = checkedIds.size;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>New Order</Text>
              <Text style={styles.orderCode}>#{alloc.order_code}</Text>
            </View>
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={14} color={countdown <= 10 ? DANGER : MUTED} />
              <Text style={[styles.countdownText, countdown <= 10 && styles.countdownUrgent]}>
                {countdown}s
              </Text>
            </View>
          </View>

          {alloc.customer_distance && (
            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={14} color={MUTED} />
              <Text style={styles.distanceText}>
                {alloc.customer_distance} · {alloc.customer_area ?? ""}
              </Text>
            </View>
          )}

          {/* Items — check off any unavailable ones */}
          <Text style={styles.sectionLabel}>
            Mark items you CAN fulfil ({selectedCount}/{alloc.items.length})
          </Text>

          <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
            {alloc.items.map((item) => {
              const checked = checkedIds.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => toggle(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={[styles.itemName, !checked && styles.itemNameStrike]}>
                    {item.quantity}{item.unit ? ` ${item.unit}` : ""} — {item.product_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.reject]} onPress={onReject}>
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.accept, selectedCount === 0 && styles.disabled]}
              onPress={() => onAccept(Array.from(checkedIds))}
              disabled={selectedCount === 0}
            >
              <Text style={styles.btnText}>
                Accept{selectedCount < alloc.items.length ? ` (${selectedCount})` : ""}
              </Text>
            </TouchableOpacity>
          </View>

          {selectedCount < alloc.items.length && selectedCount > 0 && (
            <Text style={styles.partialHint}>
              Unchecked items will be reassigned to another store
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxHeight: "80%",
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerLeft: { flex: 1 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  orderCode: { color: MUTED, fontSize: 13, marginTop: 2 },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1E1535",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: BORDER,
  },
  countdownText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  countdownUrgent: { color: DANGER },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  distanceText: { color: MUTED, fontSize: 12 },
  sectionLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemsList: { maxHeight: 200, marginBottom: 14 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER + "60",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  itemName: { color: "#fff", fontSize: 14, flex: 1 },
  itemNameStrike: { color: MUTED, textDecorationLine: "line-through" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: "center",
  },
  accept: { backgroundColor: PRIMARY },
  reject: { backgroundColor: DANGER },
  disabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  partialHint: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
});
