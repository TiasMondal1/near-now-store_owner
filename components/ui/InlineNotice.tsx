import React, { useEffect } from "react";
import { AccessibilityInfo, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, spacing, toneColors, type Tone, typography } from "../../lib/theme";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import type { ActionSpec, IoniconName } from "./types";

export type InlineNoticeTone = Exclude<Tone, "neutral">;

export type InlineNoticeProps = {
  title: string;
  message?: string;
  /** Bulleted list under the title / message (use instead of a "\n"-joined `message`). */
  lines?: string[];
  /** `info` (default), `success`, `warning`, `error`. */
  tone?: InlineNoticeTone;
  /** Overrides the tone's default glyph. */
  icon?: IoniconName;
  /** Rendered as a text `Button` (sm) under the message. */
  action?: ActionSpec;
  /** Shows a 40dp close button. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const BULLET = "\u2022";

const DEFAULT_ICON: Record<InlineNoticeTone, IoniconName> = {
  info: "information-circle-outline",
  success: "checkmark-circle-outline",
  warning: "warning-outline",
  error: "alert-circle-outline",
};

/**
 * In-content banner for status that must stay visible (stale data, offline,
 * pending approval, form-level errors). Error/warning announce as alerts.
 */
export function InlineNotice({ title, message, lines, tone = "info", icon, action, onDismiss, style, testID }: InlineNoticeProps) {
  const t = toneColors(tone);
  const isAlert = tone === "error" || tone === "warning";
  const bullets = lines?.filter((l) => l && l.trim().length > 0) ?? [];
  const spoken = [title, message, ...bullets].filter(Boolean).join(". ");

  // iOS has no live regions; announce alerts to VoiceOver when they appear or change.
  useEffect(() => {
    if (!isAlert || Platform.OS !== "ios") return;
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [isAlert, spoken]);

  return (
    <View
      accessibilityRole={isAlert ? "alert" : undefined}
      accessibilityLiveRegion={isAlert ? "polite" : undefined}
      testID={testID}
      style={[styles.root, { backgroundColor: t.bg, borderColor: t.border }, style]}
    >
      <Ionicons name={icon ?? DEFAULT_ICON[tone]} size={iconSize.md} color={t.text} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {bullets.length > 0 ? (
          <View style={styles.list} accessibilityRole="list">
            {bullets.map((line, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet} accessibilityElementsHidden importantForAccessibility="no">
                  {BULLET}
                </Text>
                <Text style={[styles.message, styles.listText]}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {action ? (
          <View style={styles.actionRow}>
            <Button label={action.label} onPress={action.onPress} variant="text" size="sm" />
          </View>
        ) : null}
      </View>
      {onDismiss ? (
        <IconButton
          icon="close-outline"
          size={40}
          color={t.text}
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
          style={styles.dismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  icon: { marginTop: spacing.xxs },
  body: { flex: 1, gap: spacing.xs },
  title: { ...typography.bodySmallStrong },
  message: { ...typography.description, color: colors.textSecondary },
  list: { gap: spacing.xxs },
  listItem: { flexDirection: "row", gap: spacing.sm },
  bullet: { ...typography.description, color: colors.textSecondary, width: spacing.sm },
  listText: { flex: 1 },
  actionRow: { flexDirection: "row", marginLeft: -spacing.sm },
  dismiss: { marginTop: -spacing.sm, marginRight: -spacing.sm },
});

export default InlineNotice;
