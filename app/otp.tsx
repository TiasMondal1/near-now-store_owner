
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { saveSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

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
  const [secondsLeft, setSecondsLeft] = useState(60);

  const inputsRef = useRef<Array<TextInput | null>>([]);


  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleDigitChange = (index: number, value: string) => {
    const only = value.replace(/[^0-9]/g, "");
    const nextDigits = [...digits];
    nextDigits[index] = only.slice(-1);
    setDigits(nextDigits);

    if (only && index < inputsRef.current.length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const otp = digits.join("");
  const isValid = otp.length === 6;

  const maskedPhone =
    phone && phone.length >= 4
      ? `${phone.slice(0, 4)}•••••${phone.slice(-2)}`
      : phone || "+91 ••••••••••";

  const handleVerify = async () => {
    if (!isValid || loading) return;
    if (!phone || !sessionId) {
      Alert.alert("Error", "Missing verification details. Go back and try again.");
      return;
    }

    try {
      setLoading(true);
      const url = `${API_BASE}/api/auth/verify-otp`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, role: "store_owner" }),
      });

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        console.warn("OTP verify: non-JSON response", raw?.slice(0, 200));
      }

      if (!res.ok) {
        const msg =
          json?.error ||
          json?.message ||
          (raw?.slice(0, 100) || `Server error ${res.status}`);
        console.warn("OTP verify failed", res.status, msg);
        Alert.alert(
          "Verification failed",
          msg + (res.status === 401 ? "\n\nCheck that the code is correct and not expired." : "")
        );
        return;
      }

      if (!json || json.success === false) {
        Alert.alert(
          "Error",
          json?.error || json?.message || "Invalid response. Please try again."
        );
        return;
      }

      const token = json.token ?? json.data?.token ?? json.access_token;
      const user = json.user ?? json.data?.user;
      const isStoreOwnerRole =
        user && (user.role === "store_owner" || user.role === "shopkeeper");

      // Existing user: we have token + user (and store-owner role) → always go to dashboard
      if (token && user && isStoreOwnerRole) {
        await saveSession({
          token,
          user: {
            id: user.id,
            name: user.name ?? user.full_name ?? "Store Owner",
            role: user.role ?? "store_owner",
            isActivated: user.isActivated ?? user.is_activated ?? true,
            phone: user.phone ?? phone,
            email: user.email ?? undefined,
          },
        });
        router.replace("/owner-home");
        return;
      }

      // New user: backend said signup or no token/user → show setup store
      if (json.mode === "signup" || !token || !user) {
        router.replace({
          pathname: "/store-owner-signup",
          params: { phone },
        });
        return;
      }

      Alert.alert("Error", json?.error || json?.message || "Unexpected response from server.");
    } catch (e: any) {
      const msg =
        e?.message || String(e);
      const isNetwork =
        msg.includes("Network") ||
        msg.includes("fetch") ||
        msg.includes("Failed to connect");
      console.warn("OTP verify error", e);
      Alert.alert(
        "Error",
        isNetwork
          ? `Cannot reach server. Check that the app is using the correct API URL (${API_BASE}) and the server is running.`
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || resendLoading) return;
    if (!phone) return;

    try {
      setResendLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        console.log("Non-JSON from /auth/phone/start (resend):", raw);
      }

      if (!res.ok || !json || json.success === false) {
        console.log("Resend OTP error:", res.status, raw);
        Alert.alert("Error", json?.error || "Could not resend OTP.");
        return;
      }

      setSecondsLeft(60);
    } catch (e) {
      console.log("Network error resending OTP:", e);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={styles.container}>
          <View style={styles.topSection}>
            <Text style={styles.appTag}>Near&Now · Store Owner</Text>
            <Text style={styles.title}>Enter the 6-digit code</Text>
            <Text style={styles.subtitle}>
              We sent a code to{" "}
              <Text style={styles.highlight}>{maskedPhone}</Text>
            </Text>
            {isExisting ? (
              <Text style={styles.smallText}>
                Once verified, we&apos;ll log you into your store dashboard.
              </Text>
            ) : (
              <Text style={styles.smallText}>
                Once verified, you&apos;ll set up your store details and start
                listing products.
              </Text>
            )}
          </View>

          <View style={styles.otpBlock}>
            <View style={styles.otpRow}>
              {digits.map((d, idx) => (
                <TextInput
                  key={idx}
                  ref={(el) => {
                  inputsRef.current[idx] = el;
                }}
                  style={styles.otpInput}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={d}
                  onChangeText={(v) => handleDigitChange(idx, v)}
                  onKeyPress={({ nativeEvent }) =>
                    handleKeyPress(idx, nativeEvent.key)
                  }
                  autoFocus={idx === 0}
                />
              ))}
            </View>
            <Text style={styles.otpHint}>
              6-digit OTP · Expires in a few minutes
            </Text>
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity
              activeOpacity={isValid && !loading ? 0.85 : 1}
              onPress={handleVerify}
              disabled={!isValid || loading}
              style={[
                styles.primaryButton,
                (!isValid || loading) && styles.buttonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify & continue</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn&apos;t get the code?</Text>
              {secondsLeft > 0 ? (
                <Text style={styles.resendTimer}>
                  Resend in {secondsLeft}s
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={handleResend}
                  activeOpacity={0.85}
                  disabled={resendLoading}
                >
                  <Text style={styles.resendLink}>
                    {resendLoading ? "Resending..." : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={() => router.replace("/App")}
              activeOpacity={0.85}
              style={styles.backRow}
            >
              <Text style={styles.backText}>Use a different number</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    justifyContent: "space-between",
  },
  topSection: {
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  appTag: {
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  highlight: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  smallText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  otpBlock: {
    alignItems: "center",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderRadius: radius.md,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  otpHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  bottomSection: {
    gap: spacing.md,
  },
  primaryButton: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.surface,
  },
  buttonDisabled: {
    backgroundColor: colors.primaryDark,
    opacity: 0.7,
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    alignItems: "center",
  },
  resendText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  resendTimer: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  resendLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  backRow: {
    alignItems: "center",
    marginTop: spacing.xs,
  },
  backText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
});
