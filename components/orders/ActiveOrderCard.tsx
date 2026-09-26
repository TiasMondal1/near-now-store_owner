import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { InfoBlock } from "./InfoBlock";
import { OrderCardHeader } from "./OrderCardHeader";
import { OrderItemRow } from "./OrderItemRow";
import { PickupCodeBlock } from "./PickupCodeBlock";
import { StatusPill } from "./StatusPill";
import { formatTimeDate, pluralItems } from "./format";
import type { Allocation } from "./types";

export type ActiveOrderCardProps = {
  alloc: Allocation;
};

/**
 * An accepted allocation awaiting pickup, in the pre-redesign look: 3dp
 * `colors.info` accent stripe, `shadows.sm`, 16/700 order code, "Active"
 * pill, tinted pickup-code band (22px tracked code, 32dp key icon, hint),
 * receiver band, bullet item rows and a time · date footer with the
 * item-count pill.
 */
export const ActiveOrderCard = React.memo(function ActiveOrderCard({ alloc }: ActiveOrderCardProps) {
  const total = alloc.items.length;
  const when = formatTimeDate(alloc.placed_at);
  const receiverLines = [alloc.receiver_phone, alloc.receiver_address].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );

  return (
    <View style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.content}>
        <OrderCardHeader
          orderCode={alloc.order_code}
          emphasis="md"
          meta={alloc.customer_distance ? `${alloc.customer_distance} away` : null}
          badge={<StatusPill label="Active" color={colors.success} dot />}
        />

        {alloc.pickup_code ? <PickupCodeBlock code={alloc.pickup_code} /> : null}

        {alloc.receiver_name ? (
          <InfoBlock
            icon="person-outline"
            label="Deliver to (receiver)"
            accessibilityLabel={["Deliver to", alloc.receiver_name, ...receiverLines].join(", ")}
          >
            <Text style={styles.receiverName} numberOfLines={2}>
              {alloc.receiver_name}
            </Text>
            {receiverLines.map((line, idx) => (
              <Text key={idx} style={styles.receiverMeta} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </InfoBlock>
        ) : null}

        <View style={styles.itemsDivider} />
        <View style={styles.itemsList} accessibilityRole="list">
          {alloc.items.map((item, idx) => (
            <OrderItemRow key={item.id} item={item} separator={idx < total - 1} />
          ))}
        </View>

        <View style={styles.footer}>
          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
          <Text style={styles.footerText} numberOfLines={1}>
            {when ?? ""}
          </Text>
          <View style={styles.itemCountPill}>
            <Text style={styles.itemCountPillText}>{pluralItems(total)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  accent: { width: 3, backgroundColor: colors.info, alignSelf: "stretch" },
  content: { flex: 1 },
  receiverName: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  receiverMeta: { color: colors.textTertiary, fontSize: 12, fontWeight: "500" },
  itemsDivider: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: spacing.md },
  itemsList: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.xs,
  },
  footerText: { color: colors.textTertiary, fontSize: 11, flex: 1, fontWeight: "500" },
  itemCountPill: {
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemCountPillText: { color: colors.textTertiary, fontSize: 11, fontWeight: "600" },
});

export default ActiveOrderCard;
