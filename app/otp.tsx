import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import {
  Button,
  OtpInput,
  Screen,
  TopBar,
  triggerHaptic,
  useToast,
  type OtpInputHandle,
} from "../components/ui";
import { goBackOr, useHardwareBackTo } from "../lib/navigation";
import { saveSession } from "../session";
import { coalesceEmail } from "../lib/emailForApi";
import { apiUrl } from "../lib/apiUrl";
import { config } from "../lib/config";
import { isShopkeeperAppRole, normalizeToShopkeeperRole } from "../lib/shopkeeperRole";
import { resolveAuthenticatedRoute } from "../lib/storeApproval";
import { colors, layout, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";

const API_BASE = config.API_BASE;
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;
const REQUEST_TIMEOUT_MS = 20000;

// User-facing copy. Server bodies and status codes stay in __DEV__ logs only.
const WRONG_CODE_ERROR = "That code didn't work. Check it and try again.";
const GENERIC_ERROR = "Something went wrong. Try again.";
const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
const TIMEOUT_ERROR = "The server took too long to respond. Wait a few seconds and try again.";
const MISSING_DETAILS_ERROR = "Missing verification details. Go back and try again.";
const WRONG_ROLE_ERROR = "The phone number does not match our records.";
const CUSTOMER_ONLY_ERROR =
  "Could not log you in as shopkeeper. Your phone may be registered as customer only.";
const RESEND_FAILED_ERROR = "Couldn't resend the code. Try again.";
const RESEND_TIMEOUT_ERROR = "The server took too long to respond. Try again.";

/** "+919876543210" → "+91 98765 43210"; anything else is shown as typed. */
function formatIndianPhone(raw: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(raw);
  return match ? `+91 ${match[1]} ${match[2]}` : raw || "+91";
}

/** A server-supplied message is only shown when it is a plain string. */
function serverMessage(json: any): string | undefined {
  const msg = json?.error ?? json?.message;
  return typeof msg === "string" && msg.trim() ? msg : undefined;
}

/** Verify the 6-digit OTP, resend after a cooldown, or change number. */
export default function StoreOwnerOtpScreen() {
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  // "register" only when the owner came in via "Register your store" — it
  // shapes copy and step numbering; the server still decides login vs signup.
  const isRegister = params.mode === "register";
  const phoneHref = useMemo<Href>(
    () => (isRegister ? { pathname: "/App", params: { mode: "register" } } : "/App"),
    [isRegister],
  );
  // Reached via router.replace from the phone screen, so there is no stack
  // history: hardware back must go to the phone screen, not exit the app.
  useHardwareBackTo(phoneHref);

  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { show: showToast } = useToast();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_S);
  const navigatedAway = useRef(false);
  const otpRef = useRef<OtpInputHandle>(null);

  useEffect(() => {
    if (secondsLeft <= 0) {
      // Announce once when the cooldown ends instead of narrating every tick.
      AccessibilityInfo.announceForAccessibility("You can request a new code now.");
      return;
    }
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleOtpChange = useCallback((code: string) => {
    setOtp(code);
    if (code.length > 0) setError(undefined);
  }, []);

  const isValid = otp.length === OTP_LENGTH;

  /** Surface a verification failure under the boxes and let the user retype. */
  const fail = useCallback((message: string, clearCode: boolean = false) => {
    setError(message);
    void triggerHaptic("error");
    if (clearCode) otpRef.current?.clear();
    otpRef.current?.focus();
  }, []);

  const handleVerify = useCallback(async () => {
    if (!isValid || loading) return;
    if (!phone || !sessionId) {
      fail(MISSING_DETAILS_ERROR);
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      setLoading(true);
      setError(undefined);
      const res = await fetch(apiUrl(API_BASE, "/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, role: "shopkeeper" }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        if (__DEV__) console.warn("OTP verify: non-JSON response", raw?.slice(0, 200));
      }

      if (!res.ok) {
        const fromServer = serverMessage(json);
        if (__DEV__) console.warn("OTP verify failed", res.status, fromServer ?? raw?.slice(0, 100));
        // Any 4xx carries an actionable reason from the server (e.g. "OTP
        // expired", "Too many attempts", "Account blocked") — surface it as the
        // baseline did. 400/401 mean the code itself was rejected, so also clear
        // the boxes for a retype; other statuses keep the digits. 5xx bodies are
        // not user copy, so those fall back to the generic message.
        const wrongCode = res.status === 400 || res.status === 401;
        const clientError = res.status >= 400 && res.status < 500;
        const fallback = wrongCode ? WRONG_CODE_ERROR : GENERIC_ERROR;
        fail(clientError ? fromServer ?? fallback : GENERIC_ERROR, wrongCode);
        return;
      }
      if (!json || json.success === false) {
        fail(serverMessage(json) ?? GENERIC_ERROR);
        return;
      }

      const token =
        json.token ??
        json.data?.token ??
        json.access_token ??
        json.data?.access_token ??
        json.accessToken ??
        json.data?.accessToken;
      const user = json.user ?? json.data?.user ?? json.data;
      const mode = (json.mode ?? json.data?.mode ?? "").toLowerCase();
      if (__DEV__) {
        console.log("[OTP] Login successful", { mode, hasToken: !!token, userRole: user?.role });
      }
      if (!token && mode !== "signup") {
        if (__DEV__) console.warn("OTP verify: response missing token", json);
        fail(GENERIC_ERROR);
        return;
      }
      const hasToken = !!token;
      if (hasToken && user?.role && !isShopkeeperAppRole(user.role)) {
        fail(WRONG_ROLE_ERROR);
        return;
      }
      if (hasToken) {
        const userId: string = user?.id ?? json.userId ?? json.data?.userId ?? "";
        const email = coalesceEmail(user?.email, "") || undefined;
        await saveSession({
          token,
          user: {
            id: userId,
            name: user?.name ?? user?.full_name ?? "Shopkeeper",
            role: normalizeToShopkeeperRole(user?.role),
            isActivated: user?.isActivated ?? user?.is_activated ?? false,
            phone: user?.phone ?? phone,
            email,
          },
        });
        navigatedAway.current = true;
        void triggerHaptic("success");
        // Route straight to the resolved destination instead of replaying the
        // splash via "/" — the splash is for cold start only.
        try {
          router.replace(await resolveAuthenticatedRoute(token, userId || undefined));
        } catch {
          // The splash's just-logged-in path retries the same resolution.
          router.replace("/");
        }
        return;
      }
      if (mode === "signup" && !hasToken) {
        const signupTicket = json.signupTicket ?? json.data?.signupTicket;
        router.replace({ pathname: "/store-owner-signup", params: { phone, signupTicket } });
        return;
      }
      fail(CUSTOMER_ONLY_ERROR);
    } catch (e: any) {
      clearTimeout(timeoutId);
      const msg = e?.message || String(e);
      if (e?.name === "AbortError" || msg.includes("aborted")) {
        fail(TIMEOUT_ERROR);
      } else {
        fail(msg.includes("Network") || msg.includes("fetch") ? NETWORK_ERROR : GENERIC_ERROR);
      }
    } finally {
      if (!navigatedAway.current) setLoading(false);
    }
  }, [fail, isValid, loading, otp, phone, sessionId]);

  const handleResend = useCallback(async () => {
    if (secondsLeft > 0 || resendLoading || !phone) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      setResendLoading(true);
      const res = await fetch(apiUrl(API_BASE, "/auth/send-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
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
      if (!res.ok || !json || json.success === false) {
        showToast({ message: serverMessage(json) ?? RESEND_FAILED_ERROR, tone: "error" });
        return;
      }
      setSecondsLeft(RESEND_COOLDOWN_S);
      setError(undefined);
      otpRef.current?.clear();
      otpRef.current?.focus();
      showToast({ message: `New code sent to ${formatIndianPhone(phone)}`, tone: "success" });
    } catch (e: any) {
      clearTimeout(timeoutId);
      showToast({
        message: e?.name === "AbortError" ? RESEND_TIMEOUT_ERROR : NETWORK_ERROR,
        tone: "error",
      });
    } finally {
      setResendLoading(false);
    }
  }, [phone, resendLoading, secondsLeft, showToast]);

  const columnWidth = Math.min(contentWidth, layout.maxFormWidth);

  return (
    <Screen keyboardAvoiding>
      <TopBar overline={isRegister ? "Step 2 of 3" : undefined} title="Enter the code" onBack={() => goBackOr(phoneHref)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, { width: columnWidth }]}>
          <View style={styles.copy}>
            <Text style={styles.sentTo}>
              Sent to <Text style={styles.phone}>{formatIndianPhone(phone)}</Text>
            </Text>
            <Text style={styles.context}>Once verified, we&apos;ll take you to your store.</Text>
            <Text style={styles.context}>The code expires in a few minutes.</Text>
          </View>

          <OtpInput
            ref={otpRef}
            length={OTP_LENGTH}
            value={otp}
            onChange={handleOtpChange}
            autoFocus
            error={error}
            accessibilityLabel="One-time code, 6 digits"
          />

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn&apos;t get the code?</Text>
            {secondsLeft > 0 ? (
              <Text
                style={styles.resendTimer}
                accessibilityLabel={`Resend available in ${secondsLeft} seconds`}
              >
                Resend in {secondsLeft}s
              </Text>
            ) : (
              <Button
                label="Resend code"
                variant="text"
                size="sm"
                onPress={handleResend}
                loading={resendLoading}
                disabled={resendLoading}
                accessibilityHint="Sends a new one-time code to your phone"
              />
            )}
          </View>

          <View style={styles.actions}>
            <Button
              label="Verify"
              size="lg"
              fullWidth
              onPress={handleVerify}
              disabled={!isValid}
              loading={loading}
              accessibilityHint={isValid ? undefined : "Enter all 6 digits to continue"}
            />
            {!isValid && !error ? (
              <Text style={styles.hint}>Enter all 6 digits to continue.</Text>
            ) : null}
            <Button
              label="Use a different number"
              variant="text"
              size="md"
              fullWidth
              onPress={() => router.replace(phoneHref)}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: spacing.lg },
  column: { alignSelf: "center", gap: spacing.xl },
  copy: { gap: spacing.xs },
  sentTo: { ...typography.body, color: colors.textSecondary },
  phone: { ...typography.bodyStrong, color: colors.textPrimary },
  context: { ...typography.caption, color: colors.textMuted },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: layout.touchTarget,
  },
  resendText: { ...typography.label, color: colors.textMuted },
  resendTimer: { ...typography.labelStrong, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
