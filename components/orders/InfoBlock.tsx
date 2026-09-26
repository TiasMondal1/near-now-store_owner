import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../lib/theme";
import type { IoniconName } from "../ui";

export type InfoBlockProps = {
  /** Uppercase 10/600 label above the value, e.g. "Pickup Code", "Deliver to (receiver)". */
  label: string;
  /** The value node(s). */
  children: React.ReactNode;
  /** Caption to the right of the value column. */
  hint?: string;
  icon?: IoniconName;
  /** Read as one group when set (use for static values only). */
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * The pre-redesign "pickupCodeBox": full-bleed primary-tinted band (bg
 * `primary + "08"`, 1px `primary + "20"` top/bottom rules) with a 32dp icon
 * square, uppercase label and value column. Used inside ActiveOrderCard for
 * the pickup code and the receiver details.
 */
export function InfoBlock({ label, children, hint, icon, accessibilityLabel, testID }: InfoBlockProps) {
  return (
    <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} testID={testID} style={styles.root}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={14} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {children}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "08",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.primary + "20",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  label: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hint: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", flexShrink: 1, maxWidth: "40%" },
});

export default InfoBlock;
