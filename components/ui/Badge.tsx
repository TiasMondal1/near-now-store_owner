import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing, toneColors, type Tone, typography } from "../../lib/theme";
import type { IoniconName } from "./types";

export type BadgeProps = {
  label: string;
  tone?: Tone;
  /** 20dp (`sm`) or 24dp (`md`, default). */
  size?: "sm" | "md";
  /** 6dp tone-fill dot before the label. */
  dot?: boolean;
  /** 12dp Ionicons glyph before the label (filled variants allowed here). */
  icon?: IoniconName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT = { sm: 20, md: 24 } as const;
const DOT = 6;
const ICON = 12;

/**
 * Static status label. Tone carries the meaning; never colour by tab or time.
 */
export function Badge({ label, tone = "neutral", size = "md", dot = false, icon, accessibilityLabel, style }: BadgeProps) {
  const t = toneColors(tone);
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        { height: HEIGHT[size], backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: t.fill }]} /> : null}
      {icon ? <Ionicons name={icon} size={ICON} color={t.text} /> : null}
      <Text style={[styles.text, { color: t.text }]} numberOfLines={1}>
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
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  dot: { width: DOT, height: DOT, borderRadius: radius.full },
  text: { ...typography.badge },
});

export default Badge;
