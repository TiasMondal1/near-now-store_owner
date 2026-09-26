import React, { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Screen, TextField, TopBar, triggerHaptic } from "../components/ui";
import { useHardwareBackTo } from "../lib/navigation";
import { apiUrl } from "../lib/apiUrl";
import { config } from "../lib/config";
import { colors, layout, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";

const API_BASE = config.API_BASE;
const PHONE_LENGTH = 10;
const REQUEST_TIMEOUT_MS = 20000;

const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
const TIMEOUT_ERROR = "The server took too long to respond. Try again.";
const GENERIC_ERROR = "Something went wrong. Try again.";

/**
 * Phone-number entry; requests an OTP for a 10-digit Indian mobile.
 * Landing passes `mode: "register"` when the owner tapped "Register your
 * store"; that only shapes the copy and step numbering — the server decides
 * whether the number logs in or starts a new registration.
 */
export default function StoreOwnerPhoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isRegister = params.mode === "register";
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  // Reached via router.replace from landing (no stack history) — hardware
  // back should return to landing rather than exit the app.
  useHardwareBackTo("/landing");

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);

  const handleChange = useCallback((value: string) => {
    const digits = value.replace(/[^0-9]/g, "").slice(0, PHONE_LENGTH);
    setPhone(digits);
    setError(undefined);
  }, []);

  const isValid = phone.length === PHONE_LENGTH;

  const fail = useCallback((message: string) => {
    setError(message);
    setLoading(false);
    void triggerHaptic("error");
    inputRef.current?.focus();
  }, []);

  const handleContinueWithOtp = useCallback(async () => {
    if (!isValid || loading) return;
    const fullPhone = `+91${phone}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      setLoading(true);
      setError(undefined);
      const url = apiUrl(API_BASE, "/auth/send-otp");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        if (__DEV__) console.warn("[App] send-otp failed", res.status, raw?.slice(0, 200));
        fail(json?.error || json?.message || GENERIC_ERROR);
        return;
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      const msg = e?.message || String(e);
      const isAbort = e?.name === "AbortError" || msg.includes("aborted");
      if (isAbort) {
        fail(TIMEOUT_ERROR);
      } else {
        if (__DEV__) console.warn("[App] send-otp request failed:", msg);
        fail(NETWORK_ERROR);
      }
      return;
    }

    try {
      router.replace({
        pathname: "/otp",
        params: {
          phone: fullPhone,
          sessionId: "twilio",
          role: "shopkeeper",
          ...(isRegister ? { mode: "register" } : {}),
        },
      });
    } catch {
      fail(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }, [fail, isRegister, isValid, loading, phone, router]);

  const columnWidth = Math.min(contentWidth, layout.maxFormWidth);
  const remaining = PHONE_LENGTH - phone.length;

  return (
    <Screen keyboardAvoiding>
      <TopBar overline={isRegister ? "Step 1 of 3" : undefined} title="Your phone number" onBack={() => router.replace("/landing")} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, { width: columnWidth }]}>
          <Text style={styles.intro}>
            {isRegister
              ? "Enter your mobile number and we'll text you a one-time code. You'll set up your store right after verification."
              : "Log in with the mobile number linked to your store. We'll text you a one-time code."}
          </Text>

          <TextField
            ref={inputRef}
            label="Phone number"
            prefix="+91"
            value={phone}
            onChangeText={handleChange}
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            inputMode="numeric"
            maxLength={PHONE_LENGTH}
            autoFocus
            // No OS phone autofill: it offers the full "+91 …" number, which the
            // fixed +91 prefix plus maxLength 10 would mangle into a wrong number.
            autoComplete="off"
            textContentType="none"
            returnKeyType="done"
            onSubmitEditing={handleContinueWithOtp}
            accessibilityLabel="Phone number"
            error={error}
          />

          <View style={styles.actions}>
            <Button
              label="Continue"
              size="lg"
              fullWidth
              onPress={handleContinueWithOtp}
              disabled={!isValid}
              loading={loading}
              accessibilityHint={isValid ? undefined : `Enter ${remaining} more digit${remaining === 1 ? "" : "s"} to continue`}
            />
            {!isValid ? (
              <Text style={styles.hint}>
                {phone.length === 0
                  ? "Enter your 10-digit mobile number to continue."
                  : `${remaining} more digit${remaining === 1 ? "" : "s"} to go.`}
              </Text>
            ) : null}
          </View>

          <Text style={styles.terms}>
            By continuing as a shopkeeper, you agree to manage live inventory and orders responsibly.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: spacing.lg },
  column: { alignSelf: "center", gap: spacing.xl },
  intro: { ...typography.body, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  terms: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
