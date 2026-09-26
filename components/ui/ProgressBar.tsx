import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../../lib/theme";

export type ProgressBarProps = {
  /** 0..1 — clamped. */
  value: number;
  /** Caption, right-aligned above the track, e.g. "3 of 9". */
  label?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const TRACK = 4;

/** Determinate progress: 4dp `borderLight` track, `primary` fill. */
export function ProgressBar({ value, label, accessibilityLabel, style }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = Math.round(clamped * 100);
  return (
    <View
      style={[styles.root, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label ?? `${pct}% complete`}
      accessibilityValue={{ min: 0, max: 100, now: pct, text: label ?? `${pct}%` }}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs + spacing.xxs },
  label: { ...typography.caption, color: colors.textMuted, textAlign: "right" },
  track: {
    height: TRACK,
    borderRadius: radius.full,
    backgroundColor: colors.borderLight,
    overflow: "hidden",
  },
  fill: { height: TRACK, borderRadius: radius.full, backgroundColor: colors.primary },
});

export default ProgressBar;
