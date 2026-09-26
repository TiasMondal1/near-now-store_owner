import React, { forwardRef, useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import type { IoniconName } from "./types";

export type TextFieldProps = Omit<TextInputProps, "style" | "editable"> & {
  /** 13/500 label above the field. */
  label?: string;
  /** Helper text under the field (hidden while `error` is set). */
  helper?: string;
  /** Error text under the field; also paints the border. Announced politely. */
  error?: string;
  /** Static text before the input, e.g. "+91". */
  prefix?: string;
  leftIcon?: IoniconName;
  rightIcon?: IoniconName;
  /** Makes the right icon a 40dp button (e.g. clear, show password). */
  onRightIconPress?: () => void;
  rightIconAccessibilityLabel?: string;
  disabled?: boolean;
  /** Style for the outer wrapper (label + field + helper). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Style for the bordered field box only. */
  fieldStyle?: StyleProp<ViewStyle>;
  /** `TextInput` style overrides (rarely needed). */
  inputStyle?: TextInputProps["style"];
};

/**
 * Single text input with label, helper/error, prefix and icons. Forwards
 * every `TextInput` prop and the ref (`ref.current?.focus()`).
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    helper,
    error,
    prefix,
    leftIcon,
    rightIcon,
    onRightIconPress,
    rightIconAccessibilityLabel,
    disabled = false,
    containerStyle,
    fieldStyle,
    inputStyle,
    multiline,
    onFocus,
    onBlur,
    placeholderTextColor,
    accessibilityLabel,
    ...inputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
    (e) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus]
  );
  const handleBlur = useCallback<NonNullable<TextInputProps["onBlur"]>>(
    (e) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur]
  );

  const hasError = Boolean(error);

  // iOS has no live regions — announce the error to VoiceOver when it changes.
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const borderWidth = focused ? 2 : hasError ? 1.5 : 1;
  const borderColor = focused ? colors.primary : hasError ? colors.error : colors.border;
  // Keep the text position stable as the border thickens.
  const paddingHorizontal = spacing.md + 1 - borderWidth;
  const textColor = disabled ? colors.textDisabled : colors.textPrimary;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          multiline ? styles.fieldMultiline : styles.fieldSingle,
          { borderWidth, borderColor, paddingHorizontal },
          disabled && styles.fieldDisabled,
          fieldStyle,
        ]}
      >
        {leftIcon ? (
          <Ionicons name={leftIcon} size={iconSize.md} color={disabled ? colors.textDisabled : colors.textSecondary} />
        ) : null}
        {prefix ? <Text style={[styles.prefix, disabled && { color: colors.textDisabled }]}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          {...inputProps}
          multiline={multiline}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
          // textMuted (~5.3:1), not textTertiary — the theme reserves that for icons.
          placeholderTextColor={placeholderTextColor ?? colors.textMuted}
          accessibilityLabel={accessibilityLabel ?? label ?? inputProps.placeholder}
          accessibilityState={{ disabled }}
          textAlignVertical={multiline ? "top" : "center"}
          style={[styles.input, { color: textColor }, multiline && styles.inputMultiline, inputStyle]}
        />
        {rightIcon ? (
          onRightIconPress ? (
            <Pressable
              onPress={onRightIconPress}
              disabled={disabled}
              hitSlop={layout.compactHitSlop}
              accessibilityRole="button"
              accessibilityLabel={rightIconAccessibilityLabel ?? "Clear"}
              accessibilityState={{ disabled }}
              style={styles.rightButton}
            >
              <Ionicons name={rightIcon} size={iconSize.md} color={disabled ? colors.textDisabled : colors.textSecondary} />
            </Pressable>
          ) : (
            <Ionicons name={rightIcon} size={iconSize.md} color={disabled ? colors.textDisabled : colors.textSecondary} />
          )
        ) : null}
      </View>
      {hasError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.xs + spacing.xxs },
  label: { ...typography.label, color: colors.textSecondary },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  fieldSingle: { height: layout.fieldHeight },
  fieldMultiline: { minHeight: layout.multilineFieldMinHeight, alignItems: "flex-start", paddingVertical: spacing.md },
  fieldDisabled: { backgroundColor: colors.surfaceVariant },
  prefix: { ...typography.body, fontWeight: "500", color: colors.textSecondary },
  input: {
    ...typography.input,
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: "100%",
  },
  inputMultiline: { height: undefined, minHeight: layout.multilineFieldMinHeight - spacing.md * 2 },
  rightButton: {
    width: layout.touchTargetCompact,
    height: layout.touchTargetCompact,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -spacing.sm,
  },
  helper: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.errorText },
});

export default TextField;
