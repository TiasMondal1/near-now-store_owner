import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { getSession, isJustLoggedIn, guardFreshInstall } from "../session";
import { hydrateStoreCache } from "../lib/appCache";
import { hydrateNotificationsCache } from "../lib/notificationsCache";
import { resolveAuthenticatedRoute } from "../lib/storeApproval";
import { colors, motion } from "../lib/theme";

const MIN_SPLASH_MS = 800;
const BRAND_LOGO = require("../near_now_shopkeeper.png");
const LOGO_SIZE = 96;

/**
 * Cold-start splash. Shows the brand mark with a single 300ms fade while the
 * session / store cache resolve, then replaces to the right first screen.
 */
export default function SplashScreen() {
  const router = useRouter();
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Always start the fade — the post-OTP path used to return before this,
    // leaving a blank screen while the route-deciding fetch ran.
    const anim = Animated.timing(logoOpacity, {
      toValue: 1,
      duration: motion.splashFade,
      useNativeDriver: true,
    });
    anim.start();

    let cancelled = false;

    if (isJustLoggedIn()) {
      (async () => {
        const session = await getSession();
        if (cancelled) return;
        if (session?.token) {
          router.replace(await resolveAuthenticatedRoute(session.token, session.user?.id));
        } else {
          router.replace("/landing");
        }
      })();
      return () => { cancelled = true; anim.stop(); };
    }

    const startMs = Date.now();

    (async () => {
      try {
        await guardFreshInstall();
        const [session] = await Promise.all([getSession(), hydrateStoreCache(), hydrateNotificationsCache()]);
        if (cancelled) return;
        const ok = session?.token && session?.user?.id && session.user.role !== "customer";
        // Resolve the route WHILE the minimum-splash timer runs, not after it
        // — with a warm/stale store cache this is instant, and even a cold
        // network fetch now overlaps the 800ms the splash shows anyway.
        const routePromise: Promise<"/(tabs)/home" | "/store-owner-signup" | "/landing"> = ok
          ? resolveAuthenticatedRoute(session.token, session.user.id)
          : Promise.resolve("/landing");
        const elapsed = Date.now() - startMs;
        const [route] = await Promise.all([
          routePromise,
          new Promise<void>((r) => setTimeout(r, Math.max(0, MIN_SPLASH_MS - elapsed))),
        ]);
        if (cancelled) return;
        router.replace(route);
      } catch {
        if (!cancelled) router.replace("/landing");
      }
    })();

    return () => { cancelled = true; anim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container} accessibilityLabel="Near & Now Shopkeeper" accessibilityRole="image">
      <Animated.View style={{ opacity: logoOpacity }}>
        <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
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
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});
