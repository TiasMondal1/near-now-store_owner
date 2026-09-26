import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";

export type ScreenHeaderProps = {
  title: string;
  /** Small line above the title, e.g. "Hello, Priya". */
  eyebrow?: string;
  /** Line under the title. */
  subtitle?: string;
  /** Row of 44dp `IconButton`s, rendered with gap 8. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * In-scroll header for the tab roots. Sits on `colors.background`, no border.
 * Use as the first child of the scroll view or as `ListHeaderComponent`.
 */
export function ScreenHeader({ title, eyebrow, subtitle, right, style }: ScreenHeaderProps) {
  const { gutter } = useLayout();
  return (
    <View style={[styles.root, { paddingHorizontal: gutter }, style]}>
      <View style={styles.text}>
        {eyebrow ? (
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  text: { flex: 1, gap: spacing.xxs },
  eyebrow: { ...typography.bodySmall, color: colors.textSecondary },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});

export default ScreenHeader;
