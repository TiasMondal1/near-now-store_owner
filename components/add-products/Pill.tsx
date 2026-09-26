import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, layout, radius } from "../../lib/theme";

export type PillProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /**
   * `category` = the old catalog category chip (12/500, 1px border).
   * `form` = the old custom-form unit chip (13/600, 1.5px border). Default `category`.
   */
  variant?: "category" | "form";
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The old catalog / custom-form pill: white with a grey border, primary fill
 * with white 700 text when selected.
 */
export function Pill({ label, selected = false, onPress, variant = "category", disabled = false, accessibilityLabel, style, testID }: PillProps) {
  const form = variant === "form";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        form ? styles.form : styles.category,
        selected && styles.selected,
        pressed && !disabled && (selected ? styles.selectedPressed : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[form ? styles.formText : styles.categoryText, selected && styles.selectedText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  category: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  form: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5 },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedPressed: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  pressed: { backgroundColor: colors.surfaceVariant },
  disabled: { opacity: layout.disabledOpacity },
  categoryText: { color: colors.textSecondary, fontSize: 12, fontWeight: "500" },
  formText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  selectedText: { color: colors.onPrimary, fontWeight: "700" },
});

export default Pill;
