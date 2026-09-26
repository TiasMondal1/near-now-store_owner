import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, spacing, toneColors, type Tone, typography } from "../../lib/theme";
import { BottomSheet } from "./BottomSheet";
import { Button, triggerHaptic } from "./Button";
import { InlineNotice } from "./InlineNotice";
import type { IoniconName } from "./types";

export type ConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Label of the confirming button. */
  confirmLabel: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /**
   * Runs when the user confirms. While the promise is pending the button
   * shows a spinner and the sheet cannot be dismissed. On resolve the sheet
   * closes; on reject the error is shown inline (never `Alert`).
   */
  onConfirm: () => void | Promise<void>;
  /** Uses the destructive button look and `error` tone by default. */
  destructive?: boolean;
  /** Icon circle tone. Defaults to `error` when destructive, else `info`. */
  tone?: Tone;
  /** Icon in the 64dp circle. Defaults by tone. */
  icon?: IoniconName;
  /** Fallback text when the rejection carries no message. */
  fallbackErrorMessage?: string;
  testID?: string;
};

const DEFAULT_ICON: Record<Tone, IoniconName> = {
  neutral: "help-circle-outline",
  info: "help-circle-outline",
  success: "checkmark-circle-outline",
  warning: "warning-outline",
  error: "trash-outline",
};

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

/**
 * Confirmation sheet replacing `Alert.alert(..., [{Cancel},{Confirm}])`.
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  destructive = false,
  tone,
  icon,
  fallbackErrorMessage = "Something went wrong. Please try again.",
  testID,
}: ConfirmSheetProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resolvedTone: Tone = tone ?? (destructive ? "error" : "info");
  const t = toneColors(resolvedTone);

  useEffect(() => {
    if (!visible) {
      setLoading(false);
      setErrorMessage(null);
    }
  }, [visible]);

  const handleConfirm = useCallback(async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      await onConfirm();
      void triggerHaptic("success");
      setLoading(false);
      onClose();
    } catch (err) {
      void triggerHaptic("error");
      setErrorMessage(messageOf(err, fallbackErrorMessage));
      setLoading(false);
    }
  }, [onConfirm, onClose, fallbackErrorMessage]);

  return (
    <BottomSheet visible={visible} onClose={onClose} busy={loading} accessibilityLabel={title} testID={testID}>
      <View style={styles.body}>
        <View style={[styles.circle, { backgroundColor: t.bg }]}>
          <Ionicons name={icon ?? DEFAULT_ICON[resolvedTone]} size={iconSize.xl} color={t.text} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
        {errorMessage ? <InlineNotice tone="error" title={errorMessage} /> : null}
        <View style={styles.actions}>
          <Button
            label={confirmLabel}
            onPress={handleConfirm}
            variant={destructive ? "destructive" : "primary"}
            size="lg"
            fullWidth
            loading={loading}
            haptic="none"
          />
          <Button label={cancelLabel} onPress={onClose} variant="text" size="md" fullWidth disabled={loading} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: "stretch", gap: spacing.lg, paddingTop: spacing.sm },
  circle: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { alignItems: "center", gap: spacing.xs },
  title: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  message: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  actions: { gap: spacing.xs },
});

export default ConfirmSheet;
