import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

type Submission = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  image_url: string;
  base_price: number;
  discounted_price: number;
  unit: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const STATUS_STYLE: Record<Submission["status"], { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E", label: "Pending review" },
  approved: { bg: "#D1FAE5", fg: "#065F46", label: "Approved" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
};

export default function ProductSubmissionsScreen() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s: any = await getSession();
      if (!s?.token) {
        router.replace("/landing");
        return;
      }
      const res = await fetch(`${config.API_BASE}/shopkeeper/product-submissions`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || "Failed to load submissions");
        return;
      }
      setSubmissions(data.submissions ?? []);
    } catch (e: any) {
      setError(e?.message || "Network error");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>My Submissions</Text>
          <Text style={styles.subtitle}>Custom products you've sent for admin review</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error && <Text style={styles.errorText}>{error}</Text>}

          {!error && submissions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No submissions yet</Text>
              <Text style={styles.emptyBody}>
                Products you add from "Add Custom Product" will show up here with their review status.
              </Text>
            </View>
          )}

          {submissions.map((s) => {
            const st = STATUS_STYLE[s.status];
            return (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Image source={{ uri: s.image_url }} style={styles.image} />
                  <View style={styles.cardInfo}>
                    <Text style={styles.name} numberOfLines={2}>{s.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {s.brand ? `${s.brand} · ` : ""}{s.category} · {s.unit}
                    </Text>
                    <Text style={styles.price}>
                      ₹{s.discounted_price} <Text style={styles.priceStrike}>₹{s.base_price}</Text>
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                </View>
                {s.status === "rejected" && s.rejection_reason && (
                  <Text style={styles.rejectionReason}>Reason: {s.rejection_reason}</Text>
                )}
                <Text style={styles.date}>
                  Submitted {new Date(s.created_at).toLocaleDateString("en-IN")}
                  {s.reviewed_at ? ` · Reviewed ${new Date(s.reviewed_at).toLocaleDateString("en-IN")}` : ""}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  backArrow: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  headerText: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  subtitle: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: spacing.lg },
  errorText: { color: colors.error, marginBottom: spacing.md },
  emptyState: { alignItems: "center", paddingVertical: spacing.xxxl },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: spacing.sm },
  emptyBody: { color: colors.textTertiary, fontSize: 13, textAlign: "center", paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  image: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceVariant },
  cardInfo: { flex: 1, minWidth: 0 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  meta: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  price: { color: colors.textPrimary, fontSize: 13, fontWeight: "600", marginTop: 4 },
  priceStrike: { color: colors.textTertiary, fontWeight: "400", textDecorationLine: "line-through" },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  rejectionReason: { color: colors.error, fontSize: 12, marginTop: spacing.sm },
  date: { color: colors.textTertiary, fontSize: 11, marginTop: spacing.sm },
});
