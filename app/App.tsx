import React, { useState } from "react";
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
import { useRouter } from "expo-router";
import { apiUrl } from "../lib/apiUrl";
import { buildDevLoginBody } from "../lib/devLoginPayload";
import { coalesceEmail } from "../lib/emailForApi";
import { config } from "../lib/config";
import { normalizeToShopkeeperRole } from "../lib/shopkeeperRole";
import { saveSession } from "../session";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;

export default function StoreOwnerPhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);

  const onlyDigits = (value: string) => value.replace(/[^0-9]/g, "");

  const handleChange = (value: string) => {
    const digits = onlyDigits(value).slice(0, 10);
    setPhone(digits);
  };

  const isValid = phone.length === 10;

  const handleDevLogin = async () => {
    if (!isValid || devLoading) return;
    const fullPhone = `+91${phone}`;
    const body = buildDevLoginBody(phone);

    setDevLoading(true);
    try {
      const url = apiUrl(API_BASE, "/auth/dev-login");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const lastStatus = res.status;
      const lastRaw = await res.text();
      let lastJson: any = null;
      try {
        lastJson = lastRaw ? JSON.parse(lastRaw) : null;
      } catch {
        lastJson = null;
      }

      const token =
        lastJson?.token ??
        lastJson?.data?.token ??
        lastJson?.access_token ??
        lastJson?.data?.access_token;
      const user = lastJson?.user ?? lastJson?.data?.user ?? null;

      if (res.ok && token && user && (user.id ?? user.userId ?? user.user_id)) {
        await saveSession({
          token,
          user: {
            id: String(user.id ?? user.userId ?? user.user_id ?? ""),
            name: user.name ?? user.full_name ?? "Shopkeeper",
            role: normalizeToShopkeeperRole(user.role),
            isActivated: user.isActivated ?? user.is_activated ?? true,
            phone: user.phone ?? fullPhone,
            email: (() => {
              const e = coalesceEmail(user.email, "");
              return e || undefined;
            })(),
          },
        });
        router.replace("/owner-home");
        return;
      }

      const hint =
        __DEV__ && lastRaw
          ? `\n\nHTTP ${lastStatus}\n${lastRaw.slice(0, 280)}${lastRaw.length > 280 ? "…" : ""}`
          : "";
      const notFound =
        lastStatus === 404
          ? `No route at:\n${url}\n\nOn your Next.js API add: app/api/auth/dev-login/route.ts exporting POST. It should find app_users by phone (try body.phone, phoneE164, phoneNational10) and return JSON { token, user }.\n\nCheck EXPO_PUBLIC_API_BASE_URL — if it already ends with /api, paths are correct; if not, base should be origin only (e.g. https://your-app.vercel.app).`
          : `No shopkeeper found for ${fullPhone}. Server must return JSON with token + user (id, name, role, phone). Request sends phone variants in the body for DB matching.${hint}`;
      const msg = lastJson?.error || lastJson?.message || notFound;
      Alert.alert("Dev Login Failed", msg);
    } catch (e: any) {
      const msg = e?.message || String(e);
      Alert.alert(
        "Dev Login Error",
        msg.includes("fetch") || msg.includes("Network")
          ? "Cannot reach server. Is the backend running?"
          : msg
      );
    } finally {
      setDevLoading(false);
    }
  };

  const handleDevNewStore = () => {
    if (!isValid) return;
    const fullPhone = `+91${phone}`;
    router.push({ pathname: "/store-owner-signup", params: { phone: fullPhone } });
  };

  const handleContinueWithOtp = async () => {
    if (!isValid || loading) return;
    const fullPhone = `+91${phone}`;

    const baseUrl = API_BASE.replace(/\/+$/, "");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      setLoading(true);
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
        Alert.alert(
          "Could not send OTP",
          json?.error ||
            json?.message ||
            `Server error ${res.status}. Please try again.`
        );
        setLoading(false);
        return;
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      const msg = e?.message || String(e);
      const isAbort = e?.name === "AbortError" || msg.includes("aborted");
      if (isAbort) {
        Alert.alert(
          "Server is starting up",
          "The server took too long to respond — it may have been sleeping.\n\nPlease wait 10 seconds and try again."
        );
      } else {
        const isNetwork =
          msg.includes("Network") ||
          msg.includes("fetch") ||
          msg.includes("connect") ||
          msg.includes("timeout");
        Alert.alert(
          "Cannot reach server",
          isNetwork
            ? `Could not connect to the server. Please check your internet connection and try again.\n\nDetails: ${msg.slice(0, 100)}`
            : `Something went wrong. Please try again.\n\nDetails: ${msg.slice(0, 100)}`
        );
      }
      setLoading(false);
      return;
    }

    try {
      router.push({
        pathname: "/otp",
        params: {
          phone: fullPhone,
          sessionId: "twilio",
          exists: "false",
          role: "shopkeeper",
        },
      });
    } catch (e) {
      Alert.alert("Error", "Navigation error. Check route path/params.");
    } finally {
      setLoading(false);
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
          <TouchableOpacity
            onPress={() => router.replace("/landing")}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topSection}>
            <Text style={styles.appTag}>Near&Now · Shopkeeper</Text>
            <Text style={styles.title}>Let&apos;s get your store in</Text>
            <Text style={styles.subtitle}>
              Login with your phone number to manage orders, inventory and availability.
            </Text>
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneRow}>
              <View style={styles.countryCodeContainer}>
                <Text style={styles.countryCodeText}>+91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={handleChange}
                placeholder="XXXXXXXXXX"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
            <Text style={styles.helperText}>
              {__DEV__
                ? "Development: no OTP. Use Dev Login (existing shopkeeper) or Dev New Store (signup)."
                : "We'll send an OTP to verify that you own this number."}
            </Text>
          </View>

          <View style={styles.bottomSection}>
            {__DEV__ ? (
              <View style={styles.devRow}>
                <TouchableOpacity
                  activeOpacity={isValid && !devLoading ? 0.85 : 1}
                  onPress={handleDevLogin}
                  disabled={!isValid || devLoading}
                  style={[
                    styles.devSkipButton,
                    styles.devSkipButtonHalf,
                    (!isValid || devLoading) && styles.buttonDisabled,
                  ]}
                >
                  {devLoading ? (
                    <ActivityIndicator size="small" color="#ffcc00" />
                  ) : (
                    <Text style={styles.devSkipButtonText}>Dev: Login</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={isValid ? 0.85 : 1}
                  onPress={handleDevNewStore}
                  disabled={!isValid}
                  style={[styles.devSkipButton, styles.devSkipButtonHalf, !isValid && styles.buttonDisabled]}
                >
                  <Text style={styles.devSkipButtonText}>Dev: New Store</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={isValid && !loading ? 0.85 : 1}
                onPress={handleContinueWithOtp}
                disabled={!isValid || loading}
                style={[styles.primaryButton, (!isValid || loading) && styles.buttonDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue with OTP</Text>
                )}
              </TouchableOpacity>
            )}

            <Text style={styles.termsText}>
              By continuing as a shopkeeper, you agree to manage live inventory and orders responsibly.
            </Text>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    justifyContent: "space-between",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    marginBottom: spacing.sm,
  },
  backButtonText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: "600",
  },
  topSection: {
    gap: spacing.sm,
  },
  appTag: {
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  inputBlock: {
    marginTop: spacing.lg,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countryCodeContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceVariant,
    marginRight: spacing.sm,
  },
  countryCodeText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  phoneInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
  },
  helperText: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textTertiary,
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
  termsText: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 16,
  },
  devRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  devSkipButton: {
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#444",
    borderWidth: 1,
    borderColor: "#666",
  },
  devSkipButtonHalf: {
    flex: 1,
  },
  devSkipButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffcc00",
  },
});
