/**
 * 40dp initial-letter avatar for list rows (Settings → profile row).
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, layout, radius, typography } from "../../lib/theme";

export type InitialAvatarProps = {
  name: string;
};

export function InitialAvatar({ name }: InitialAvatarProps) {
  const initial = (name.trim() || "?").charAt(0).toUpperCase();
  return (
    <View style={styles.circle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.initial}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: layout.listRowLeadingSlot,
    height: layout.listRowLeadingSlot,
    borderRadius: radius.full,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { ...typography.subheading, color: colors.primary },
});

export default InitialAvatar;
