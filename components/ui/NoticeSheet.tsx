import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, spacing, toneColors, typography, type Tone } from "../../lib/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import type { IoniconName } from "./types";

export type NoticeSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  /** Single acknowledging action. Dismissing the sheet also runs it. */
  actionLabel: string;
  onAction: () => void;
  tone?: Tone;
  icon?: IoniconName;
  testID?: string;
};

const ICON_CIRCLE = 64;

/**
 * One-button informational sheet — replaces `Alert.alert(title, message,
 * [{ text: "Continue", onPress }])`. Unlike `ConfirmSheet` there is no
 * cancel path: closing the sheet by any means (button, backdrop, Android
 * back) acknowledges the notice and runs `onAction`.
 */
export function NoticeSheet({
  visible,
  title,
  message,
  actionLabel,
  onAction,
  tone = "warning",
  icon = "information-circle-outline",
  testID,
}: NoticeSheetProps) {
  const palette = toneColors(tone);
  return (
    <BottomSheet visible={visible} onClose={onAction} accessibilityLabel={title} testID={testID}>
      <View style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={iconSize.xl} color={palette.text} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
        </View>
        <Button label={actionLabel} size="lg" fullWidth onPress={onAction} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: "stretch", gap: spacing.lg, paddingTop: spacing.sm },
  iconCircle: {
    alignSelf: "center",
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { alignItems: "center", gap: spacing.xs },
  title: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  message: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});

export default NoticeSheet;
