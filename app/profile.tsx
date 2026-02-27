import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getSession, clearSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [storeInfo, setStoreInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSession();
        if (!s?.token) {
          router.replace("/landing");
          return;
        }
        setSession(s);

        const userId = s.user?.id;
        const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const raw = await res.text();
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        if (json?.stores?.length) {
          setStoreInfo(json.stores[0]);
        }
      } catch (err) {
        console.warn("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          router.replace("/landing");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <InfoRow label="Name" value={session?.user?.name || "N/A"} />
          <InfoRow label="Phone" value={session?.user?.phone || "N/A"} />
          <InfoRow label="Email" value={session?.user?.email || "Not provided"} />
          <InfoRow label="Role" value={session?.user?.role || "shopkeeper"} />
          <InfoRow
            label="Account Status"
            value={session?.user?.isActivated ? "Active" : "Inactive"}
          />
        </View>

        {storeInfo && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Store Information</Text>
            <InfoRow label="Store Name" value={storeInfo.name || "N/A"} />
            <InfoRow
              label="Address"
              value={storeInfo.address || "Not provided"}
            />
            <InfoRow
              label="Delivery Radius"
              value={`${storeInfo.delivery_radius_km || 0} km`}
            />
            <InfoRow
              label="Status"
              value={storeInfo.is_active ? "Online" : "Offline"}
            />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>App Information</Text>
          <InfoRow label="API Base" value={API_BASE} />
          <InfoRow label="User ID" value={session?.user?.id || "N/A"} />
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.md,
  },
  container: { padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  backBtn: { paddingVertical: 8, paddingRight: 12, marginBottom: spacing.sm },
  backBtnText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  logoutBtn: {
    backgroundColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  logoutBtnText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
});
