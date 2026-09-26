import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadows, spacing } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";

export type StickyFooterProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Floating footer pinned under a long form or list. Elevation level 2:
 * `surface` + `shadows.md` and **no** border (spec §1.4 — never both). Gutter
 * padding, 12 above, `max(insets.bottom, 12)` below. Children are laid out in a
 * centred column of `contentWidth` with an 8 gap. Owns no outer margin; place
 * it as the last sibling of the scroll view inside `Screen` (edges top only).
 */
export function StickyFooter({ children, style, testID }: StickyFooterProps) {
  const insets = useSafeAreaInsets();
  const { gutter, contentWidth } = useLayout();
  return (
    <View
      style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, spacing.md) }, style]}
      testID={testID}
    >
      <View style={[styles.column, { width: contentWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.surface,
    paddingTop: spacing.md,
    alignItems: "center",
    ...shadows.md,
  },
  column: { gap: spacing.sm },
});

export default StickyFooter;
