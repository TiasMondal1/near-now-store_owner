import React, { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { Tabs, useSegments, useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IncomingOrdersProvider, useIncomingOrdersCount } from "../../lib/incomingOrdersContext";

function TabsNavigator() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const { incomingCount } = useIncomingOrdersCount();

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
  }, [segments, pathname]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          elevation: 0,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginBottom: Platform.OS === "ios" ? 0 : 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="previous-orders"
        options={{
          title: "Orders",
          tabBarBadge: incomingCount > 0 ? incomingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#FF9800", fontSize: 10, fontWeight: "700", minWidth: 18, height: 18 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "receipt" : "receipt-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payouts",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "cube" : "cube-outline"} size={22} color={color} />
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
    </IncomingOrdersProvider>
  );
}
