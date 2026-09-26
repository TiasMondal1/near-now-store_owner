import React, { useCallback } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, spacing, typography } from "../../lib/theme";
import { toast } from "./Toast";
import type { IoniconName } from "./types";

export type KeyValueRowProps = {
  label: string;
  value: string;
  icon?: IoniconName;
  /**
   * Long-press handler that copies `value` (the caller owns the clipboard call,
   * e.g. `expo-clipboard`). After it resolves a "Copied" toast is shown.
   */
  onCopy?: (value: string) => void | Promise<void>;
  /** Toast text after a successful copy. Default "Copied". */
  copiedMessage?: string;
  /** Hairline separator under the row. */
  showSeparator?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Label-left / value-right info row for profile and settings screens.
 */
export function KeyValueRow({
  label,
  value,
  icon,
  onCopy,
  copiedMessage = "Copied",
  showSeparator = false,
  style,
  testID,
}: KeyValueRowProps) {
  const handleLongPress = useCallback(async () => {
    if (!onCopy) return;
    try {
      await onCopy(value);
      toast.show({ message: copiedMessage, tone: "success", duration: 2000 });
    } catch {
      toast.show({ message: "Couldn't copy", tone: "error" });
    }
  }, [onCopy, value, copiedMessage]);

  const content = (
    <>
      <View style={styles.labelWrap}>
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} /> : null}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.value} numberOfLines={2} selectable={!onCopy}>
        {value}
      </Text>
    </>
  );

  const rowStyle = [styles.row, showSeparator && styles.separator, style];

  if (onCopy) {
    return (
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint="Long press to copy"
        testID={testID}
        style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={rowStyle} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: layout.touchTarget,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  labelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
    maxWidth: "45%",
  },
  label: { ...typography.label, color: colors.textMuted },
  value: { ...typography.body, color: colors.textPrimary, flex: 1, textAlign: "right" },
});

export default KeyValueRow;
