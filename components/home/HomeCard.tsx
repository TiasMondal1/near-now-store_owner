/**
 * Pre-redesign card look for the Home tab: `surface`, `radius.lg`, 1px border,
 * `shadows.sm`, 16 padding, 15/700 title. Used for the incoming-orders card
 * and TodayCard so they blend with the restored StoreStatusCard / tiles.
 */
import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors, radius, shadows, spacing } from "../../lib/theme";

export type HomeCardProps = {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Trailing node in the header row. */
  accessory?: React.ReactNode;
  /** Rendered under the body with a 12 gap. */
  footer?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function HomeCard({ children, title, subtitle, accessory, footer, onPress, accessibilityLabel, accessibilityHint, style }: HomeCardProps) {
  const hasHeader = Boolean(title) || Boolean(accessory);
  const body = (
    <>
      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.flex}>
            {title ? (
              <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {accessory ? <View>{accessory}</View> : null}
        </View>
      ) : null}
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{body}</View>;
}

export type HomePrimaryButtonProps = {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
};

/** Old-style filled primary button: `colors.primary`, `radius.md`, `shadows.md`. */
export function HomePrimaryButton({ label, onPress, accessibilityHint }: HomePrimaryButtonProps) {
  return (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.md },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  footer: { marginTop: spacing.md },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    ...shadows.md,
  },
  primaryBtnText: { color: colors.onPrimary, fontSize: 14, fontWeight: "700" },
});

export default HomeCard;
