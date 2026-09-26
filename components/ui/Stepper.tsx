import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, spacing, typography } from "../../lib/theme";

export type StepState = "done" | "active" | "upcoming";

export type Step = {
  title: string;
  description?: string;
  state: StepState;
};

export type StepperProps = {
  steps: readonly Step[];
  style?: StyleProp<ViewStyle>;
  /** Optional label for the list container; each row already announces "Step N of M, title, state". */
  accessibilityLabel?: string;
};

const MARKER = 24;

/**
 * Vertical progress list (onboarding / verification). Markers: check (done),
 * number on primary (active), hollow (upcoming).
 */
const STATE_LABEL: Record<StepState, string> = {
  done: "completed",
  active: "current step",
  upcoming: "not started",
};

export function Stepper({ steps, style, accessibilityLabel }: StepperProps) {
  return (
    <View style={[styles.root, style]} accessibilityRole="list" accessibilityLabel={accessibilityLabel}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const done = step.state === "done";
        const active = step.state === "active";
        return (
          <View
            key={`${i}-${step.title}`}
            style={styles.row}
            accessible
            accessibilityLabel={`Step ${i + 1} of ${steps.length}, ${step.title}, ${STATE_LABEL[step.state]}${
              step.description ? `. ${step.description}` : ""
            }`}
          >
            <View style={styles.markerCol}>
              <View
                style={[
                  styles.marker,
                  done && styles.markerDone,
                  active && styles.markerActive,
                  !done && !active && styles.markerUpcoming,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark-outline" size={iconSize.sm} color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.markerText, { color: active ? colors.onPrimary : colors.textMuted }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {!last ? <View style={[styles.connector, done && styles.connectorDone]} /> : null}
            </View>
            <View style={[styles.content, !last && styles.contentGap]}>
              <Text
                style={[
                  styles.title,
                  { color: active ? colors.primary : done ? colors.textPrimary : colors.textMuted },
                ]}
              >
                {step.title}
              </Text>
              {step.description ? <Text style={styles.description}>{step.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  row: { flexDirection: "row", gap: spacing.md },
  markerCol: { alignItems: "center", width: MARKER },
  marker: {
    width: MARKER,
    height: MARKER,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  markerDone: { backgroundColor: colors.primary },
  markerActive: { backgroundColor: colors.primary },
  markerUpcoming: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  markerText: { ...typography.badge },
  connector: { flex: 1, width: 2, minHeight: spacing.lg, backgroundColor: colors.border, marginVertical: spacing.xs },
  connectorDone: { backgroundColor: colors.primaryBorder },
  content: { flex: 1, paddingTop: spacing.xxs, gap: spacing.xxs },
  contentGap: { paddingBottom: spacing.lg },
  title: { ...typography.bodyStrong },
  description: { ...typography.description, color: colors.textMuted },
});

export default Stepper;
