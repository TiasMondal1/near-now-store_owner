import React, { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button, ConfirmSheet, Screen } from "../components/ui";
import { getSession, clearSession, saveSession } from "../session";
import { DEV_TOOLS_AVAILABLE, isDevToolsEnabled, loadDemoSession } from "../lib/devTools";
import { resolveAuthenticatedRoute } from "../lib/storeApproval";
import { colors, layout, radius, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";

// 384 px copy of the 1024 px icon art; shown at 48 dp here. (2026-10-06)
const BRAND_LOGO = require("../assets/brand/near_now_shopkeeper_384.png");
const BRAND_TILE = 72;
const BRAND_LOGO_SIZE = 48;

/**
 * Entry screen for a logged-out shopkeeper. The splash already resolved the
 * session, so content renders immediately; the session re-check below only
 * redirects a logged-in owner or surfaces a customer-account mismatch.
 */
export default function LandingScreen() {
  const router = useRouter();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const [wrongAccount, setWrongAccount] = useState(false);
  // TEMPORARY dev aid (lib/devTools): restore a previously saved real login
  // token instead of paying for another Twilio OTP. Never shown in production.
  const [demoName, setDemoName] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  useEffect(() => {
    if (!DEV_TOOLS_AVAILABLE) return;
    let cancelled = false;
    (async () => {
      if (!(await isDevToolsEnabled())) return;
      const s = await loadDemoSession();
      if (!cancelled && s) setDemoName(s.user.name || "Demo shopkeeper");
    })();
    return () => { cancelled = true; };
  }, []);
  const restoreDemoSession = useCallback(async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      const s = await loadDemoSession();
      if (!s) { setDemoName(null); return; }
      await saveSession(s);
      router.replace(await resolveAuthenticatedRoute(s.token, s.user.id));
    } catch {
      router.replace("/");
    } finally {
      setDemoBusy(false);
    }
  }, [demoBusy, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (session?.user?.role === "customer") {
        setWrongAccount(true);
        return;
      }
      if (session?.token && session?.user?.id) router.replace("/(tabs)/home");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAndRetry = useCallback(async () => {
    await clearSession();
    await AsyncStorage.removeItem("inventory_persisted_state");
    await AsyncStorage.removeItem("inventory_products_cache");
  }, []);

  const goToPhone = useCallback(() => router.replace("/App"), [router]);
  // Same screen, but the phone/OTP copy and step numbering switch to the
  // registration wording so "Register" does not land on "Log in…".
  const goToRegister = useCallback(
    () => router.replace({ pathname: "/App", params: { mode: "register" } }),
    [router],
  );

  const columnWidth = Math.min(contentWidth, layout.maxFormWidth);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={[styles.column, { width: columnWidth }]}>
          <View style={styles.hero}>
            <View style={styles.brandTile}>
              <Image source={BRAND_LOGO} style={styles.brandLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.eyebrow}>Near & Now · Shopkeeper</Text>
              <Text style={styles.title} accessibilityRole="header">
                Run your store with Near & Now
              </Text>
              <Text style={styles.body}>
                Manage orders, inventory and payouts — all in one place.
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Button label="Continue with phone number" size="lg" fullWidth onPress={goToPhone} />
            <Button label="New here? Register your store" variant="text" size="md" fullWidth onPress={goToRegister} />
            {DEV_TOOLS_AVAILABLE && demoName ? (
              <Button
                label={`Use saved demo session (${demoName})`}
                variant="tonal"
                size="md"
                fullWidth
                leftIcon="key-outline"
                loading={demoBusy}
                onPress={() => void restoreDemoSession()}
              />
            ) : null}
            <Text style={styles.footer}>Phone & OTP verification only</Text>
          </View>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={wrongAccount}
        onClose={() => setWrongAccount(false)}
        tone="warning"
        icon="person-circle-outline"
        title="Wrong account type"
        message="You're signed in as a customer. This app is for store owners. Clear that session to continue as a shopkeeper."
        confirmLabel="Clear and continue"
        onConfirm={clearAndRetry}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: spacing.xxl },
  column: { flex: 1, alignSelf: "center", gap: spacing.xxl },
  hero: { flex: 1, justifyContent: "center", gap: spacing.lg },
  heroText: { gap: spacing.sm },
  brandTile: {
    width: BRAND_TILE,
    height: BRAND_TILE,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogo: { width: BRAND_LOGO_SIZE, height: BRAND_LOGO_SIZE },
  eyebrow: { ...typography.overline, color: colors.primary },
  title: { ...typography.display, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  footer: { ...typography.caption, color: colors.textMuted, textAlign: "center", paddingTop: spacing.sm },
});
