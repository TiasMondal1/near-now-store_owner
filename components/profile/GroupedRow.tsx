/**
 * Card-like shell for one row of a virtualised list (`FlatList`), so a set of
 * rows reads as a single grouped `Card` (surface, 1px border, `radius.lg` on
 * the first/last row) while keeping virtualisation and `ListEmptyComponent`.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius } from "../../lib/theme";

export type GroupedRowProps = {
  first: boolean;
  last: boolean;
  children: React.ReactNode;
};

export function GroupedRow({ first, last, children }: GroupedRowProps) {
  return <View style={[styles.shell, first && styles.first, last && styles.last]}>{children}</View>;
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
});

export default GroupedRow;
