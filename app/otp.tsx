
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

const PRIMARY = "#765fba";
const BG = "#05030A";
const API_BASE = "http://192.168.1.117:3001";

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
      Alert.alert("Error", "Missing verification details.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/phone/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          sessionId,
          otp,
        }),
      });

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        console.log("Non-JSON from /auth/phone/verify:", raw);
      }

      if (!res.ok || !json || json.success === false) {
        console.log("OTP verify error:", res.status, raw);
        Alert.alert("Error", json?.error || "Invalid OTP. Please try again.");
        return;
      }

      if (json.mode === "login" && json.token && json.user) {
        await saveSession({
          token: json.token,
          user: {
            id: json.user.id,
            name: json.user.name,
            role: json.user.role,
            isActivated: json.user.isActivated ?? json.user.is_activated ?? false,
            phone: json.user.phone ?? phone,
            email: json.user.email ?? undefined,
          },
        });

        router.replace("/owner-home");
        return;
      }

      if (json.mode === "signup") {
        router.replace({
          pathname: "/store-owner-signup",
          params: {
            phone,
          },
        });
        return;
      }

      Alert.alert("Error", "Unexpected response from server.");
    } catch (e) {
      console.log("Network error verifying OTP:", e);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || resendLoading) return;
    if (!phone) return;

    try {
      setResendLoading(true);
      const res = await fetch(`${API_BASE}/auth/phone/start`, {
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
                  ref={(el) => (inputsRef.current[idx] = el)}
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
              onPress={() => router.back()}
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
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  topSection: {
    paddingTop: 24,
    gap: 8,
  },
  appTag: {
    fontSize: 11,
    color: "#9C94D7",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "#C4BDEA",
  },
  highlight: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  smallText: {
    fontSize: 12,
    color: "#948BD0",
    marginTop: 4,
  },
  otpBlock: {
    alignItems: "center",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 24,
    marginBottom: 8,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderRadius: 14,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    backgroundColor: "#120D24",
    borderWidth: 1,
    borderColor: "#392B6A",
  },
  otpHint: {
    fontSize: 11,
    color: "#7A70A6",
    marginTop: 4,
  },
  bottomSection: {
    gap: 12,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    backgroundColor: "rgba(118, 95, 186, 0.45)",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    alignItems: "center",
  },
  resendText: {
    fontSize: 12,
    color: "#7A70A6",
  },
  resendTimer: {
    fontSize: 12,
    color: "#C4BDEA",
  },
  resendLink: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  backRow: {
    alignItems: "center",
    marginTop: 4,
  },
  backText: {
    fontSize: 12,
    color: "#C4BDEA",
  },
});
