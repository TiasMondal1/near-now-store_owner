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
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;

export default function StoreOwnerPhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const onlyDigits = (value: string) => value.replace(/[^0-9]/g, "");

  const handleChange = (value: string) => {
    const digits = onlyDigits(value).slice(0, 10);
    setPhone(digits);
  };

  const isValid = phone.length === 10;

  const handleContinueWithOtp = async () => {
    if (!isValid || loading) return;
    const fullPhone = `+91${phone}`;

    let res: Response | null = null;
    let json: any = null;

    try {
      setLoading(true);
      const url = `${API_BASE}/api/auth/send-otp`;
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const raw = await res.text();
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      const isNetwork = msg.includes("Network") || msg.includes("fetch") || msg.includes("connect");
      Alert.alert(
        "Cannot reach server",
        isNetwork
          ? `App is using: ${API_BASE}\n\n• Backend must be running and listen on 0.0.0.0:3000.\n• Phone and computer on same Wi‑Fi.\n• Try: npx expo start -c (clear cache), then reload the app.`
          : "Network or parsing error. Please try again."
      );
      setLoading(false);
      return;
    }

    if (!res!.ok || !json?.success) {
      Alert.alert(
        "Error",
        json?.error || json?.message || "Unable to send OTP. Check that the near-and-now backend is running and Twilio is configured."
      );
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
          role: "store_owner",
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
            <Text style={styles.appTag}>Near&Now · Store Owner</Text>
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
              We’ll send an OTP to verify that you own this number.
            </Text>
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity
              activeOpacity={isValid && !loading ? 0.85 : 1}
              onPress={handleContinueWithOtp}
              disabled={!isValid || loading}
              style={[
                styles.primaryButton,
                (!isValid || loading) && styles.buttonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>Continue with OTP</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.termsText}>
              By continuing as a store owner, you agree to manage live inventory and orders responsibly.
            </Text>
            <Text style={styles.apiUrlText} numberOfLines={1}>
              API: {API_BASE}
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
  apiUrlText: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
