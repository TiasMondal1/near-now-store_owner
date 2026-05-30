import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getSession, clearSession } from "../session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, radius, spacing, shadows } from "../lib/theme";

const BRAND_LOGO = require("../near_now_shopkeeper.png");

export default function LandingScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (session?.user?.role === "customer") {
        Alert.alert("Wrong Account Type", "You're logged in as a customer. This is the Store Owner app.", [
          { text: "Clear & Retry", onPress: async () => { await clearSession(); await AsyncStorage.removeItem("inventory_persisted_state"); await AsyncStorage.removeItem("inventory_products_cache"); setChecking(false); } },
          { text: "Cancel", onPress: () => setChecking(false) },
        ]);
        return;
      }
      if (session?.token && session?.user?.id) { router.replace("/(tabs)/home"); }
      else { setChecking(false); }
    })();
  }, []);

  useEffect(() => {
    if (!checking) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [checking]);

  if (checking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.topSection}>
          <View style={styles.logoWrap}>
            <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.appTag}>Near&Now</Text>
          <Text style={styles.title}>Welcome back,{"\n"}Shopkeeper</Text>
          <Text style={styles.subtitle}>
            Manage orders, inventory and payouts — all in one place.
          </Text>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/App")} activeOpacity={0.85}>
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace("/App")} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Register new store</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Phone & OTP verification only</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: 56, paddingBottom: spacing.xl, justifyContent: "space-between" },
  topSection: { gap: spacing.md },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  logo: { width: 48, height: 48 },
  appTag: { fontSize: 14, color: colors.primary, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", color: colors.textPrimary, lineHeight: 36 },
  subtitle: { fontSize: 15, color: colors.textSecondary, lineHeight: 23 },
  buttons: { gap: spacing.md },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    ...shadows.md,
  },
  primaryButtonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.md,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.primary + "20",
  },
  secondaryButtonText: { fontSize: 16, fontWeight: "600", color: colors.primary },
  footer: { fontSize: 12, color: colors.textTertiary, textAlign: "center" },
});
