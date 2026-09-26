import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { Href } from "expo-router";
import { colors, layout, spacing, typography } from "../../lib/theme";
import { goBackOr } from "../../lib/navigation";
import { useLayout } from "../../lib/useLayout";
import { IconButton } from "./IconButton";

export type TopBarProps = {
  title: string;
  /** Secondary line under the title (grows the bar to 64). */
  subtitle?: string;
  /** Small uppercase line above the title, e.g. "Step 2 of 3". */
  overline?: string;
  /** Renders a 44dp back button labelled "Go back". The slot is reserved even when absent. */
  onBack?: () => void;
  /**
   * Convenience for the common `onBack={() => goBackOr("/settings")}`: when set
   * and `onBack` is absent, the back button pops history or replaces to this route.
   */
  backHref?: Href;
  /** One `IconButton` or a text `Button`. The slot is reserved (44dp) even when absent. */
  right?: React.ReactNode;
  /** Drops the surface fill and hairline (for content that sits on `background`). */
  transparent?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Fixed header bar for stack screens. Never animated; always rendered,
 * including during loading and error states.
 */
export function TopBar({ title, subtitle, overline, onBack, backHref, right, transparent = false, style }: TopBarProps) {
  const { gutter } = useLayout();
  const tall = Boolean(subtitle);
  const handleBack = onBack ?? (backHref != null ? () => goBackOr(backHref) : undefined);
  return (
    <View
      style={[
        styles.bar,
        { height: tall ? layout.topBarHeightWithSubtitle : layout.topBarHeight, paddingHorizontal: gutter - spacing.sm },
        !transparent && styles.surface,
        style,
      ]}
    >
      <View style={styles.slot}>
        {handleBack ? <IconButton icon="arrow-back-outline" accessibilityLabel="Go back" onPress={handleBack} /> : null}
      </View>
      <View style={styles.titleWrap}>
        {overline ? (
          <Text style={styles.overline} numberOfLines={1}>
            {overline}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.slot, styles.rightSlot]}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
  },
  surface: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  slot: {
    minWidth: layout.touchTarget,
    height: layout.touchTarget,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  rightSlot: { alignItems: "flex-end" },
  titleWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  overline: { ...typography.overline, color: colors.textMuted },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.label, color: colors.textMuted },
});

export default TopBar;
