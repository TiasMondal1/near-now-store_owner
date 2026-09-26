/**
 * useSelectedStore — THE store-id resolution hook. Every screen that needs
 * "the shopkeeper's current store" resolves it through here, never by reading
 * `selected_store_id` or the store cache itself.
 *
 * Resolution order (carried over unchanged from the old app/(tabs)/stock.tsx):
 *   getSession() → no token → router.replace("/landing");
 *   AsyncStorage "selected_store_id" → prefer peekStores() (no network on a
 *   tab switch) → else fetchStoresCached(token, userId); pick the selected
 *   store or the first; a cancelled flag guards state after unmount.
 *
 * Additions: the whole `CachedStore` row is exposed (Inventory needs
 * `is_active` to lock availability switches while offline) and the pick is
 * re-read from the store cache on every later focus, so a Go online / Go
 * offline done on Home is reflected when the owner comes back to this tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession, type UserSession } from "../session";
import { fetchStoresCached, peekStores, peekStoresAny, type CachedStore } from "./appCache";

const SELECTED_STORE_KEY = "selected_store_id";

export type UseSelectedStoreResult = {
  session: UserSession | null;
  store: CachedStore | null;
  /** Convenience: `store?.id ?? null`. */
  storeId: string | null;
  /** True while the first bootstrap is in flight. */
  loading: boolean;
  /** Re-run the bootstrap (the "Try again" path when no store resolved). */
  retry: () => void;
};

function pickStore(stores: readonly CachedStore[] | null, selectedId: string | null): CachedStore | null {
  if (!stores || stores.length === 0) return null;
  return (selectedId && stores.find((s) => s.id === selectedId)) || stores[0] || null;
}

export function useSelectedStore(): UseSelectedStoreResult {
  const [session, setSession] = useState<UserSession | null>(null);
  const [store, setStore] = useState<CachedStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const s = await getSession();
        if (!s?.token) {
          if (!cancelled) router.replace("/landing");
          return;
        }
        if (cancelled) return;
        setSession(s);

        // Use cached stores first — avoids a network call on tab switch.
        const selId = await AsyncStorage.getItem(SELECTED_STORE_KEY);
        if (cancelled) return;
        const cached = peekStores();
        if (cached && cached.length > 0) {
          setStore(pickStore(cached, selId));
          setLoading(false);
          return;
        }

        const stores = await fetchStoresCached(s.token, s.user?.id);
        if (cancelled) return;
        setStore(pickStore(stores, selId));
      } catch (e) {
        if (__DEV__) console.warn("[useSelectedStore] Bootstrap error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  // Re-read the pick from the store cache on later focuses so is_active
  // (patched by Home's Go online / Go offline) stays current here.
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      let cancelled = false;
      AsyncStorage.getItem(SELECTED_STORE_KEY)
        .then((selId) => {
          if (cancelled) return;
          const next = pickStore(peekStores() ?? peekStoresAny(), selId);
          if (next) setStore((prev) => (prev && prev.id === next.id && prev.is_active === next.is_active && prev.name === next.name ? prev : next));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const retry = useCallback(() => setRetryTick((t) => t + 1), []);

  return { session, store, storeId: store?.id ?? null, loading, retry };
}

export default useSelectedStore;
