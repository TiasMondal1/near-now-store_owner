import React, { memo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../lib/theme";

type StoreRow = {
  id: string;
  name: string;
  address: string | null;
  delivery_radius_km: number;
  is_active: boolean;
};

type Props = {
  store: StoreRow;
  isOnline: boolean;
  activeOrderCount: number;
  onToggle: (value: boolean) => void;
  loading?: boolean;
};

export const StoreStatusCard = memo(function StoreStatusCard({
  store,
  isOnline,
  activeOrderCount,
  onToggle,
  loading = false,
}: Props) {
  const animVal = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: isOnline ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [isOnline]);

  const bgColor = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: ["#FEF3F2", "#F0FDF4"],
  });

  const borderColor = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.error + "50", colors.success + "55"],
  });

  return (
    <Animated.View style={[styles.card, { backgroundColor: bgColor, borderColor }]}>
      {/* Store info row */}
      <View style={styles.storeRow}>
        <View style={[styles.iconBox, isOnline ? styles.iconBoxOnline : styles.iconBoxOffline]}>
          <Ionicons
            name="storefront"
            size={20}
            color={isOnline ? colors.primary : colors.textSecondary}
          />
        </View>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName} numberOfLines={1}>
            {store.name}
          </Text>
          <Text style={styles.storeAddress} numberOfLines={2}>
            {store.address || "No address set"}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View
        style={[
          styles.divider,
          isOnline ? styles.dividerOnline : styles.dividerOffline,
        ]}
      />

      {/* Status + action row */}
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={styles.statusTitleRow}>
            <View
              style={[
                styles.statusDot,
                isOnline ? styles.dotOnline : styles.dotOffline,
              ]}
            />
            <Text
              style={[
                styles.statusTitle,
                isOnline ? styles.titleOnline : styles.titleOffline,
              ]}
            >
              {isOnline ? "You're Online" : "You're Offline"}
            </Text>
          </View>
          <Text style={styles.statusSub}>
            {isOnline
              ? activeOrderCount > 0
                ? `${activeOrderCount} active order${activeOrderCount > 1 ? "s" : ""}`
                : "Waiting for new orders..."
              : "Go online to receive orders"}
          </Text>
        </View>

        {isOnline ? (
          <TouchableOpacity
            style={styles.goOfflineBtn}
            onPress={() => onToggle(false)}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.goOfflineBtnText}>Go Offline</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.goOnlineBtn}
            onPress={() => onToggle(true)}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.goOnlineBtnText}>Go Online</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconBoxOnline: {
    backgroundColor: colors.success + "22",
  },
  iconBoxOffline: {
    backgroundColor: colors.surfaceVariant,
  },
  storeInfo: {
    flex: 1,
    minWidth: 0,
  },
  storeName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  storeAddress: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  dividerOnline: {
    backgroundColor: colors.success + "25",
  },
  dividerOffline: {
    backgroundColor: colors.error + "18",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  statusLeft: {
    flex: 1,
    gap: 4,
  },
  statusTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: colors.success,
  },
  dotOffline: {
    backgroundColor: colors.error,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  titleOnline: {
    color: colors.success,
  },
  titleOffline: {
    color: colors.error,
  },
  statusSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginLeft: 14,
  },
  goOnlineBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 96,
    alignItems: "center",
    flexShrink: 0,
  },
  goOnlineBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  goOfflineBtn: {
    backgroundColor: colors.error + "12",
    borderWidth: 1,
    borderColor: colors.error + "45",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 96,
    alignItems: "center",
    flexShrink: 0,
  },
  goOfflineBtnText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "600",
  },
});
