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

const PRIMARY = "#765fba";
const BG = "#05030A";
const API_BASE = "http://192.168.1.117:3001";

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

      res = await fetch(`${API_BASE}/auth/phone/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });


      json = await res.json();
    } catch (e) {
      Alert.alert("Error", "Network or parsing error before navigation.");
      setLoading(false);
      return;
    }

    if (!res.ok || !json.success) {
      Alert.alert("Error", json.error || "Unable to start verification.");
      setLoading(false);
      return;
    }

    try {

      router.push({
        pathname: "/otp",
        params: {
          phone: fullPhone,
          sessionId: json.sessionId,
          exists: json.exists ? "true" : "false",
          role: "store_owner",
        },
      });
    } catch (e) {
      Alert.alert("Error", "Navigation error. Check route path/params.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinueWithPassword = () => {
    if (!isValid) return;
    const fullPhone = `+91${phone}`;
    router.push({
      pathname: "/password-login",
      params: {
        phone: fullPhone,
        role: "store_owner",
      },
    });
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
            <Text style={styles.title}>Let&apos;s get your store in</Text>
            <Text style={styles.subtitle}>
              Login with your phone number to manage orders, inventory and
              availability.
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
                placeholderTextColor="#8278A6"
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
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue with OTP</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleContinueWithPassword}
              activeOpacity={isValid ? 0.85 : 1}
              disabled={!isValid}
              style={styles.secondaryButton}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  !isValid && styles.secondaryButtonTextDisabled,
                ]}
              >
                Login with password
              </Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>
              By continuing as a store owner, you agree to manage live inventory
              and orders responsibly.
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
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "#C4BDEA",
    marginTop: 4,
  },
  inputBlock: {
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    color: "#B3A9E6",
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#120D24",
    borderWidth: 1,
    borderColor: "#392B6A",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countryCodeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1A1234",
    borderWidth: 1,
    borderColor: "#4A3A80",
    marginRight: 8,
  },
  countryCodeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    color: "#FFFFFF",
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: "#7A70A6",
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
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: "#C4BDEA",
    fontWeight: "500",
  },
  secondaryButtonTextDisabled: {
    opacity: 0.4,
  },
  termsText: {
    fontSize: 11,
    color: "#7A70A6",
    textAlign: "center",
    lineHeight: 16,
  },
});
