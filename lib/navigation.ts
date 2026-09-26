/**
 * Back-navigation helpers.
 *
 * Several flows in this app move between screens with `router.replace(...)`
 * (landing → phone entry → OTP, and the verification tab bar), which leaves
 * the navigation stack with a single entry. On those screens:
 *   - an in-app back arrow calling `router.back()` did nothing, because
 *     there was no history to pop; and
 *   - the Android hardware back button fell through to React Navigation's
 *     default "no history → exit app" behaviour, dropping the shopkeeper on
 *     the device home screen instead of the previous app screen.
 *
 * `goBackOr(fallback)` pops when history exists and otherwise replaces to a
 * sensible fallback route; `useHardwareBackTo(fallback)` wires the same rule
 * to the Android back button for the mounted screen.
 */
import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { router, type Href } from "expo-router";

export function goBackOr(fallback: Href): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // canGoBack can throw before the root navigator is ready — fall through.
  }
  router.replace(fallback);
}

/**
 * Make the Android hardware back button behave like the screen's own back
 * arrow: pop if possible, otherwise go to `fallback` instead of exiting.
 * Pass `enabled=false` to temporarily disable (e.g. while a request is in
 * flight and leaving would orphan it).
 */
export function useHardwareBackTo(fallback: Href, enabled: boolean = true): void {
  useEffect(() => {
    if (Platform.OS !== "android" || !enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBackOr(fallback);
      return true;
    });
    return () => sub.remove();
  }, [fallback, enabled]);
}
