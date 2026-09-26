import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, spacing, typography } from "../../lib/theme";
import { Button } from "./Button";
import type { ActionSpec } from "./types";

export type SectionHeaderVariant = "overline" | "sentence";

export type SectionHeaderProps = {
  title: string;
  /** `overline` = 12/600 uppercase textMuted (default); `sentence` = 13/600 sentence case. */
  variant?: SectionHeaderVariant;
  /** Trailing text `Button` (sm). */
  action?: ActionSpec;
  /** Trailing count, rendered as caption. Ignored when `action` is set. */
  count?: number;
  /** Adds 16 above / 8 below — only when rendered outside a `Section`. */
  standalone?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, variant = "overline", action, count, standalone = false, style }: SectionHeaderProps) {
  return (
    <View style={[styles.header, standalone && styles.standalone, style]}>
      <Text
        style={[variant === "overline" ? styles.overline : styles.sentence]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="text" size="sm" />
      ) : count != null ? (
        <Text style={styles.count}>{count}</Text>
      ) : null}
    </View>
  );
}

export type SectionProps = {
  /** When set, renders a `SectionHeader` above the children. */
  title?: string;
  variant?: SectionHeaderVariant;
  action?: ActionSpec;
  count?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Gap between children. Default 12. */
  gap?: number;
};

/**
 * A titled group of content. The parent screen provides the 24 gap between
 * sections; the Section owns only the gap between its header and children.
 */
export function Section({ title, variant, action, count, children, style, gap = spacing.md }: SectionProps) {
  return (
    <View style={[styles.section, style]}>
      {title ? <SectionHeader title={title} variant={variant} action={action} count={count} /> : null}
      <View style={{ gap }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: spacing.xl,
    gap: spacing.sm,
  },
  standalone: { marginTop: spacing.lg, marginBottom: spacing.sm },
  overline: { ...typography.overline, color: colors.textMuted, flex: 1 },
  sentence: { ...typography.labelStrong, color: colors.textPrimary, flex: 1 },
  count: { ...typography.caption, color: colors.textMuted },
});

export default Section;
