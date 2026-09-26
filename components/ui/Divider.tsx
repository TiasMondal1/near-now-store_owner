import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../lib/theme";

export type DividerProps = {
  /** Left inset in dp (e.g. 56 to align under a list-row title). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Hairline `borderLight` separator. */
export function Divider({ inset = 0, style }: DividerProps) {
  return <View style={[styles.line, inset > 0 && { marginLeft: inset }, style]} accessibilityElementsHidden />;
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    alignSelf: "stretch",
  },
});

export default Divider;
