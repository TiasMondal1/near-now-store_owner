import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { saveSession } from "../session";

const API_BASE = "http://192.168.1.117:3001";
const PRIMARY = "#765fba";
const BG = "#05030A";
const CARD = "#120D24";
const BORDER = "#392B6A";

export default function PasswordLogin() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValid = identifier.trim().length > 0 && password.length >= 6;

  const handleLogin = async () => {
    if (!isValid || loading) return;

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/auth/password/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: identifier.trim(),
          password,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        Alert.alert(
          "Login failed",
          json?.error === "INVALID_CREDENTIALS"
            ? "Incorrect email/phone or password"
            : json?.error || "Could not login"
        );
        return;
      }

      await saveSession({
        token: json.token,
        user: json.user,
      });

      if (json.user.role === "store_owner") {
        router.replace("/owner-home");
      } else {
        router.replace("/home");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Login using your email or phone number
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email or phone"
            placeholderTextColor="#7A70A6"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType={
              identifier.includes("@") ? "email-address" : "default"
            }
          />

          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#7A70A6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
            >
              <Text style={styles.showHide}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, !isValid && styles.disabled]}
            onPress={handleLogin}
            disabled={!isValid || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Go back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    color: "#FFF",
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#9C94D7",
    marginBottom: 24,
  },
  input: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    color: "#FFF",
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    color: "#FFF",
  },
  showHide: {
    color: "#9C94D7",
    fontSize: 12,
    fontWeight: "600",
  },
  button: {
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  back: {
    marginTop: 16,
    textAlign: "center",
    color: "#C4BDEA",
    fontSize: 12,
  },
});
