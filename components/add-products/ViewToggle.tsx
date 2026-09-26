import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { triggerHaptic, type IoniconName } from "../ui";

export type ViewToggleItem<K extends string> = { key: K; label: string; icon: IoniconName };

export type ViewToggleProps<K extends string> = {
  items: readonly ViewToggleItem<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The old Inventory / Add Custom toggle: a `surfaceVariant` track with 3dp
 * padding and a 1px border; the active segment is a primary-filled pill with
 * `shadows.sm`, 14/600 (700 when active) labels and 18dp icons.
 */
export function ViewToggle<K extends string>({ items, value, onChange, accessibilityLabel, style }: ViewToggleProps<K>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (active) return;
              void triggerHaptic("light");
              onChange(item.key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.btn, active && styles.btnActive, pressed && !active && styles.btnPressed]}
          >
            <Ionicons name={item.icon} size={18} color={active ? colors.surface : colors.textSecondary} />
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {item.label}
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
    gap: spacing.xs,
    backgroundColor: colors.surfaceVariant,
    padding: 3,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  btnActive: { backgroundColor: colors.primary, ...shadows.sm },
  btnPressed: { backgroundColor: colors.border },
  text: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  textActive: { color: colors.surface, fontWeight: "700" },
});

export default ViewToggle;
