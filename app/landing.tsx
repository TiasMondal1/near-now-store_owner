import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { getSession, clearSession } from "../session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, radius, spacing } from "../lib/theme";

export default function LandingScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      console.log("[landing] Checking for existing session...");
      const session = await getSession();
      console.log("[landing] Session check result:", {
        exists: !!session,
        hasToken: !!session?.token,
        hasUserId: !!session?.user?.id,
        userRole: session?.user?.role,
      });
      
      // CRITICAL: Store Owner app should NEVER have a customer session
      if (session?.user?.role === "customer") {
        console.error("[landing] ❌ WRONG SESSION TYPE: customer session in store owner app!");
        Alert.alert(
          "Wrong Account Type",
          "You're logged in as a customer, but this is the Store Owner app. Please clear the session and log in with your shopkeeper account.",
          [
            {
              text: "Clear & Retry",
              onPress: async () => {
                await clearSession();
                await AsyncStorage.removeItem("inventory_persisted_state");
                await AsyncStorage.removeItem("inventory_products_cache");
                setChecking(false);
              },
            },
            { text: "Cancel", onPress: () => setChecking(false) },
          ]
        );
        return;
      }
      
      if (session?.token && session?.user?.id) {
        console.log("[landing] ✅ Valid session found, redirecting to dashboard");
        router.replace("/owner-home");
      } else {
        console.log("[landing] No valid session, showing login screen");
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Checking session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <Text style={styles.appTag}>Near&Now · Shopkeeper</Text>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>
            Manage orders, inventory and availability for your store.
          </Text>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/App")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Login</Text>
            <Text style={styles.primaryHint}>Use your phone number & OTP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/App")}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>New store</Text>
            <Text style={styles.secondaryHint}>Set up your store (phone + OTP)</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Same verification as the main Near&Now app — phone & OTP only.
        </Text>

        {__DEV__ && (
          <TouchableOpacity
            style={styles.devButton}
            onPress={async () => {
              Alert.alert(
                "Clear All Cache",
                "This will clear session, inventory, and all cached data. You'll need to log in again.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                      await clearSession();
                      await AsyncStorage.removeItem("inventory_persisted_state");
                      await AsyncStorage.removeItem("inventory_products_cache");
                      Alert.alert("Success", "All cache cleared. Please reload the app.");
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.devButtonText}>🧹 Clear Cache (Dev)</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 48,
    paddingBottom: spacing.xl,
    justifyContent: "space-between",
  },
  topSection: {
    gap: spacing.sm,
  },
  appTag: {
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  buttons: {
    gap: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    borderWidth: 0,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.surface,
  },
  primaryHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    marginTop: 4,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  secondaryHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  footer: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 16,
  },
  devButton: {
    backgroundColor: "#ff4444",
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignItems: "center",
  },
  devButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
});
