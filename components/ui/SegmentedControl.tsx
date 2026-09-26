import React, { useCallback } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";
import { triggerHaptic } from "./Button";
import type { IoniconName } from "./types";

export type SegmentItem<K extends string = string> = {
  key: K;
  label: string;
  /** Rendered as "Label · 3". Hidden when 0/undefined. */
  count?: number;
  icon?: IoniconName;
};

export type SegmentedControlProps<K extends string = string> = {
  items: readonly SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /**
   * `md` (44dp, 14px, default) or `sm` (36dp, 13px) for in-card use. Labels
   * shrink to 85% before ellipsising; prefer `sm` for 4-item sets on phones.
   */
  size?: "md" | "sm";
  disabled?: boolean;
  /** Light haptic on change. Default true. */
  haptic?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Single-select filter. One active colour; counts live in the label.
 */
export function SegmentedControl<K extends string = string>({
  items,
  value,
  onChange,
  size = "md",
  disabled = false,
  haptic = true,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<K>) {
  const { isWide } = useLayout();
  const height = size === "sm" ? layout.segmentedHeightSm : layout.segmentedHeight;
  // Each segment is track − 2·border − 2·innerPadding tall (38 for md, 30 for
  // sm). Extend the vertical hit area over the border/padding ring and up to
  // the 44dp minimum so taps on the track edge still land.
  const segmentHeight = height - 2 * (1 + layout.segmentedInnerPadding);
  const hitSlopVertical = Math.max(
    layout.segmentedInnerPadding + 1,
    Math.ceil((layout.touchTarget - segmentHeight) / 2)
  );

  const select = useCallback(
    (key: K) => {
      if (disabled || key === value) return;
      if (haptic) void triggerHaptic("light");
      onChange(key);
    },
    [disabled, value, haptic, onChange]
  );

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.track,
        { height },
        isWide ? styles.trackWide : styles.trackNarrow,
        disabled && styles.disabled,
        style,
      ]}
    >
      {items.map((item) => {
        const active = item.key === value;
        const label = item.count != null && item.count > 0 ? `${item.label} · ${item.count}` : item.label;
        const color = active ? colors.primary : colors.textSecondary;
        const textStyle =
          size === "sm"
            ? active
              ? typography.labelStrong
              : typography.label
            : active
              ? typography.bodySmallStrong
              : { ...typography.bodySmall, fontWeight: "500" as const };
        return (
          <Pressable
            key={item.key}
            onPress={() => select(item.key)}
            disabled={disabled}
            hitSlop={{ top: hitSlopVertical, bottom: hitSlopVertical }}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled }}
            style={({ pressed }) => [
              styles.segment,
              active && styles.active,
              pressed && !active && !disabled && styles.pressed,
            ]}
          >
            {item.icon ? <Ionicons name={item.icon} size={iconSize.sm} color={color} /> : null}
            <Text
              style={[textStyle, { color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: layout.segmentedInnerPadding,
    maxWidth: layout.maxSegmentedWidth,
  },
  trackNarrow: { alignSelf: "stretch" },
  trackWide: { alignSelf: "center", width: "100%" },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md - layout.segmentedInnerPadding,
  },
  // Plain `surface` pill — the track already carries the 1px border.
  active: { backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  disabled: { opacity: layout.disabledOpacity },
});

export default SegmentedControl;
