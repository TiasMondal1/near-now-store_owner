import React, { memo, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadows } from "../lib/theme";

type StoreRow = { id: string; name: string; address: string | null; delivery_radius_km: number; is_active: boolean };
type Props = { store: StoreRow; isOnline: boolean; activeOrderCount: number; onToggle: (value: boolean) => void; loading?: boolean };

export const StoreStatusCard = memo(function StoreStatusCard({ store, isOnline, activeOrderCount, onToggle, loading = false }: Props) {
  const animVal = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animVal, { toValue: isOnline ? 1 : 0, duration: 300, useNativeDriver: false }).start();
  }, [isOnline]);

  const bgColor = animVal.interpolate({ inputRange: [0, 1], outputRange: ["#FEF2F2", "#F0F9F1"] });
  const borderColor = animVal.interpolate({ inputRange: [0, 1], outputRange: [colors.error + "30", colors.primary + "30"] });

  return (
    <Animated.View style={[styles.card, { backgroundColor: bgColor, borderColor }]}>
      {/* Store info */}
      <View style={styles.storeRow}>
        <View style={[styles.iconBox, { backgroundColor: isOnline ? colors.primaryBg : colors.background }]}>
          <Ionicons name="storefront" size={20} color={isOnline ? colors.primary : colors.textTertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
            <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
            <Text style={styles.storeAddress} numberOfLines={1}>{store.address || "No address set"}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: isOnline ? colors.primary + "15" : colors.error + "12" }]} />

      {/* Status + action */}
      <View style={styles.statusRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.error }]} />
            <Text style={[styles.statusTitle, { color: isOnline ? colors.primary : colors.error }]}>
              {isOnline ? "You're Online" : "You're Offline"}
            </Text>
          </View>
          <Text style={styles.statusSub}>
            {isOnline ? (activeOrderCount > 0 ? `${activeOrderCount} active order${activeOrderCount > 1 ? "s" : ""}` : "Waiting for orders...") : "Go online to receive orders"}
          </Text>
        </View>

        <TouchableOpacity
          style={isOnline ? styles.goOfflineBtn : styles.goOnlineBtn}
          onPress={() => onToggle(!isOnline)}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator size="small" color={isOnline ? colors.error : "#fff"} /> : (
            <Text style={isOnline ? styles.goOfflineBtnText : styles.goOnlineBtnText}>
              {isOnline ? "Go Offline" : "Go Online"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Delivery radius */}
      {store.delivery_radius_km > 0 && (
        <View style={styles.radiusRow}>
          <Ionicons name="navigate-circle-outline" size={12} color={colors.textTertiary} />
          <Text style={styles.radiusText}>{store.delivery_radius_km} km delivery radius</Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1.5, marginBottom: spacing.lg, ...shadows.sm },
  storeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  storeName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  storeAddress: { color: colors.textTertiary, fontSize: 12, flex: 1 },
  divider: { height: 1, marginHorizontal: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTitle: { fontSize: 15, fontWeight: "700" },
  statusSub: { color: colors.textSecondary, fontSize: 12, marginLeft: 16 },
  goOnlineBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", ...shadows.sm },
  goOnlineBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  goOfflineBtn: { backgroundColor: colors.error + "10", borderWidth: 1, borderColor: colors.error + "30", paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.md, alignItems: "center" },
  goOfflineBtnText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, marginTop: -spacing.sm },
  radiusText: { color: colors.textTertiary, fontSize: 11 },
});
