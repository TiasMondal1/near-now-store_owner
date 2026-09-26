import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../../lib/theme";

export type CountBadgeProps = {
  count: number;
  /** Adds a 1.5dp `surface` ring — use when overlaying an `IconButton`. */
  ringed?: boolean;
  /** Cap before "N+" is shown. Default 9. */
  max?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const SIZE = 18;
const RING = 1.5;

/**
 * Attention count (unread bell, incoming orders). Always `error` fill.
 * Renders nothing when `count <= 0`.
 */
export function CountBadge({ count, ringed = false, max = 9, style, accessibilityLabel }: CountBadgeProps) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${count} new`}
      style={[styles.base, ringed && styles.ringed, style]}
    >
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: SIZE,
    height: SIZE,
    borderRadius: radius.full,
    // `errorStrong`, not `error`: white 11px text on #EF4444 is only 3.8:1.
    backgroundColor: colors.errorStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  ringed: {
    minWidth: SIZE + RING * 2,
    height: SIZE + RING * 2,
    borderWidth: RING,
    borderColor: colors.surface,
  },
  text: {
    ...typography.countBadge,
    color: colors.onPrimary,
    textAlign: "center",
  },
});

export default CountBadge;
