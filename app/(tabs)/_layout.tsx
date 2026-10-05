import React, { useEffect } from "react";
import { BackHandler, Platform, View, ActivityIndicator, StyleSheet } from "react-native";
import { Tabs, useSegments, useRouter, usePathname } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, spacing } from "../../lib/theme";
import { setToastBottomOffset } from "../../components/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IncomingOrdersProvider, useIncomingOrdersCount } from "../../lib/incomingOrdersContext";
import { useStoreApprovalGate } from "../../lib/useStoreApprovalGate";
import { IncomingOrderAlertHost } from "../../components/IncomingOrderAlertHost";

// Pre-redesign Orders badge colour.
const ORDERS_BADGE_ORANGE = "#FF9800";

function TabsNavigator() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const { incomingCount } = useIncomingOrdersCount();
  const { checking } = useStoreApprovalGate("require-approved");
  // Whether the (tabs) route is the top of the root Stack. A pushed stack
  // screen keeps the tabs mounted underneath, so this — not mount state —
  // decides whether toasts should clear the tab bar.
  const tabsFocused = useIsFocused();
  const tabBarHeight = layout.tabBarHeight + insets.bottom;

  useEffect(() => {
    if (!tabsFocused || checking) return;
    setToastBottomOffset(tabBarHeight);
    return () => setToastBottomOffset(0);
  }, [tabsFocused, checking, tabBarHeight]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const inTabs = segments[0] === "(tabs)";
      if (!inTabs) return false; // let Stack handle back for non-tab screens

      // If on the Home tab, let Android handle it (minimize app)
      if (pathname === "/home" || pathname === "/(tabs)/home") return false;

      // On any other tab, navigate back to Home tab
      router.replace("/(tabs)/home");
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, pathname]);

  if (checking) {
    return (
      <View style={styles.gate}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        // Pre-redesign look: no top border, flat.
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          elevation: 0,
          height: tabBarHeight,
          paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm,
          paddingTop: spacing.sm,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginBottom: Platform.OS === "ios" ? 0 : spacing.xs,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={iconSize.lg} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="previous-orders"
        options={{
          title: "Orders",
          tabBarBadge: incomingCount > 0 ? incomingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: ORDERS_BADGE_ORANGE, color: colors.onPrimary, fontSize: 10, fontWeight: "700", minWidth: 18, height: 18 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "receipt" : "receipt-outline"} size={iconSize.lg} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payouts",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={iconSize.lg} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "cube" : "cube-outline"} size={iconSize.lg} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <IncomingOrdersProvider>
      <TabsNavigator />
      {/* Full-screen ringing Accept/Reject popup for new orders. Lives here,
          not in a screen, so it fires whichever tab or pushed screen is up. */}
      <IncomingOrderAlertHost />
    </IncomingOrdersProvider>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
