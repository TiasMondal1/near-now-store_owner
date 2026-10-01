import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, layout, radius, shadows, spacing } from "../../lib/theme";
import { DEEP_ORANGE, ON_ACCENT, ORANGE } from "./accents";
import { OrderCardHeader } from "./OrderCardHeader";
import { OrderItemRow } from "./OrderItemRow";
import { StatusPill } from "./StatusPill";
import { formatTimeDate, pluralItems } from "./format";
import type { Allocation } from "./types";

export type IncomingOrderCardProps = {
  alloc: Allocation;
  /** True while THIS card's accept/reject request is in flight. */
  accepting: boolean;
  /** Store online state — Accept stays disabled (with a reason) while offline. */
  storeActive: boolean;
  onAccept: (allocId: string, itemIds: string[]) => void;
  onReject: (allocId: string, orderCode: string) => void;
  /** Shown on the card for multi-store owners; null/undefined hides it. */
  storeName?: string | null;
};

/**
 * A pending allocation in the pre-redesign "AllocationCard" look: radius.xl
 * card with a 2px `#FF6B00@35` border and orange-tinted `shadows.lg`, 17/800
 * order code, "NEW" pill, item rows, Reject (error tint) + Accept (deep
 * orange fill, "Accept (N)" / "Store offline") and a time · date footer with
 * the item-count pill.
 *
 * Behaviour is the current one: each item row is a 44dp include checkbox,
 * all items included by default, Accept sends only the checked ids, and the
 * accept button carries a spinner while the request is in flight.
 */
export const IncomingOrderCard = React.memo(function IncomingOrderCard({
  alloc,
  accepting,
  storeActive,
  onAccept,
  onReject,
  storeName,
}: IncomingOrderCardProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(alloc.items.map((i) => i.id)));

  const toggleItem = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const total = alloc.items.length;
  const checked = alloc.items.reduce((n, item) => (checkedIds.has(item.id) ? n + 1 : n), 0);
  const canAccept = checked > 0 && !accepting && storeActive;
  const acceptLabel = storeActive ? `Accept (${checked})` : "Store offline";
  const when = formatTimeDate(alloc.placed_at);

  const disabledReason = !storeActive
    ? storeName
      ? `Put ${storeName} online to accept this order.`
      : "Go online to accept this order."
    : checked === 0
      ? "Include at least one item to accept."
      : null;

  return (
    <View style={styles.card}>
      <OrderCardHeader
        orderCode={alloc.order_code}
        storeName={storeName}
        emphasis="lg"
        meta={alloc.customer_distance ? `${alloc.customer_distance} away` : null}
        badge={<StatusPill label="NEW" color={ORANGE} dot accessibilityLabel="New order" />}
      />

      <View style={styles.body}>
        <View accessibilityRole="list">
          {alloc.items.map((item) => (
            <OrderItemRow
              key={item.id}
              item={item}
              checked={checkedIds.has(item.id)}
              onToggle={toggleItem}
              disabled={accepting}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.rejectBtn, accepting && styles.btnDisabled, pressed && !accepting && styles.pressed]}
            onPress={() => onReject(alloc.allocation_id, alloc.order_code)}
            disabled={accepting}
            accessibilityRole="button"
            accessibilityLabel={`Reject order ${alloc.order_code}`}
            accessibilityState={{ disabled: accepting }}
          >
            <Ionicons name="close-circle-outline" size={16} color={colors.error} />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.acceptBtn, !canAccept && styles.acceptBtnDisabled, pressed && canAccept && styles.pressed]}
            onPress={() => onAccept(alloc.allocation_id, Array.from(checkedIds))}
            disabled={!canAccept}
            accessibilityRole="button"
            accessibilityLabel={`${acceptLabel}, order ${alloc.order_code}`}
            accessibilityHint={disabledReason ?? undefined}
            accessibilityState={{ disabled: !canAccept, busy: accepting }}
          >
            {accepting ? (
              <ActivityIndicator size="small" color={ON_ACCENT} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color={ON_ACCENT} />
                <Text style={styles.acceptBtnText}>{acceptLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
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
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: DEEP_ORANGE + "35",
    overflow: "hidden",
    ...shadows.lg,
    shadowColor: DEEP_ORANGE,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  pressed: { opacity: 0.8 },
  btnDisabled: { opacity: layout.disabledOpacity },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: layout.touchTarget,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.error + "10",
    borderWidth: 1,
    borderColor: colors.error + "35",
  },
  rejectBtnText: { color: colors.error, fontSize: 14, fontWeight: "700" },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: layout.touchTarget,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: DEEP_ORANGE,
    ...shadows.lg,
    shadowColor: DEEP_ORANGE,
  },
  acceptBtnDisabled: { backgroundColor: ORANGE + "50", shadowOpacity: 0, elevation: 0 },
  acceptBtnText: { color: ON_ACCENT, fontSize: 14, fontWeight: "700" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
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

export default IncomingOrderCard;
