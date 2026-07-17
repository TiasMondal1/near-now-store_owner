
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { saveSession } from "../session";
import { coalesceEmail } from "../lib/emailForApi";
import { config } from "../lib/config";
import { isShopkeeperAppRole, normalizeToShopkeeperRole } from "../lib/shopkeeperRole";
import { colors, radius, spacing, shadows } from "../lib/theme";

const API_BASE = config.API_BASE;

export default function StoreOwnerOtpScreen() {
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const existsParam = typeof params.exists === "string" ? params.exists : "false";
  const isExisting = existsParam === "true";

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigatedAway = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleDigitChange = (index: number, value: string) => {
    const only = value.replace(/[^0-9]/g, "");
    if (only.length > 1) {
      const nextDigits = ["", "", "", "", "", ""];
      for (let i = 0; i < 6; i++) nextDigits[i] = only[i] ?? "";
      setDigits(nextDigits);
      inputsRef.current[Math.min(only.length - 1, 5)]?.focus();
      return;
    }
    const nextDigits = [...digits];
    nextDigits[index] = only;
    setDigits(nextDigits);
    if (only && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) inputsRef.current[index - 1]?.focus();
  };

  const otp = digits.join("");
  const isValid = otp.length === 6;
  const maskedPhone = phone && phone.length >= 4 ? `${phone.slice(0, 4)}•••••${phone.slice(-2)}` : phone || "+91 ••••••••••";

  const handleVerify = async () => {
    if (!isValid || loading) return;
    if (!phone || !sessionId) { Alert.alert("Error", "Missing verification details. Go back and try again."); return; }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      setLoading(true);
      const baseUrl = API_BASE.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/api/auth/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, role: "shopkeeper" }), signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const raw = await res.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { if (__DEV__) console.warn("OTP verify: non-JSON response", raw?.slice(0, 200)); }
      if (!res.ok) { const msg = json?.error || json?.message || (raw?.slice(0, 100) || `Server error ${res.status}`); if (__DEV__) console.warn("OTP verify failed", res.status, msg); Alert.alert("Verification failed", msg + (res.status === 401 ? "\n\nCheck that the code is correct and not expired." : "")); return; }
      if (!json || json.success === false) { Alert.alert("Error", json?.error || json?.message || "Invalid response. Please try again."); return; }
      const token = json.token ?? json.data?.token ?? json.access_token ?? json.data?.access_token ?? json.accessToken ?? json.data?.accessToken;
      const user = json.user ?? json.data?.user ?? json.data;
      const mode = (json.mode ?? json.data?.mode ?? "").toLowerCase();
      if (__DEV__) { console.log("[OTP] Login successful", { mode, hasToken: !!token, userRole: user?.role }); }
      if (!token && mode !== "signup") { Alert.alert("Error", "Invalid server response (missing token). Please try again."); return; }
      const hasToken = !!token;
      if (hasToken && user?.role && !isShopkeeperAppRole(user.role)) { Alert.alert("Login failed", "The phone number does not match our records."); return; }
      if (hasToken) {
        await saveSession({ token, user: { id: user?.id ?? json.userId ?? json.data?.userId ?? "", name: user?.name ?? user?.full_name ?? "Shopkeeper", role: normalizeToShopkeeperRole(user?.role), isActivated: user?.isActivated ?? user?.is_activated ?? true, phone: user?.phone ?? phone, email: (() => { const e = coalesceEmail(user?.email, ""); return e || undefined; })() } });
        navigatedAway.current = true; router.replace("/"); return;
      }
      if (mode === "signup" && !hasToken) { const signupTicket = json.signupTicket ?? json.data?.signupTicket; router.replace({ pathname: "/store-owner-signup", params: { phone, signupTicket } }); return; }
      Alert.alert("Login Error", "Could not log you in as shopkeeper.\n\nYour phone may be registered as customer only.");
    } catch (e: any) {
      clearTimeout(timeoutId);
      const msg = e?.message || String(e);
      if (e?.name === "AbortError" || msg.includes("aborted")) { Alert.alert("Server is starting up", "Please wait 10 seconds and try again."); }
      else { Alert.alert("Error", msg.includes("Network") || msg.includes("fetch") ? "Cannot reach server. Check your internet." : "Something went wrong. Please try again."); }
    } finally { if (!navigatedAway.current) setLoading(false); }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || resendLoading || !phone) return;
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
    try {
      setResendLoading(true);
      const res = await fetch(`${API_BASE.replace(/\/+$/, "")}/api/auth/send-otp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }), signal: c.signal });
      clearTimeout(t);
      const raw = await res.text(); let json: any = null; try { json = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok || !json || json.success === false) { Alert.alert("Error", json?.error || "Could not resend OTP."); return; }
      setSecondsLeft(60);
    } catch (e: any) { clearTimeout(t); Alert.alert("Error", e?.name === "AbortError" ? "Server starting up. Wait and retry." : "Network error."); }
    finally { setResendLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          <View style={styles.topSection}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Enter the 6-digit code</Text>
            <Text style={styles.subtitle}>
              We sent a code to <Text style={styles.highlight}>{maskedPhone}</Text>
            </Text>
            <Text style={styles.smallText}>
              {isExisting ? "Once verified, we'll log you into your store dashboard." : "Once verified, you'll set up your store details."}
            </Text>
          </View>

          <View style={styles.otpBlock}>
            <View style={styles.otpRow}>
              {digits.map((d, idx) => (
                <TextInput
                  key={idx}
                  ref={(el) => { inputsRef.current[idx] = el; }}
                  style={[styles.otpInput, focusedIndex === idx && styles.otpInputFocused, d !== "" && styles.otpInputFilled]}
                  keyboardType="number-pad"
                  value={d}
                  onChangeText={(v) => handleDigitChange(idx, v)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(idx, nativeEvent.key)}
                  onFocus={() => setFocusedIndex(idx)}
                  autoFocus={idx === 0}
                  textContentType="oneTimeCode"
                  autoComplete={idx === 0 ? "sms-otp" : "off"}
                  importantForAutofill={idx === 0 ? "yes" : "no"}
                  selectTextOnFocus
                  selectionColor={colors.primary}
                />
              ))}
            </View>
            <Text style={styles.otpHint}>6-digit OTP · Expires in a few minutes</Text>
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity
              activeOpacity={isValid && !loading ? 0.85 : 1}
              onPress={handleVerify}
              disabled={!isValid || loading}
              style={[styles.primaryButton, (!isValid || loading) && styles.buttonDisabled]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify & continue</Text>}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't get the code?</Text>
              {secondsLeft > 0 ? (
                <Text style={styles.resendTimer}>Resend in {secondsLeft}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
                  <Text style={styles.resendLink}>{resendLoading ? "Resending..." : "Resend OTP"}</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={() => router.replace("/App")} style={styles.backRow}>
              <Text style={styles.backText}>Use a different number</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl, justifyContent: "space-between" },
  topSection: { gap: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  highlight: { color: colors.textPrimary, fontWeight: "600" },
  smallText: { fontSize: 13, color: colors.textTertiary, marginTop: spacing.xs, lineHeight: 19 },
  otpBlock: { alignItems: "center" },
  otpRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: radius.md,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  otpInputFocused: { borderColor: colors.primary, backgroundColor: colors.primaryBg, ...shadows.sm },
  otpInputFilled: { borderColor: colors.primary + "50", backgroundColor: colors.surface },
  otpHint: { fontSize: 12, color: colors.textTertiary, marginTop: spacing.md },
  bottomSection: { gap: spacing.lg },
  primaryButton: { borderRadius: radius.md, paddingVertical: 16, alignItems: "center", backgroundColor: colors.primary, ...shadows.md },
  primaryButtonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  buttonDisabled: { opacity: 0.45, shadowOpacity: 0 },
  resendRow: { flexDirection: "row", justifyContent: "center", gap: 6, alignItems: "center" },
  resendText: { fontSize: 13, color: colors.textTertiary },
  resendTimer: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  resendLink: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  backRow: { alignItems: "center" },
  backText: { fontSize: 13, color: colors.primary, fontWeight: "500" },
});
