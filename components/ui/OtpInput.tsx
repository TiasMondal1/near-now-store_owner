import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { colors, layout, radius, spacing, typography } from "../../lib/theme";

export type OtpInputProps = {
  /** Number of digits. Default 6. */
  length?: number;
  /** Controlled value (digits only). Omit for uncontrolled. */
  value?: string;
  onChange?: (code: string) => void;
  /** Fires once when every box is filled. */
  onComplete?: (code: string) => void;
  /** Error message under the boxes; also paints the borders. */
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type OtpInputHandle = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
};

/**
 * Six-box one-time-code entry backed by a single invisible `TextInput`, so
 * paste-to-fill, SMS autofill and backspace navigation all work natively.
 * `ref.current?.focus()` opens the keyboard; `clear()` resets after a failure.
 */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  {
    length = 6,
    value,
    onChange,
    onComplete,
    error,
    autoFocus = false,
    disabled = false,
    accessibilityLabel,
    style,
    testID,
  },
  ref
) {
  const inputRef = useRef<TextInput>(null);
  const [internal, setInternal] = useState("");
  const [focused, setFocused] = useState(false);
  const completedRef = useRef<string | null>(null);

  const controlled = value !== undefined;
  const code = (controlled ? value : internal).replace(/\D/g, "").slice(0, length);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => {
        completedRef.current = null;
        if (!controlled) setInternal("");
        onChange?.("");
        inputRef.current?.clear();
      },
    }),
    [controlled, onChange]
  );

  const handleChange = useCallback(
    (text: string) => {
      const next = text.replace(/\D/g, "").slice(0, length);
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [controlled, length, onChange]
  );

  useEffect(() => {
    if (code.length === length) {
      if (completedRef.current !== code) {
        completedRef.current = code;
        onComplete?.(code);
      }
    } else {
      completedRef.current = null;
    }
  }, [code, length, onComplete]);

  const hasError = Boolean(error);
  const activeIndex = Math.min(code.length, length - 1);

  // iOS has no live regions — announce the error to VoiceOver when it changes.
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={[styles.root, style]} testID={testID}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
        accessible={false}
        style={styles.boxes}
      >
        {Array.from({ length }).map((_, i) => {
          const digit = code[i] ?? "";
          const isActive = focused && i === activeIndex && !disabled;
          const filled = digit.length > 0;
          const borderWidth = isActive ? 2 : hasError ? 1.5 : 1;
          const borderColor = hasError
            ? colors.error
            : isActive
              ? colors.primary
              : filled
                ? colors.primaryBorder
                : colors.border;
          return (
            <View
              key={i}
              style={[
                styles.box,
                { borderWidth, borderColor },
                disabled && styles.boxDisabled,
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={[styles.digit, disabled && { color: colors.textDisabled }]}>{digit}</Text>
              {isActive && !filled ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        // RN Android only maps "sms-otp" to AUTOFILL_HINT_SMS_OTP; "one-time-code"
        // is rejected ("Invalid autoComplete") and disables autofill entirely.
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        maxLength={length}
        caretHidden
        contextMenuHidden={false}
        accessibilityLabel={accessibilityLabel ?? `One-time code, ${length} digits`}
        accessibilityState={{ disabled }}
        accessibilityValue={{ text: `${code.length} of ${length} entered` }}
        style={styles.hiddenInput}
      />
      {hasError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  boxes: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  box: {
    flex: 1,
    maxWidth: layout.otpBoxMaxWidth,
    height: layout.otpBoxHeight,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxDisabled: { backgroundColor: colors.surfaceVariant },
  digit: { ...typography.code, letterSpacing: 0, color: colors.textPrimary },
  caret: {
    position: "absolute",
    width: 2,
    height: typography.code.lineHeight - spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: layout.otpBoxHeight,
    opacity: 0,
  },
  error: { ...typography.caption, color: colors.errorText, textAlign: "center" },
});

export default OtpInput;
