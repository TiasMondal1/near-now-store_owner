import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, layout, radius, spacing, toneColors, type Tone, typography } from "../../lib/theme";

export type CardProps = {
  children?: React.ReactNode;
  /** Header title (18/600). Rendered with `accessory` in a row, 12 above the body. */
  title?: string;
  /** Trailing node in the header row (Badge, text Button, IconButton). */
  accessory?: React.ReactNode;
  /** Rendered under the body with a 12 gap. */
  footer?: React.ReactNode;
  /** Turns the card into a `Pressable` with `surfaceVariant` pressed state. */
  onPress?: () => void;
  onLongPress?: () => void;
  /** Padding 16 (or 12 with `compact`). Set false when children manage their own padding (e.g. a list of rows). */
  padded?: boolean;
  compact?: boolean;
  /** Tinted background + border. Use sparingly — status usually lives in a Badge. */
  tone?: Tone;
  disabled?: boolean;
  /** Spoken label when the card is pressable (defaults to `title`). Ignored on static cards. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Level-1 static surface: `surface`, `radius.lg`, 1px border, no shadow.
 */
export function Card({
  children,
  title,
  accessory,
  footer,
  onPress,
  onLongPress,
  padded = true,
  compact = false,
  tone = "neutral",
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  const tinted = tone !== "neutral";
  const t = toneColors(tone);
  const pad = padded ? (compact ? spacing.md : spacing.lg) : 0;
  const hasHeader = Boolean(title) || Boolean(accessory);

  const body = (
    <>
      {hasHeader ? (
        <View style={[styles.header, !padded && { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
          {title ? (
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View style={styles.flex} />
          )}
          {accessory ? <View>{accessory}</View> : null}
        </View>
      ) : null}
      {children}
      {footer ? <View style={[styles.footer, !padded && { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>{footer}</View> : null}
    </>
  );

  const surfaceStyle = [
    styles.card,
    { padding: pad },
    tinted && { backgroundColor: t.bg, borderColor: t.border },
    disabled && styles.disabled,
    style,
  ];

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        testID={testID}
        style={({ pressed }) => [surfaceStyle, pressed && !disabled && !tinted && styles.pressed]}
      >
        {body}
      </Pressable>
    );
  }

  // Static cards are not grouped: VoiceOver ignores a label on a non-accessible
  // View and TalkBack would let it shadow the buttons inside.
  return (
    <View style={surfaceStyle} testID={testID}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  disabled: { opacity: layout.disabledOpacity },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  flex: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  footer: { marginTop: spacing.md },
});

export default Card;
