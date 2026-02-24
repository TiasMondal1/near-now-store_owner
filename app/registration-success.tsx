import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors, spacing } from "../lib/theme";

const DELAY_MS = 2500;

export default function RegistrationSuccessScreen() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/owner-home");
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>✓</Text>
        <Text style={styles.title}>Thanks for registering with Near and Now</Text>
        <Text style={styles.sub}>
          Taking you to your dashboard…
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xxl,
    alignItems: "center",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.lg,
    color: colors.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 28,
  },
  sub: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
