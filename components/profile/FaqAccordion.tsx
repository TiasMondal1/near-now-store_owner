/**
 * Single-expand FAQ accordion rendered inside a `Card padded={false}`. Each
 * row is a 56dp button with `accessibilityState.expanded`; the chevron rotates
 * and the answer expands with a `LayoutAnimation` (motion.layout). Rows are
 * separated by the shared `Divider`.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Divider } from "../ui";
import { colors, iconSize, layout, motion, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";

export type FaqEntry = { q: string; a: string };

export type FaqAccordionProps = {
  items: readonly FaqEntry[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const toggle = useCallback((idx: number) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(motion.layout, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setExpanded((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <View>
      {items.map((item, idx) => (
        <React.Fragment key={item.q}>
          <FaqRow question={item.q} answer={item.a} expanded={expanded === idx} onToggle={() => toggle(idx)} />
          {idx < items.length - 1 ? <Divider /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

type FaqRowProps = {
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
};

function FaqRow({ question, answer, expanded, onToggle }: FaqRowProps) {
  const { gutter } = useLayout();
  const rotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: motion.layout,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={question}
        accessibilityHint={expanded ? "Double tap to collapse" : "Double tap to expand"}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.row, { paddingHorizontal: gutter }, pressed && styles.pressed]}
      >
        <Text style={styles.question}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down-outline" size={iconSize.md} color={colors.textTertiary} />
        </Animated.View>
      </Pressable>
      {expanded ? (
        <View style={[styles.answerWrap, { paddingHorizontal: gutter }]}>
          <Text style={styles.answer}>{answer}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: layout.listRowMinHeight,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceVariant },
  question: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  answerWrap: { paddingBottom: spacing.lg },
  answer: { ...typography.bodySmall, color: colors.textSecondary },
});

export default FaqAccordion;
