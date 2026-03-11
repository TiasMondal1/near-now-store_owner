import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import { config } from "../../lib/config";
import { colors, radius, spacing } from "../../lib/theme";

const API_BASE = config.API_BASE;

export default function PaymentsTab() {
  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsDayTotal, setPaymentsDayTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"payments" | "payouts">("payments");

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

  useEffect(() => {
    if (!session || !storeId) return;

    fetchPayments();
  }, [session, storeId]);

  useFocusEffect(
    React.useCallback(() => {
      if (session?.token && storeId) {
        fetchPayments();
      }
    }, [session?.token, storeId])
  );

  const fetchPayments = async () => {
    if (!session || !storeId) return;

    try {
      setPaymentsLoading(true);

      const today = new Date().toISOString().slice(0, 10);

      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/payments?date=${today}`,
        {
          headers: { Authorization: `Bearer ${session.token}` },
        }
      );
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!json?.success) return;

      setPayments(json.payments || []);
      setPaymentsDayTotal(json.day_total || 0);
    } finally {
      setPaymentsLoading(false);
    }
  };

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
              <Text style={styles.brand}>Payments & Payouts</Text>
              <Text style={styles.subtitle}>Financial Overview</Text>
            </View>
          </View>
          <TouchableOpacity onPress={fetchPayments} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, activeView === "payments" && styles.toggleBtnActive]}
            onPress={() => setActiveView("payments")}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="card-outline" 
              size={18} 
              color={activeView === "payments" ? colors.surface : colors.textSecondary} 
            />
            <Text style={[styles.toggleBtnText, activeView === "payments" && styles.toggleBtnTextActive]}>
              Payments
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, activeView === "payouts" && styles.toggleBtnActive]}
            onPress={() => setActiveView("payouts")}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="cash-outline" 
              size={18} 
              color={activeView === "payouts" ? colors.surface : colors.textSecondary} 
            />
            <Text style={[styles.toggleBtnText, activeView === "payouts" && styles.toggleBtnTextActive]}>
              Payouts
            </Text>
          </TouchableOpacity>
        </View>

        {activeView === "payments" && (
          paymentsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : payments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="card-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No payments today</Text>
              <Text style={styles.emptyText}>
                Delivered orders will appear here automatically.
              </Text>
            </View>
          ) : (
            <>
              {payments.map((p: any) => (
                <View
                  key={p.id}
                  style={styles.paymentRow}
                >
                  <View>
                    <Text style={styles.paymentCode}>
                      #{p.order_code}
                    </Text>
                    <Text style={styles.paymentMeta}>
                      Items ₹{p.items_total} + Bonus ₹{p.delivery_bonus}
                    </Text>
                  </View>

                  <Text style={styles.paymentAmount}>
                    ₹{p.total_amount}
                  </Text>
                </View>
              ))}

              <View style={styles.paymentFooter}>
                <Text style={styles.paymentFooterText}>Today's Total</Text>
                <Text style={styles.paymentFooterAmount}>
                  ₹{paymentsDayTotal}
                </Text>
              </View>
            </>
          )
        )}

        {activeView === "payouts" && (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No payouts yet</Text>
            <Text style={styles.emptyText}>
              Payouts from Near&Now will appear here once they're processed.
            </Text>
          </View>
        )}
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
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  toggleContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceVariant,
    padding: 4,
    borderRadius: radius.lg,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  toggleBtnTextActive: {
    color: colors.surface,
  },

  loadingContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: "center",
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

  paymentRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentCode: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  paymentMeta: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
  },
  paymentAmount: {
    color: colors.success,
    fontSize: 16,
    fontWeight: "800",
  },
  paymentFooter: {
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.success + "40",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  paymentFooterText: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  paymentFooterAmount: {
    color: colors.success,
    fontSize: 20,
    fontWeight: "800",
  },
});
