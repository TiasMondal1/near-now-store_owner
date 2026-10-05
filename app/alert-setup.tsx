/**
 * Order alert setup — a checklist of every phone setting new-order alerts
 * need, with live status where the OS allows it and a deep link to the
 * exact system page for each. Reached from Home's warning card, Settings →
 * Notifications, and Developer tools; pushed once automatically after login
 * when something is missing (lib/alertSetup).
 */
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors, radius, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { confirmRequirement, openRequirement, useAlertSetup, type Requirement } from "../lib/alertSetup";
import { Button, Card, Checkbox, InlineNotice, Screen, Skeleton, TopBar } from "../components/ui";

export default function AlertSetupScreen() {
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { requirements, refresh, complete, missingCount } = useAlertSetup();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const open = useCallback(
    async (r: Requirement) => {
      setBusyKey(r.key);
      try {
        await openRequirement(r.key);
      } finally {
        setBusyKey(null);
        // Detectable rows refresh again on AppState→active; this covers the
        // in-app permission dialog case which never leaves the app.
        void refresh();
      }
    },
    [refresh]
  );

  const toggleConfirm = useCallback(
    async (r: Requirement, v: boolean) => {
      await confirmRequirement(r.key, v);
      void refresh();
    },
    [refresh]
  );

  return (
    <Screen>
      <TopBar title="Order alert setup" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, { width: contentWidth }]}>
          {requirements == null ? (
            <Card padded={false}>
              <Skeleton.ListRow count={3} />
            </Card>
          ) : complete ? (
            <InlineNotice
              tone="success"
              title="All set"
              message="This phone will ring for new orders even when it is locked or the app is closed."
            />
          ) : (
            <InlineNotice
              tone="warning"
              title={`${missingCount} setting${missingCount === 1 ? "" : "s"} to fix`}
              message="Each item below opens the exact phone setting. Come back here and it re-checks automatically."
            />
          )}

          {requirements?.map((r) => (
            <Card key={r.key}>
              <View style={styles.rowHeader}>
                <View style={[styles.statusDot, r.state === "ok" ? styles.dotOk : r.state === "missing" ? styles.dotMissing : styles.dotConfirm]}>
                  <Ionicons
                    name={r.state === "ok" ? "checkmark" : r.state === "missing" ? "close" : "help"}
                    size={14}
                    color={colors.onPrimary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.title}>{r.title}</Text>
                  <Text style={styles.status}>
                    {r.state === "ok" ? "Done" : r.state === "missing" ? "Needs your action" : "Please confirm"}
                  </Text>
                </View>
              </View>
              <Text style={styles.description}>{r.description}</Text>
              <View style={styles.actions}>
                {r.state !== "ok" || !r.detectable ? (
                  <Button
                    label={r.actionLabel}
                    size="md"
                    variant={r.state === "ok" ? "secondary" : "primary"}
                    loading={busyKey === r.key}
                    onPress={() => void open(r)}
                    style={styles.flex}
                  />
                ) : null}
              </View>
              {!r.detectable ? (
                <View style={styles.confirmRow}>
                  <Checkbox
                    accessibilityLabel={`I have turned on ${r.title}`}
                    checked={r.state === "ok"}
                    onChange={(v: boolean) => void toggleConfirm(r, v)}
                  />
                  <Text style={styles.confirmText}>I&apos;ve turned this on</Text>
                </View>
              ) : null}
            </Card>
          ))}

          {requirements && complete ? (
            <Button label="Done" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: "center" },
  column: { gap: spacing.md },
  flex: { flex: 1 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 24, height: 24, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  dotOk: { backgroundColor: colors.success },
  dotMissing: { backgroundColor: colors.errorStrong },
  dotConfirm: { backgroundColor: colors.warning },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  status: { ...typography.caption, color: colors.textMuted },
  description: { ...typography.description, color: colors.textSecondary, marginTop: spacing.sm },
  actions: { flexDirection: "row", marginTop: spacing.md },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  confirmText: { ...typography.bodySmall, color: colors.textSecondary },
});
