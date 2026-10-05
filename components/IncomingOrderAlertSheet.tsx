import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, layout, radius, spacing, typography } from "../lib/theme";
import { RING_MAX_MS } from "../lib/incomingOrderAlert";
import { DEEP_ORANGE, ON_ACCENT, ORANGE } from "./orders/accents";
import { OrderItemRow } from "./orders/OrderItemRow";
import { formatTimeDate, pluralItems } from "./orders/format";
import type { Allocation } from "./orders/types";

export type IncomingOrderAlertSheetProps = {
  visible: boolean;
  alloc: Allocation | null;
  /** 1-based position and size of the alert queue ("1 of 3"). */
  position: { index: number; total: number };
  /** Store online state for this allocation's store — Accept stays disabled while offline. */
  storeActive: boolean;
  /** Which request is in flight, if any. Buttons lock while set. */
  busy: "accept" | "reject" | null;
  /** True while the chime/vibration loop is running; drives the countdown bar. */
  ringing: boolean;
  /** Epoch ms the current ring started — the countdown bar animates from here. */
  ringStartedAt: number | null;
  onAccept: (itemIds: string[]) => void;
  onReject: () => void;
  /** "Not now": closes the popup; the order stays in the Orders tab. */
  onDismiss: () => void;
};

/** How long the inline "Confirm reject?" state stays armed before reverting. */
const REJECT_CONFIRM_MS = 4000;

/**
 * Full-screen incoming-order popup — the in-app equivalent of a ride
 * request screen: orange header with the order code, item checklist,
 * a countdown bar tied to the ring, Reject (two-tap confirm) and Accept.
 *
 * Rendered in a `Modal` so it sits above every screen and the tab bar no
 * matter where the shopkeeper is. Android back = "Not now".
 */
