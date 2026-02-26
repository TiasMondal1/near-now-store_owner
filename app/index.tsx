import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";

const SPLASH_DURATION_MS = 2200;

export default function SplashScreen() {
  const router = useRouter();
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    pulseLoop.start();

    const t = setTimeout(() => {
      pulseLoop.stop();
      router.replace("/landing");
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.iconWrap,
          {
            opacity,
            transform: [{ scale: Animated.multiply(scale, pulse) }],
          },
        ]}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>N&N</Text>
        </View>
      </Animated.View>
      <Text style={styles.tagline}>Shopkeeper</Text>
      <Text style={styles.sub}>Near & Now</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconText: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.surface,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 24,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textTertiary,
  },
});
