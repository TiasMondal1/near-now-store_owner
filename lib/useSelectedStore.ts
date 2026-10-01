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
import { getSession, type UserSession } from "../session";
import { fetchStoresCached, peekStores, peekStoresAny, type CachedStore } from "./appCache";
import {
  loadSelectedStoreId,
  peekSelectedStoreId,
  pickSelectedStore,
  rememberDefaultStoreId,
  subscribeSelectedStore,
} from "./selectedStore";

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

// Selection rule lives in lib/selectedStore.ts (remembered → first approved →
// first) so this hook, the approval gate and app-start routing always agree.
const pickStore = (stores: readonly CachedStore[] | null, selectedId: string | null) =>
  pickSelectedStore(stores, selectedId);

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
        const selId = await loadSelectedStoreId();
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
      loadSelectedStoreId()
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

  // Store switch (StoreSwitcher, add-store): every mounted screen re-picks
  // immediately from the store cache, so the whole app moves to the new store
  // together instead of each screen catching up on its next focus.
  useEffect(
    () =>
      subscribeSelectedStore((selId) => {
        const next = pickStore(peekStores() ?? peekStoresAny(), selId);
        setStore((prev) => (prev?.id === next?.id && prev?.is_active === next?.is_active && prev?.name === next?.name ? prev : next));
      }),
    []
  );

  // Remember the default pick once one is made, so every screen (and the next
  // app start) agrees on it. Moved here from home.tsx, which used to do this
  // on its own.
  useEffect(() => {
    if (store?.id && peekSelectedStoreId() !== store.id) void rememberDefaultStoreId(store.id);
  }, [store?.id]);

  const retry = useCallback(() => setRetryTick((t) => t + 1), []);

  return { session, store, storeId: store?.id ?? null, loading, retry };
}

export default useSelectedStore;