export function IncomingOrderAlertSheet({
  visible,
  alloc,
  position,
  storeActive,
  busy,
  ringing,
  ringStartedAt,
  onAccept,
  onReject,
  onDismiss,
}: IncomingOrderAlertSheetProps) {
  const insets = useSafeAreaInsets();

  // Item inclusion — reset whenever a different order is shown.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const allocId = alloc?.allocation_id ?? null;
  useEffect(() => {
    setCheckedIds(new Set(alloc?.items.map((i) => i.id) ?? []));
    setRejectArmed(false);
  }, [allocId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleItem = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Two-tap reject: first tap arms, second within REJECT_CONFIRM_MS fires.
  // A nested ConfirmSheet over a Modal is unreliable on Android, and a single
  // accidental tap must not throw away an order.
  const [rejectArmed, setRejectArmed] = useState(false);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!rejectArmed) return;
    rejectTimer.current = setTimeout(() => setRejectArmed(false), REJECT_CONFIRM_MS);
    return () => {
      if (rejectTimer.current) clearTimeout(rejectTimer.current);
    };
  }, [rejectArmed]);

  const handleReject = useCallback(() => {
    if (busy) return;
    if (!rejectArmed) {
      setRejectArmed(true);
      return;
    }
    setRejectArmed(false);
    onReject();
  }, [busy, rejectArmed, onReject]);

  // Countdown bar: full → empty across RING_MAX_MS from ringStartedAt.
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (!ringing || !ringStartedAt) {
      progress.setValue(0);
      return;
    }
    const remaining = Math.max(0, RING_MAX_MS - (Date.now() - ringStartedAt));
    progress.setValue(remaining / RING_MAX_MS);
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [ringing, ringStartedAt, progress]);

  // Pulsing bell while ringing.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!ringing) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ringing, pulse]);

  const total = alloc?.items.length ?? 0;
  const checked = useMemo(
    () => (alloc ? alloc.items.reduce((n, item) => (checkedIds.has(item.id) ? n + 1 : n), 0) : 0),
    [alloc, checkedIds]
  );
  const canAccept = !!alloc && checked > 0 && !busy && storeActive;
  const acceptLabel = storeActive ? `Accept (${checked})` : "Store offline";
  const disabledReason = !storeActive
    ? "Your store is offline. Go online from Home to accept orders."
    : checked === 0
      ? "Include at least one item to accept."
      : null;

  const when = alloc ? formatTimeDate(alloc.placed_at) : null;
  const metaBits = [
    alloc?.customer_distance ? `${alloc.customer_distance} away` : null,
    alloc?.customer_area ?? null,
    when,
  ].filter(Boolean) as string[];

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={styles.root} testID="incoming-order-alert">
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <View style={styles.headerTopRow}>
            <Text style={styles.eyebrow} accessibilityRole="header">
              New order request
            </Text>
            {position.total > 1 ? (
              <View style={styles.queuePill}>
                <Text style={styles.queuePillText}>
                  {position.index} of {position.total}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroRow}>
            <Animated.View style={[styles.bell, { transform: [{ scale: pulse }] }]}>
              <Ionicons name={ringing ? "notifications" : "notifications-outline"} size={30} color={DEEP_ORANGE} />
            </Animated.View>
            <View style={styles.heroText}>
              <Text style={styles.orderCode} numberOfLines={1}>
                {alloc ? `#${alloc.order_code}` : ""}
              </Text>
              {metaBits.length > 0 ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {metaBits.join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Countdown */}
          <View style={styles.barTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.barFill, { width: barWidth }]} />
          </View>
          <Text style={styles.barLabel}>
            {ringing ? "Respond quickly — the customer is waiting" : "Still waiting for your response"}
          </Text>
        </View>

        {/* Items */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.itemsHeader}>
            <Text style={styles.itemsTitle}>Items</Text>
            <View style={styles.itemCountPill}>
              <Text style={styles.itemCountPillText}>{pluralItems(total)}</Text>
            </View>
          </View>
          <View style={styles.itemsCard} accessibilityRole="list">
            {alloc?.items.map((item, idx) => (
              <OrderItemRow
                key={item.id}
                item={item}
                checked={checkedIds.has(item.id)}
                onToggle={toggleItem}
                disabled={!!busy}
                separator={idx < total - 1}
              />
            ))}
          </View>
          <Text style={styles.itemsHint}>Untick anything you can’t supply — only ticked items are accepted.</Text>
          {disabledReason && storeActive === false ? (
            <View style={styles.offlineNotice}>
              <Ionicons name="cloud-offline-outline" size={16} color={colors.warningText} />
              <Text style={styles.offlineNoticeText}>{disabledReason}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.rejectBtn,
                rejectArmed && styles.rejectBtnArmed,
                !!busy && styles.btnDisabled,
                pressed && !busy && styles.pressed,
              ]}
              onPress={handleReject}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={rejectArmed ? "Confirm reject" : `Reject order ${alloc?.order_code ?? ""}`}
              accessibilityHint={rejectArmed ? undefined : "Tap twice to reject"}
              accessibilityState={{ disabled: !!busy, busy: busy === "reject" }}
            >
              {busy === "reject" ? (
                <ActivityIndicator size="small" color={rejectArmed ? ON_ACCENT : colors.error} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color={rejectArmed ? ON_ACCENT : colors.error} />
                  <Text style={[styles.rejectBtnText, rejectArmed && styles.rejectBtnTextArmed]}>
                    {rejectArmed ? "Confirm reject?" : "Reject"}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.acceptBtn, !canAccept && styles.acceptBtnDisabled, pressed && canAccept && styles.pressed]}
              onPress={() => onAccept(Array.from(checkedIds))}
              disabled={!canAccept}
              accessibilityRole="button"
              accessibilityLabel={`${acceptLabel}, order ${alloc?.order_code ?? ""}`}
              accessibilityHint={disabledReason ?? undefined}
              accessibilityState={{ disabled: !canAccept, busy: busy === "accept" }}
            >
              {busy === "accept" ? (
                <ActivityIndicator size="small" color={ON_ACCENT} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={ON_ACCENT} />
                  <Text style={styles.acceptBtnText}>{acceptLabel}</Text>
                </>
              )}
            </Pressable>
          </View>
          <Pressable
            onPress={onDismiss}
            disabled={!!busy}
            hitSlop={8}
            style={({ pressed }) => [styles.laterBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            accessibilityHint="Closes this popup. The order stays in your Orders tab."
          >
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: DEEP_ORANGE,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { ...typography.overline, color: ON_ACCENT, opacity: 0.92 },
  queuePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  queuePillText: { ...typography.captionStrong, color: ON_ACCENT },

  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  bell: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ON_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1, gap: 2 },
  orderCode: { fontSize: 26, lineHeight: 32, fontWeight: "800", color: ON_ACCENT, letterSpacing: 0.3 },
  meta: { ...typography.bodySmall, color: ON_ACCENT, opacity: 0.92 },

  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
    marginTop: spacing.lg,
  },
  barFill: { height: "100%", backgroundColor: ON_ACCENT, borderRadius: 3 },
  barLabel: { ...typography.caption, color: ON_ACCENT, opacity: 0.92, marginTop: spacing.xs },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  itemsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemsTitle: { ...typography.heading, color: colors.textPrimary },
  itemCountPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: ORANGE + "14",
    borderWidth: 1,
    borderColor: ORANGE + "35",
  },
  itemCountPillText: { ...typography.captionStrong, color: DEEP_ORANGE },
  itemsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    overflow: "hidden",
  },
  itemsHint: { ...typography.caption, color: colors.textMuted },
  offlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  offlineNoticeText: { ...typography.description, color: colors.warningText, flex: 1 },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  pressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.5 },
  rejectBtn: {
    flex: 1,
    height: layout.buttonHeightLg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  rejectBtnArmed: { backgroundColor: colors.errorStrong, borderColor: colors.errorStrong },
  rejectBtnText: { ...typography.subheading, color: colors.errorText },
  rejectBtnTextArmed: { color: ON_ACCENT },
  acceptBtn: {
    flex: 1.4,
    height: layout.buttonHeightLg,
    borderRadius: radius.md,
    backgroundColor: DEEP_ORANGE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  acceptBtnDisabled: { backgroundColor: colors.textDisabled },
  acceptBtnText: { ...typography.subheading, color: ON_ACCENT },
  laterBtn: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  laterText: { ...typography.bodyStrong, color: colors.textSecondary },
});

export default IncomingOrderAlertSheet;
