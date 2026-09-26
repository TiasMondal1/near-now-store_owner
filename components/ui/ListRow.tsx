import React from "react";
import {
  AccessibilityActionEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";
import type { IoniconName } from "./types";

export type ListRowLeadingSize = 40 | 48 | 52;

export type ListRowProps = {
  title: string;
  /** 13/400 textMuted, max 2 lines. */
  description?: string;
  /** Custom node in the 40dp leading slot (avatar, thumbnail, checkbox). */
  leading?: React.ReactNode;
  /** Ionicons glyph in the leading slot (20, textSecondary). */
  icon?: IoniconName;
  /** Puts `icon` inside a `surfaceVariant` rounded tile filling the leading slot. */
  iconTile?: boolean;
  /**
   * Leading slot size. Default 40. Use 48 / 52 for thumbnail rows; a `leading`
   * thumbnail should fill the slot (`width: "100%", height: "100%"`, `radius.md`).
   */
  leadingSize?: ListRowLeadingSize;
  /** Custom trailing node (Badge, Switch, IconButton). Rendered before the chevron. */
  trailing?: React.ReactNode;
  /** Plain value text on the right (15/400 textSecondary). Ignored when `trailing` is set. */
  value?: string;
  /** 20dp chevron in textTertiary after the trailing content. */
  chevron?: boolean;
  /** Hairline `borderLight` at the bottom. Skip on the last row. */
  showSeparator?: boolean;
  /** Zero horizontal padding — for rows inside a padded Card. Default false (gutter padding). */
  inset?: boolean;
  /** Title and icon in errorText (ActionSheet "Remove"). */
  destructive?: boolean;
  onPress?: () => void;
  /**
   * With `onPress`: a normal secondary gesture on the pressable row. Without
   * `onPress`: the row stays static (trailing `Switch` etc. stay reachable) and
   * the long-press is exposed to screen readers as a custom action on the text
   * block, labelled `longPressLabel`.
   */
  onLongPress?: () => void;
  /** Spoken name of the long-press custom action. Default "More actions". */
  longPressLabel?: string;
  disabled?: boolean;
  /** Spoken label for the pressable row. Default "title, description, value". Ignored on static rows. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The standard row: minHeight 56, leading 40dp slot (48 / 52 via `leadingSize`),
 * title/description, trailing. Becomes a grouped `Pressable` only when `onPress`
 * is provided; a lone `onLongPress` keeps the row ungrouped and adds a custom
 * accessibility action instead.
 */
export function ListRow({
  title,
  description,
  leading,
  icon,
  iconTile = false,
  leadingSize = layout.listRowLeadingSlot,
  trailing,
  value,
  chevron = false,
  showSeparator = false,
  inset = false,
  destructive = false,
  onPress,
  onLongPress,
  longPressLabel = "More actions",
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const { gutter } = useLayout();
  const titleColor = destructive ? colors.errorText : colors.textPrimary;
  const iconColor = destructive ? colors.errorText : colors.textSecondary;
  const hasLeading = Boolean(leading) || Boolean(icon);
  // `value` is only visible when no custom `trailing` node is rendered.
  const defaultLabel = [title, description, trailing == null ? value : null].filter(Boolean).join(", ");
  const spokenLabel = accessibilityLabel ?? defaultLabel;
  const longPressOnly = Boolean(onLongPress) && !onPress;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    if (event.nativeEvent.actionName === "longpress") onLongPress?.();
  };

  const content = (
    <>
      {hasLeading ? (
        <View style={[styles.leading, { width: leadingSize, height: leadingSize }, iconTile && styles.iconTile]}>
          {leading ?? (icon ? <Ionicons name={icon} size={iconSize.md} color={iconColor} /> : null)}
        </View>
      ) : null}
      <View
        style={styles.text}
        // Long-press-only rows: the text block is the accessible element that
        // carries the custom action, so a trailing Switch stays its own element.
        accessible={longPressOnly || undefined}
        accessibilityLabel={longPressOnly ? spokenLabel : undefined}
        accessibilityHint={longPressOnly ? accessibilityHint : undefined}
        accessibilityState={longPressOnly ? { disabled } : undefined}
        accessibilityActions={longPressOnly ? [{ name: "longpress", label: longPressLabel }] : undefined}
        onAccessibilityAction={longPressOnly ? onAccessibilityAction : undefined}
      >
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing != null ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : value != null ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward-outline" size={iconSize.md} color={colors.textTertiary} /> : null}
    </>
  );

  const rowStyle = [
    styles.row,
    { paddingHorizontal: inset ? 0 : gutter },
    showSeparator && styles.separator,
    disabled && styles.disabled,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={spokenLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        accessibilityActions={onLongPress ? [{ name: "longpress", label: longPressLabel }] : undefined}
        onAccessibilityAction={onLongPress ? onAccessibilityAction : undefined}
        testID={testID}
        style={({ pressed }) => [rowStyle, pressed && !disabled && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  if (longPressOnly) {
    // Touch long-press works on the whole row; the wrapper is NOT an accessible
    // group so the trailing Switch / IconButton remain separately focusable.
    return (
      <Pressable
        onLongPress={onLongPress}
        disabled={disabled}
        accessible={false}
        importantForAccessibility="no"
        testID={testID}
        style={({ pressed }) => [rowStyle, pressed && !disabled && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  // Static rows are not grouped: VoiceOver ignores a label on a non-accessible
  // View and TalkBack would let it shadow interactive children (Switch, IconButton).
  return (
    <View style={rowStyle} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.listRowMinHeight,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  disabled: { opacity: layout.disabledOpacity },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconTile: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  text: { flex: 1, gap: spacing.xxs },
  title: { ...typography.bodyStrong },
  description: { ...typography.description, color: colors.textMuted },
  trailing: { alignItems: "flex-end", justifyContent: "center" },
  value: { ...typography.body, color: colors.textSecondary, maxWidth: "45%" },
});

export default ListRow;
