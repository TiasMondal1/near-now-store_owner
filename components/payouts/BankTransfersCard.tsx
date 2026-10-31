import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../../lib/api-client";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { formatINR, parseDbDate } from "../../lib/order-utils";

type Transfer = {
  id: string;
  amount: number;
  orders: number;
  status: "paid" | "in_progress" | "failed";
  utr: string | null;
  created_at: string;
  paid_at: string | null;
};

type PayoutHistory = {
  enabled: boolean;
  account: { status: string; account_last4: string } | null;
  payouts: Transfer[];
};

const STATUS: Record<Transfer["status"], { label: string; color: string; bg: string }> = {
  paid: { label: "Paid", color: colors.successText, bg: colors.successBg },
  in_progress: { label: "On its way", color: colors.infoText, bg: colors.infoBg },
  failed: { label: "Failed — we'll retry", color: colors.errorText, bg: colors.errorBg },
};

const SHOWN = 3;

function shortDate(iso: string | null): string {
  const d = iso ? parseDbDate(iso) : null;
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
}

/**
 * The store's real bank transfers (RazorpayX store payouts on the backend),
 * under the earnings summary. Renders nothing until payouts are switched on
 * and this store has a registered account or a transfer — and on a backend
 * without the endpoint. `refreshKey` changes on pull-to-refresh.
 */
export function BankTransfersCard({ token, storeId, refreshKey }: { token: string; storeId: string; refreshKey: number }) {
  const [history, setHistory] = useState<PayoutHistory | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<PayoutHistory & { success: boolean }>(`/store-owner/stores/${storeId}/payouts`, { Authorization: `Bearer ${token}` })
      .then((res) => {
        if (!cancelled && res.success && res.data && Array.isArray(res.data.payouts)) setHistory(res.data);
      })
      .catch(() => {
        /* optional section — the earnings above don't depend on it */
      });
    return () => {
      cancelled = true;
    };
  }, [token, storeId, refreshKey]);

  if (!history?.enabled || (!history.account && history.payouts.length === 0)) return null;
  const recent = history.payouts.slice(0, SHOWN);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="business-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>Bank transfers</Text>
        {history.account ? <Text style={styles.account}>to ••••{history.account.account_last4}</Text> : null}
      </View>
      {recent.length === 0 ? (
        <Text style={styles.empty}>
          {history.account?.status === "verified"
            ? "Your delivered orders are paid to your bank account in regular transfers."
            : "We're verifying your bank account. Transfers start once it's confirmed."}
        </Text>
      ) : (
        recent.map((t) => {
          const s = STATUS[t.status];
          return (
            <View key={t.id} style={styles.row} accessible accessibilityLabel={`${formatINR(t.amount)}, ${s.label}, ${t.orders} orders`}>
              <View style={styles.rowText}>
                <Text style={styles.amount}>{formatINR(t.amount)}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {t.orders} {t.orders === 1 ? "order" : "orders"} · {shortDate(t.paid_at ?? t.created_at)}
                  {t.utr ? ` · UTR ${t.utr}` : ""}
                </Text>
              </View>
              <Text style={[styles.chip, { color: s.color, backgroundColor: s.bg }]}>{s.label}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1 },
  account: { color: colors.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] },
  empty: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  rowText: { flex: 1, gap: 2 },
  amount: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  meta: { color: colors.textTertiary, fontSize: 12 },
  chip: { fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.md, overflow: "hidden" },
});
