import React, { memo, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { triggerHaptic } from "./ui";
import { colors, radius, spacing, shadows } from "../lib/theme";

type StoreRow = { id: string; name: string; address: string | null; delivery_radius_km: number; is_active: boolean };
type Props = {
  store: StoreRow;
  isOnline: boolean;
  activeOrderCount: number;
  onToggle: (value: boolean) => void;
  /** Spinner replaces the button label while a toggle is in flight. */
  loading?: boolean;
  pendingApproval?: boolean;
};

// Amber "pending" palette — literal hexes kept for fidelity with the pre-redesign card.
const PENDING_BG = "#FFFBEB";
const PENDING_BORDER = "#F59E0B40";
const PENDING_TINT = "#FEF3C7";
const PENDING_TEXT = "#92400E";
const PENDING_ACCENT = "#D97706";
const PENDING_DOT = "#F59E0B";
const PENDING_DIVIDER = "#F59E0B20";
const OFFLINE_BG = "#FEF2F2";

/**
 * Home's hero card. Tinted surface that animates between the offline (red)
 * and online (green) palettes; amber while the store awaits approval.
 */
export const StoreStatusCard = memo(function StoreStatusCard({
  store,
  isOnline,
  activeOrderCount,
  onToggle,
  loading = false,
  pendingApproval = false,
}: Props) {
  const animVal = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animVal, { toValue: isOnline ? 1 : 0, duration: 300, useNativeDriver: false }).start();
  }, [isOnline, animVal]);

  const bgColor = pendingApproval
    ? PENDING_BG
    : animVal.interpolate({ inputRange: [0, 1], outputRange: [OFFLINE_BG, colors.primaryBg] });
  const borderColor = pendingApproval
    ? PENDING_BORDER
    : animVal.interpolate({ inputRange: [0, 1], outputRange: [colors.error + "30", colors.primary + "30"] });

  const handlePress = () => {
    if (pendingApproval || loading) return;
    // The redesign's Button carried a light haptic on tap; keep it.
    triggerHaptic("light");
    onToggle(!isOnline);
  };

  return (
    <Animated.View style={[styles.card, { backgroundColor: bgColor, borderColor }]}>
      {/* Pending approval banner */}
      {pendingApproval && (
        <View style={styles.pendingBanner}>
          <Ionicons name="time-outline" size={14} color={PENDING_TEXT} />
          <Text style={styles.pendingBannerText}>Pending document verification — your shop is hidden from customers</Text>
        </View>
      )}

      {/* Store info */}
      <View style={styles.storeRow}>
        <View style={[styles.iconBox, { backgroundColor: pendingApproval ? PENDING_TINT : isOnline ? colors.primaryBg : colors.background }]}>
          <Ionicons name="storefront" size={20} color={pendingApproval ? PENDING_ACCENT : isOnline ? colors.primary : colors.textTertiary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.storeName} numberOfLines={1}>
            {store.name}
          </Text>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
            <Text style={styles.storeAddress} numberOfLines={1}>
              {store.address || "No address set"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: pendingApproval ? PENDING_DIVIDER : isOnline ? colors.primary + "15" : colors.error + "12" }]} />

      {/* Status + action */}
      <View style={styles.statusRow}>
        <View style={styles.statusText}>
          <View style={styles.statusTitleRow}>
            <View style={[styles.dot, { backgroundColor: pendingApproval ? PENDING_DOT : isOnline ? colors.success : colors.error }]} />
            <Text style={[styles.statusTitle, { color: pendingApproval ? PENDING_ACCENT : isOnline ? colors.primary : colors.error }]}>
              {pendingApproval ? "Awaiting Approval" : isOnline ? "You're Online" : "You're Offline"}
            </Text>
          </View>
          <Text style={styles.statusSub}>
            {pendingApproval
              ? "Upload and verify documents before going online"
              : isOnline
                ? activeOrderCount > 0
                  ? `${activeOrderCount} active order${activeOrderCount > 1 ? "s" : ""}`
                  : "Waiting for orders..."
                : "Go online to receive orders"}
          </Text>
        </View>

        <TouchableOpacity
          style={pendingApproval ? styles.pendingBtn : isOnline ? styles.goOfflineBtn : styles.goOnlineBtn}
          onPress={handlePress}
          disabled={loading || pendingApproval}
          activeOpacity={pendingApproval ? 1 : 0.8}
          accessibilityRole="button"
          accessibilityLabel={pendingApproval ? "Pending approval" : isOnline ? "Go offline" : "Go online"}
          accessibilityHint={
            pendingApproval
              ? "Available once your documents are verified"
              : isOnline
                ? "Hides your store from customers"
                : "Makes your store visible to customers"
          }
          accessibilityState={{ disabled: loading || pendingApproval, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={isOnline ? colors.error : colors.onPrimary} />
          ) : (
            <Text style={pendingApproval ? styles.pendingBtnText : isOnline ? styles.goOfflineBtnText : styles.goOnlineBtnText}>
              {pendingApproval ? "Pending" : isOnline ? "Go Offline" : "Go Online"}
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
  card: { borderRadius: radius.lg, borderWidth: 1.5, ...shadows.sm },
  flex: { flex: 1 },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PENDING_TINT,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  pendingBannerText: { color: PENDING_TEXT, fontSize: 12, fontWeight: "600", flex: 1 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  storeName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  storeAddress: { color: colors.textTertiary, fontSize: 12, flex: 1 },
  divider: { height: 1, marginHorizontal: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  statusText: { flex: 1, gap: 4 },
  statusTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTitle: { fontSize: 15, fontWeight: "700" },
  statusSub: { color: colors.textSecondary, fontSize: 12, marginLeft: 16 },
  goOnlineBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", ...shadows.sm },
  goOnlineBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: "700" },
  goOfflineBtn: {
    backgroundColor: colors.error + "10",
    borderWidth: 1,
    borderColor: colors.error + "30",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  goOfflineBtnText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  pendingBtn: {
    backgroundColor: PENDING_TINT,
    borderWidth: 1,
    borderColor: PENDING_BORDER,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  pendingBtnText: { color: PENDING_ACCENT, fontSize: 13, fontWeight: "600" },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, marginTop: -spacing.sm },
  radiusText: { color: colors.textTertiary, fontSize: 11 },
});

export default StoreStatusCard;
