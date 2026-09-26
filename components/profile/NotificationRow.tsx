/**
 * One inbox row: type icon tile, title, message, relative time and an 8dp
 * unread dot (error tone — the same attention colour as the bell badge). Built on `ListRow` so pressed state, min height and a11y match
 * every other list in the app.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ListRow, type IoniconName } from "../ui";
import { colors, radius, spacing, typography } from "../../lib/theme";

export type NotificationRowProps = {
  icon: IoniconName;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  showSeparator?: boolean;
  onPress: () => void;
};

const DOT = 8;

export function NotificationRow({ icon, title, message, time, unread, showSeparator = false, onPress }: NotificationRowProps) {
  return (
    <ListRow
      icon={icon}
      iconTile
      title={title}
      description={message}
      showSeparator={showSeparator}
      onPress={onPress}
      accessibilityLabel={`${unread ? "Unread. " : ""}${title}. ${message}. ${time}`}
      trailing={
        <View style={styles.trailing}>
          {unread ? <View style={styles.dot} /> : null}
          <Text style={styles.time}>{time}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end", gap: spacing.xs, minWidth: spacing.xxxl },
  dot: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.error },
  time: { ...typography.caption, color: colors.textMuted },
});

export default NotificationRow;
