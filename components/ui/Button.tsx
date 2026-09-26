import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import type { IoniconName } from "./types";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "destructive" | "text";
export type ButtonSize = "lg" | "md" | "sm";
export type ButtonHaptic = "light" | "success" | "none";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: IoniconName;
  rightIcon?: IoniconName;
  /** Spinner replaces the label; height stays fixed; `accessibilityState.busy`. */
  loading?: boolean;
  disabled?: boolean;
  /** Defaults to `light` for primary/destructive, `none` otherwise. */
  haptic?: ButtonHaptic;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const HEIGHT: Record<ButtonSize, number> = {
  lg: layout.buttonHeightLg,
  md: layout.buttonHeightMd,
  sm: layout.buttonHeightSm,
};

const ICON: Record<ButtonSize, number> = { lg: iconSize.md, md: iconSize.md, sm: iconSize.sm };

const LABEL = {
  lg: typography.subheading,
  md: typography.bodyStrong,
  sm: typography.labelStrong,
} as const;

const PAD_H: Record<ButtonSize, number> = { lg: spacing.xl, md: spacing.lg, sm: spacing.md };

type Look = { bg: string; pressedBg: string; border: string; text: string };

const LOOK: Record<ButtonVariant, Look> = {
  primary: { bg: colors.primary, pressedBg: colors.primaryDark, border: colors.transparent, text: colors.onPrimary },
  secondary: { bg: colors.surface, pressedBg: colors.surfaceVariant, border: colors.border, text: colors.primary },
  tonal: { bg: colors.primaryBg, pressedBg: colors.primaryBorder, border: colors.primaryBorder, text: colors.primary },
  destructive: { bg: colors.surface, pressedBg: colors.errorBg, border: colors.errorBorder, text: colors.errorText },
  text: { bg: colors.transparent, pressedBg: colors.surfaceVariant, border: colors.transparent, text: colors.primary },
};

export async function triggerHaptic(kind: ButtonHaptic | "error"): Promise<void> {
  try {
    if (kind === "light") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === "success") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === "error") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics are best-effort (unsupported on some devices / web).
  }
}

/**
 * The only button. Five looks, three heights, no shadows. "Try again" is
 * always `secondary`; destructive confirmations use `destructive`.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  fullWidth = false,
  leftIcon,
  rightIcon,
  loading = false,
  disabled = false,
  haptic,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const look = LOOK[variant];
  const inactive = disabled || loading;
  const hapticKind: ButtonHaptic =
    haptic ?? (variant === "primary" || variant === "destructive" ? "light" : "none");

  const handlePress = useCallback(() => {
    if (inactive) return;
    if (hapticKind !== "none") void triggerHaptic(hapticKind);
    onPress?.();
  }, [inactive, hapticKind, onPress]);

  const isText = variant === "text";
  const height = HEIGHT[size];
  // `text` buttons already stretch to a 44dp minHeight; filled sizes below
  // 44 (sm = 36) get a vertical hitSlop so the effective target reaches 44.
  const shortfall = Math.max(0, layout.touchTarget - height);
  const hitSlop = isText
    ? spacing.sm
    : shortfall > 0
      ? { top: shortfall / 2, bottom: shortfall / 2 }
      : undefined;

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          minHeight: isText ? layout.touchTarget : height,
          paddingHorizontal: isText ? spacing.sm : PAD_H[size],
          backgroundColor: pressed && !inactive ? look.pressedBg : look.bg,
          borderColor: look.border,
          borderWidth: isText || variant === "primary" ? 0 : 1,
        },
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={look.text} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <Ionicons name={leftIcon} size={ICON[size]} color={look.text} /> : null}
          <Text style={[LABEL[size], { color: look.text }]} numberOfLines={1}>
            {label}
          </Text>
          {rightIcon ? <Ionicons name={rightIcon} size={ICON[size]} color={look.text} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  fullWidth: { alignSelf: "stretch", width: "100%" },
  disabled: { opacity: layout.disabledOpacity, elevation: 0 },
});

export default Button;
