import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";

const SPLASH_DURATION_MS = 2200;
const BRAND_LOGO = require("../near_now_shopkeeper.png");

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
        <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
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
  logo: {
    width: 180,
    height: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
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
