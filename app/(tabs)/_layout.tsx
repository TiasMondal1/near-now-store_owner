import React, { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HomeTab from "./home";
import PreviousOrdersTab from "./previous-orders";
import PaymentsTab from "./payments";
import StockTab from "./stock";

const Tab = createBottomTabNavigator();

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const inTabs = segments[0] === "(tabs)";
      if (inTabs && segments.length <= 2) return true;
      return false;
    });
    return () => sub.remove();
  }, [segments]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // lazy: first render only happens when tab is first visited
        lazy: true,
        // unmountOnBlur defaults to false — screens stay mounted after first visit,
        // preventing data refetch on every tab switch. No explicit override needed.
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginBottom: Platform.OS === "ios" ? 0 : 4,
        },
      }}
    >
      <Tab.Screen
        name="home"
        component={HomeTab}
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="previous-orders"
        component={PreviousOrdersTab}
        options={{
          title: "Orders",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="payments"
        component={PaymentsTab}
        options={{
          title: "Payouts",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="stock"
        component={StockTab}
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
