import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { isGarbageEmail, normalizeSignupEmail } from "../lib/emailForApi";
import { normalizeToShopkeeperRole } from "../lib/shopkeeperRole";
import { getSession, clearSession } from "../session";
import { colors, radius, spacing } from "../lib/theme";
import { fetchStoresCached, peekStores } from "../lib/appCache";

function accountEmailLabel(session: { user?: { email?: string } } | null, store: { email?: string } | null): string {
  const u = normalizeSignupEmail(session?.user?.email ?? "");
  const st = normalizeSignupEmail(store?.email ?? "");
  if (u && !isGarbageEmail(u)) return u;
  if (st && !isGarbageEmail(st)) return st;
  return "Not provided";
}

export default function ProfileScreen() {
  const [session, setSession] = useState<any>(null);
  const [storeInfo, setStoreInfo] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const s = await getSession();
      if (!s?.token) { router.replace("/landing"); return; }
      if (cancelled) return;
      setSession(s);

      // Show cached store info instantly
      const cached = peekStores();
      if (cached?.length) {
        setStoreInfo(cached[0]);
        // Background refresh
        fetchStoresCached(s.token, s.user?.id).then((fresh) => {
          if (!cancelled && fresh.length) setStoreInfo(fresh[0]);
        });
      } else {
        // Cold: fetch without blocking UI
        fetchStoresCached(s.token, s.user?.id).then((stores) => {
          if (!cancelled && stores.length) setStoreInfo(stores[0]);
        });
      }
    })();

    return () => { cancelled = true; };
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <InfoRow label="Name" value={session?.user?.name || "N/A"} />
          <InfoRow label="Phone" value={session?.user?.phone || "N/A"} />
          <InfoRow label="Email" value={accountEmailLabel(session, storeInfo)} />
          <InfoRow label="Role" value={normalizeToShopkeeperRole(session?.user?.role)} />
          <InfoRow
            label="Account Status"
            value={session?.user?.isActivated ? "Active" : "Inactive"}
          />
        </View>

        {storeInfo && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Store Information</Text>
            <InfoRow label="Store Name" value={storeInfo.name || "N/A"} />
            <InfoRow label="Address" value={storeInfo.address || "Not provided"} />
            <InfoRow label="Status" value={storeInfo.is_active ? "Online" : "Offline"} />
          </View>
        )}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
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
  container: { padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  backBtn: { paddingVertical: 8, paddingRight: 12, marginBottom: spacing.sm },
  backBtnText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
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
  infoLabel: { color: colors.textSecondary, fontSize: 14, flex: 1 },
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
  logoutBtnText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
});
