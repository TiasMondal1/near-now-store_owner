import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import type { IoniconName } from "./types";

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** 36 (`sm`) or 40 (`md`, default). Both get hitSlop so the target reaches 44. */
  size?: "sm" | "md";
  icon?: IoniconName;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Selectable pill (filters, units, categories). Selection is shown by tint,
 * not by weight, so rows do not reflow.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  size = "md",
  icon,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: ChipProps) {
  const height = size === "sm" ? layout.chipHeightSm : layout.chipHeightMd;
  const hit = Math.max(0, Math.ceil((layout.touchTarget - height) / 2));
  const tint = selected ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hit}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { height },
        selected ? styles.selected : styles.unselected,
        pressed && !disabled && (selected ? styles.selectedPressed : styles.unselectedPressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={iconSize.sm} color={tint} /> : null}
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  selected: { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder },
  selectedPressed: { backgroundColor: colors.primaryBorder },
  unselected: { backgroundColor: colors.surface, borderColor: colors.border },
  unselectedPressed: { backgroundColor: colors.surfaceVariant },
  disabled: { opacity: layout.disabledOpacity },
  label: { ...typography.label },
});

export default Chip;
