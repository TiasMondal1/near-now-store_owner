/**
 * Developer tools — TEMPORARY. Reachable from Settings only in development
 * and preview builds (lib/devTools DEV_TOOLS_AVAILABLE); production builds
 * never render the entry row and this screen redirects home.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { getSession } from "../session";
import {
  DEMO_ORDER_DELAY_MS,
  DEV_TOOLS_AVAILABLE,
  cancelDemoOrder,
  clearDemoSession,
  demoNotificationMode,
  isDemoOrderScheduled,
  isDevToolsEnabled,
  loadDemoSession,
  saveDemoSession,
  scheduleDemoOrder,
  setDevToolsEnabled,
} from "../lib/devTools";
import { notificationService } from "../lib/notifications";
import { getLastLockScreenAlertError } from "../lib/lockScreenAlert";
import { Button, Card, InlineNotice, KeyValueRow, ListRow, Screen, Section, Switch, TopBar, useToast } from "../components/ui";

export default function DevToolsScreen() {
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { show: showToast } = useToast();

  const [enabled, setEnabled] = useState(true);
  const [demoSaved, setDemoSaved] = useState<{ name: string; phone?: string; expiresAt: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pushOn, setPushOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!DEV_TOOLS_AVAILABLE) {
      router.replace("/(tabs)/home");
      return;
    }
    void isDevToolsEnabled().then(setEnabled);
    void refreshDemoSession();
    notificationService
      .areNotificationsEnabled()
      .then(setPushOn)
      .catch(() => setPushOn(false));
    if (isDemoOrderScheduled()) setCountdown(0);
  }, []);

  const refreshDemoSession = async () => {
    const s = await loadDemoSession();
    setDemoSaved(s ? { name: s.user.name, phone: s.user.phone, expiresAt: s.expiresAt } : null);
  };

  // Countdown ticker for the simulated order.
  useEffect(() => {
    if (countdown == null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const simulate = useCallback(async () => {
    await scheduleDemoOrder(DEMO_ORDER_DELAY_MS);
    setCountdown(Math.round(DEMO_ORDER_DELAY_MS / 1000));
    showToast({
      message: `Demo order arrives in ${DEMO_ORDER_DELAY_MS / 1000}s — stay here, switch tabs, or lock the phone`,
      duration: 6000,
    });
  }, [showToast]);

  const cancel = useCallback(() => {
    cancelDemoOrder();
    setCountdown(null);
    showToast({ message: "Demo order cancelled" });
  }, [showToast]);

  const saveCurrentAsDemo = useCallback(async () => {
    const s = await getSession();
    if (!s?.token) {
      showToast({ message: "No active session to save", tone: "error" });
      return;
    }
    await saveDemoSession(s);
    await refreshDemoSession();
    showToast({ message: "Saved — 'Use saved demo session' now appears on the landing screen", tone: "success" });
  }, [showToast]);

  const forgetDemo = useCallback(async () => {
    await clearDemoSession();
    await refreshDemoSession();
    showToast({ message: "Demo session removed" });
  }, [showToast]);

  const toggleEnabled = useCallback(
    async (v: boolean) => {
      setEnabled(v);
      await setDevToolsEnabled(v);
      if (!v) {
        showToast({ message: "Developer tools hidden. Re-enable by tapping the version row 7 times in Settings." });
        router.replace("/settings");
      }
    },
    [showToast]
  );

  const expires = demoSaved ? new Date(demoSaved.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;

  return (
    <Screen>
      <TopBar title="Developer tools" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, { width: contentWidth }]}>
          <InlineNotice
            tone="warning"
            title="Testing aids only"
            message="Nothing here exists in production builds. Turn the tools off below once you switch to real data."
          />

          <Section title="Incoming order popup">
            <Card padded={false}>
              <KeyValueRow label="Push permission" value={pushOn == null ? "…" : pushOn ? "Granted" : "Not granted"} showSeparator />
              <KeyValueRow
                label="Background path"
                value={
                  demoNotificationMode() === "lock-screen"
                    ? "Lock-screen ring (Notifee)"
                    : demoNotificationMode() === "banner"
                      ? "Banner only (rebuild for lock screen)"
                      : "Unavailable (Expo Go)"
                }
                showSeparator
              />
              <KeyValueRow label="Delay" value={`${DEMO_ORDER_DELAY_MS / 1000} seconds`} showSeparator />
              <KeyValueRow label="Last schedule error" value={getLastLockScreenAlertError() ?? "none"} />
            </Card>
            {countdown != null && countdown > 0 ? (
              <Button label={`Arriving in ${countdown}s — cancel`} variant="secondary" fullWidth onPress={cancel} />
            ) : (
              <Button label="Simulate incoming order" leftIcon="notifications-outline" fullWidth onPress={simulate} />
            )}
            <Text style={styles.hint}>
              Fires a fake order with the ring + Accept/Reject popup, and a real notification with the order chime.
              Lock the phone or leave the app before it arrives to test the notification path. Demo orders are
              marked DEMO and never reach the backend.
            </Text>
          </Section>

          <Button label="Open order alert setup" variant="secondary" fullWidth leftIcon="shield-checkmark-outline" onPress={() => router.push("/alert-setup")} />

          <Section title="Demo login (skip OTP)">
            <Card padded={false}>
              {demoSaved ? (
                <ListRow
                  icon="key-outline"
                  iconTile
                  title={demoSaved.name}
                  description={`${demoSaved.phone ?? "Saved session"} · valid till ${expires}`}
                />
              ) : (
                <ListRow icon="key-outline" iconTile title="No demo session saved" description="Save this login to skip OTP next time" />
              )}
            </Card>
            <View style={styles.row}>
              <Button label="Save this login" variant="tonal" style={styles.flex} onPress={saveCurrentAsDemo} />
              {demoSaved ? <Button label="Forget" variant="destructive" style={styles.flex} onPress={forgetDemo} /> : null}
            </View>
            <Text style={styles.hint}>
              Reuses this device&apos;s real login token, so no Twilio OTP is sent. After logging out, tap &quot;Use saved
              demo session&quot; on the landing screen.
            </Text>
          </Section>

          <Section title="Visibility">
            <Card padded={false}>
              <ListRow
                title="Show developer tools"
                description="Hides this screen and the Settings entry"
                trailing={<Switch accessibilityLabel="Show developer tools" value={enabled} onValueChange={(v) => void toggleEnabled(v)} />}
              />
            </Card>
          </Section>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: "center" },
  column: { gap: spacing.xl },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  hint: { ...typography.caption, color: colors.textMuted },
});
