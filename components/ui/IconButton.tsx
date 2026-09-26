import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, shadows } from "../../lib/theme";
import { CountBadge } from "./CountBadge";
import type { IoniconName } from "./types";

export type IconButtonVariant = "plain" | "surface" | "tonal" | "floating";

export type IconButtonProps = {
  icon: IoniconName;
  /** Required — icon-only controls have no visible label. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** 44 (default) or 40 (adds hitSlop 4 so the effective target stays 44+). */
  size?: 44 | 40;
  variant?: IconButtonVariant;
  /** Icon colour. Defaults to `textPrimary` (plain/surface/floating) or `primary` (tonal). */
  color?: string;
  /** Renders a ringed `CountBadge` at the top-right when > 0. */
  badgeCount?: number;
  /** Spinner replaces the glyph; size stays fixed; `busy` state; presses ignored. */
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Circular icon-only button. `floating` is the FAB look (surface + shadows.md).
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = layout.touchTarget,
  variant = "plain",
  color,
  badgeCount,
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: IconButtonProps) {
  const inactive = disabled || loading;
  const glyph = size === layout.touchTargetCompact ? iconSize.md : iconSize.lg;
  const tint = color ?? (variant === "tonal" ? colors.primary : colors.textPrimary);
  const compact = size === layout.touchTargetCompact;
  const hasBadge = badgeCount != null && badgeCount > 0;
  // The Pressable is the accessible node, so the CountBadge's own label is
  // never read — fold the count into ours.
  const label = hasBadge ? `${accessibilityLabel}, ${badgeCount} new` : accessibilityLabel;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      hitSlop={compact ? layout.compactHitSlop : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        variant === "surface" && styles.surface,
        variant === "tonal" && styles.tonal,
        variant === "floating" && styles.floating,
        pressed && !inactive && (variant === "tonal" ? styles.tonalPressed : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      {/* Disabled look is `styles.disabled` (40% opacity) alone, like Button/Chip — no second dim on the glyph. */}
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons name={icon} size={glyph} color={tint} />
      )}
      {hasBadge ? (
        <View
          style={styles.badge}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <CountBadge count={badgeCount} ringed />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tonal: {
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  floating: {
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  tonalPressed: { backgroundColor: colors.primaryBorder },
  disabled: { opacity: layout.disabledOpacity, elevation: 0 },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
  },
});

export default IconButton;
