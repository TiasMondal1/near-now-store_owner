import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { getSession, isJustLoggedIn, guardFreshInstall } from "../session";
import { hydrateStoreCache } from "../lib/appCache";
import { resolveAuthenticatedRoute } from "../lib/storeApproval";
import { colors, spacing, radius, shadows } from "../lib/theme";

const MIN_SPLASH_MS = 800;
const BRAND_LOGO = require("../near_now_shopkeeper.png");
const { width: SCREEN_W } = Dimensions.get("window");

export default function SplashScreen() {
  const router = useRouter();

  // Logo
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  // Ring
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  // Text
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(10)).current;
  // Bottom bar
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isJustLoggedIn()) {
      (async () => {
        const session = await getSession();
        if (session?.token) {
          router.replace(await resolveAuthenticatedRoute(session.token, session.user?.id));
        } else {
          router.replace("/landing");
        }
      })();
      return;
    }

    const anim = Animated.sequence([
      // 1. Logo + ring fade in together
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(ringScale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      ]),
      // 2. Text slides up
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 350, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      ]),
      // 3. Bottom loading bar grows
      Animated.timing(barWidth, { toValue: 1, duration: 600, useNativeDriver: false, easing: Easing.inOut(Easing.quad) }),
    ]);
    anim.start();

    const startMs = Date.now();
    let cancelled = false;

    (async () => {
      try {
        await guardFreshInstall();
        const [session] = await Promise.all([getSession(), hydrateStoreCache()]);
        if (cancelled) return;
        const elapsed = Date.now() - startMs;
        await new Promise<void>((r) => setTimeout(r, Math.max(0, MIN_SPLASH_MS - elapsed)));
        if (cancelled) return;
        const ok = session?.token && session?.user?.id && session.user.role !== "customer";
        router.replace(ok ? await resolveAuthenticatedRoute(session.token, session.user.id) : "/landing");
      } catch {
        if (!cancelled) router.replace("/landing");
      }
    })();

    return () => { cancelled = true; anim.stop(); };
  }, []);

  const barWidthInterpolated = barWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 80],
  });

  return (
    <View style={styles.container}>
      {/* Soft background accent */}
      <View style={styles.bgCircle} />

      {/* Ring behind logo */}
      <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />

      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      {/* Text */}
      <Animated.View style={[styles.textWrap, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
        <Text style={styles.brandName}>Near & Now</Text>
        <Text style={styles.tagline}>SHOPKEEPER</Text>
      </Animated.View>

      {/* Loading bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidthInterpolated }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  bgCircle: {
    position: "absolute",
    width: SCREEN_W * 1.4,
    height: SCREEN_W * 1.4,
    borderRadius: SCREEN_W * 0.7,
    backgroundColor: colors.primaryBg,
    opacity: 0.5,
  },
  ring: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: colors.primary + "15",
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.lg,
  },
  logo: { width: 60, height: 60 },
  textWrap: {
    alignItems: "center",
    marginTop: spacing.xxl,
    gap: 6,
  },
  brandName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
    letterSpacing: 3,
  },
  barTrack: {
    position: "absolute",
    bottom: 80,
    width: 80,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primary + "12",
    overflow: "hidden",
  },
  barFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
});
