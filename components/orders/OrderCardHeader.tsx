import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../../lib/theme";
import type { IoniconName } from "../ui";

export type OrderCardHeaderProps = {
  /** Rendered as "#CODE". */
  orderCode: string;
  /** `lg` = 17/800 (incoming card), `md` = 16/700 (active card). */
  emphasis?: "lg" | "md";
  /** Meta line under the code (e.g. "2.1 km away"). */
  meta?: string | null;
  metaIcon?: IoniconName;
  /** Trailing node — a status / attention pill. */
  badge?: React.ReactNode;
  /** Multi-store owners: which store the order is for (omitted for one store). */
  storeName?: string | null;
};

/**
 * Card header from the pre-redesign Orders tab: order code + meta on the
 * left, pill on the right, padded `spacing.md` all round.
 */
export function OrderCardHeader({ orderCode, emphasis = "md", meta, metaIcon = "location-outline", badge, storeName }: OrderCardHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={[styles.code, emphasis === "lg" ? styles.codeLg : styles.codeMd]} numberOfLines={1}>
          #{orderCode}
        </Text>
        {storeName ? (
          <View style={styles.metaRow} accessibilityLabel={`For ${storeName}`}>
            <Ionicons name="storefront-outline" size={11} color={colors.primary} />
            <Text style={styles.store} numberOfLines={1}>
              {storeName}
            </Text>
          </View>
        ) : null}
        {meta ? (
          <View style={styles.metaRow}>
            <Ionicons name={metaIcon} size={11} color={colors.textTertiary} />
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        ) : null}
      </View>
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  left: { flex: 1, gap: 3 },
  code: { color: colors.textPrimary },
  codeLg: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  codeMd: { fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  meta: { color: colors.textTertiary, fontSize: 12, fontWeight: "500", flexShrink: 1 },
  store: { color: colors.primary, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  badge: { flexShrink: 0 },
});

export default OrderCardHeader;
