import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { radius } from "../../lib/theme";

export type StatusPillProps = {
  label: string;
  /** Solid colour; the pill paints `color + "14"` bg and `color + "35"` border. */
  color: string;
  /** 6dp dot before the label. */
  dot?: boolean;
  /** `sm` = the compact history pill (9/3 padding, 0.1 tracking). */
  size?: "sm" | "md";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The tinted status / attention pill from the pre-redesign order cards
 * ("NEW", "Active", "Delivered"). Alpha-suffixed hex, as the old screen did.
 */
export function StatusPill({ label, color, dot = false, size = "md", accessibilityLabel, style }: StatusPillProps) {
  const sm = size === "sm";
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        sm ? styles.sm : styles.md,
        { backgroundColor: color + (sm ? "12" : "14"), borderColor: color + (sm ? "30" : "35") },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.text, sm ? styles.textSm : styles.textMd, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  md: { paddingHorizontal: 10, paddingVertical: 4 },
  sm: { paddingHorizontal: 9, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: "700" },
  textMd: { letterSpacing: 0.2 },
  textSm: { letterSpacing: 0.1 },
});

export default StatusPill;
