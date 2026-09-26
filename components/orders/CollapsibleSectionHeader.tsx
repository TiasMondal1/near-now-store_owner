import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, layout, motion, radius, spacing } from "../../lib/theme";

export type CollapsibleSectionHeaderProps = {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
};

/**
 * The pre-redesign date-group header for Orders → Previous: uppercase 11/700
 * tracked title, hairline rule, count pill and a small chevron (forward when
 * collapsed, down when expanded — animated over `motion.layout`). Still a
 * 44dp button announcing its `expanded` state.
 */
export function CollapsibleSectionHeader({ title, count, expanded, onToggle, testID }: CollapsibleSectionHeaderProps) {
  const rotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: motion.layout,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${count} ${count === 1 ? "order" : "orders"}`}
      accessibilityHint={expanded ? "Double tap to collapse" : "Double tap to expand"}
      accessibilityState={{ expanded }}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.line} />
      <View style={styles.right}>
        <View style={styles.countPill}>
          <Text style={styles.count} accessibilityLabel={`${count} orders`}>
            {count}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    marginTop: spacing.xs,
    paddingVertical: 4,
  },
  pressed: { opacity: 0.7 },
  title: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flexShrink: 0,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  right: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
  countPill: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  count: { color: colors.textTertiary, fontSize: 11, fontWeight: "700" },
});

export default CollapsibleSectionHeader;
