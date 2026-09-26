import React, { useCallback } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, layout, spacing, typography } from "../../lib/theme";
import { triggerHaptic } from "./Button";

export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 15/400 textPrimary beside the glyph. */
  label?: string;
  /** 13/400 textMuted under the label. */
  description?: string;
  disabled?: boolean;
  /** Light haptic on toggle. Default true. */
  haptic?: boolean;
  /** Required when no `label` is given — the glyph alone has no text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * 24dp checkbox glyph (`checkbox-outline` / `square-outline`) inside a 44dp
 * pressable row. Whole row toggles; announced as a checkbox with checked /
 * disabled state. Owns no outer margin.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  haptic = true,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CheckboxProps) {
  const handlePress = useCallback(() => {
    if (disabled) return;
    if (haptic) void triggerHaptic("light");
    onChange(!checked);
  }, [disabled, haptic, onChange, checked]);

  const spoken = accessibilityLabel ?? [label, description].filter(Boolean).join(", ");

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked, disabled }}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}
    >
      <View style={styles.glyph}>
        <Ionicons
          name={checked ? "checkbox-outline" : "square-outline"}
          size={layout.checkboxSize}
          color={checked ? colors.primary : colors.textSecondary}
        />
      </View>
      {label || description ? (
        <View style={styles.text}>
          {label ? (
            <Text style={styles.label} numberOfLines={2}>
              {label}
            </Text>
          ) : null}
          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44dp minimum in both axes so a bare glyph (no label) is still a full target.
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  disabled: { opacity: layout.disabledOpacity },
  glyph: {
    width: layout.checkboxSize,
    height: layout.checkboxSize,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: spacing.xxs },
  label: { ...typography.body, color: colors.textPrimary },
  description: { ...typography.description, color: colors.textMuted },
});

export default Checkbox;
