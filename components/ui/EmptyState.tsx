import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, spacing, typography } from "../../lib/theme";
import { Button, type ButtonVariant } from "./Button";
import type { IoniconName } from "./types";

export type StateAction = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
};

export type EmptyStateProps = {
  title: string;
  /** 1–2 lines, sentence case. */
  message?: string;
  /** Outline glyph. Default "file-tray-outline". */
  icon?: IoniconName;
  /** Primary CTA by default — lead to the fixing action, never to another tab in prose. */
  action?: StateAction;
  /** Smaller circle + title for inside cards. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type BaseProps = EmptyStateProps & {
  circleColor: string;
  iconColor: string;
  defaultVariant: ButtonVariant;
};

export function StateBase({
  title,
  message,
  icon = "file-tray-outline",
  action,
  compact = false,
  circleColor,
  iconColor,
  defaultVariant,
  style,
  testID,
}: BaseProps) {
  const circle = compact ? 56 : 72;
  return (
    <View style={[styles.root, compact ? styles.compactPad : styles.pad, style]} testID={testID}>
      <View style={[styles.circle, { width: circle, height: circle, backgroundColor: circleColor }]}>
        <Ionicons name={icon} size={compact ? iconSize.lg : iconSize.xl} color={iconColor} />
      </View>
      <View style={styles.text}>
        <Text style={[compact ? styles.titleCompact : styles.title]} accessibilityRole="header">
          {title}
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={action.variant ?? defaultVariant}
          size={compact ? "sm" : "md"}
          loading={action.loading}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

/**
 * Nothing-here state. Designed as a `ListEmptyComponent` so pull-to-refresh
 * keeps working; grows to fill the list.
 */
export function EmptyState(props: EmptyStateProps) {
  return (
    <StateBase
      {...props}
      circleColor={colors.primaryBg}
      iconColor={colors.primary}
      defaultVariant="primary"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  pad: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  compactPad: { paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  circle: {
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { alignItems: "center", gap: spacing.xs, maxWidth: 320 },
  title: { ...typography.subtitle, color: colors.textPrimary, textAlign: "center" },
  titleCompact: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: "center" },
  message: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center" },
  button: { minWidth: 160 },
});

export default EmptyState;
