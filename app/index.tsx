import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image } from "react-native";
import { useRouter } from "expo-router";
import { getSession } from "../session";
import { hydrateStoreCache } from "../lib/appCache";
import { colors } from "../lib/theme";

const MIN_SPLASH_MS = 600;
const BRAND_LOGO = require("../near_now_shopkeeper.png");

export default function SplashScreen() {
  const router = useRouter();
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),
    ]).start();

    // Run session check + cache hydration in parallel with animation.
    // Navigate as soon as both session check AND minimum animation complete.
    const startMs = Date.now();
    let cancelled = false;

    (async () => {
      try {
        // Parallel: check session AND warm the store cache from AsyncStorage
        const [session] = await Promise.all([
          getSession(),
          hydrateStoreCache(),
        ]);

        if (cancelled) return;

        const elapsed = Date.now() - startMs;
        const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

        await new Promise<void>((resolve) => setTimeout(resolve, remaining));

        if (cancelled) return;

        const ok =
          session?.token &&
          session?.user?.id &&
          session.user.role !== "customer";

        router.replace(ok ? "/(tabs)/home" : "/landing");
      } catch {
        if (!cancelled) router.replace("/landing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={{ opacity, transform: [{ scale }] }}
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
  logo: {
    width: 180,
    height: 180,
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
