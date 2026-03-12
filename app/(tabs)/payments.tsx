import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import { config } from "../../lib/config";
import { colors, radius, spacing } from "../../lib/theme";

const API_BASE = config.API_BASE;

export default function PaymentsTab() {
  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) return router.replace("/landing");

      setSession(s);
      
      const userId = s.user?.id;
      const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      const stores = json?.stores || [];
      
      if (stores[0]) {
        setStoreId(stores[0].id);
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="cash-outline" size={24} color={colors.primary} />
            <View>
              <Text style={styles.brand}>Payouts</Text>
              <Text style={styles.subtitle}>Financial Overview</Text>
            </View>
          </View>
        </View>

        <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No payouts yet</Text>
            <Text style={styles.emptyText}>
              Payouts from Near&Now will appear here once they're processed.
            </Text>
          </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    alignItems: "center",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: -2,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { 
    color: colors.textPrimary, 
    fontSize: 16, 
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  emptyText: { 
    color: colors.textTertiary, 
    fontSize: 13, 
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
});
