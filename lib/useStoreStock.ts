/**
 * useStoreStock — the owner's product list ("Your stock") as a hook.
 *
 * Extracted verbatim from the product logic that used to live in
 * app/(tabs)/home.tsx so Home (compact summary) and the Inventory tab (full
 * list) share one implementation:
 *
 *  - stale-while-revalidate via persistCache (peek → hydrate → paint, then a
 *    background network fetch that writes the cache back);
 *  - a monotonically increasing request id so only the most recently *started*
 *    fetch may commit;
 *  - a local-mutation timestamp so a fetch that was in flight when a toggle /
 *    delete landed cannot revert the optimistic update;
 *  - getStockListFromDb row mapping;
 *  - focus-gated useSmartPoll (15s, 30s when realtime is healthy);
 *  - a Supabase realtime `products` channel with the stable name
 *    `products-{storeId}` (refcounted below so two mounted consumers — Home
 *    and Inventory are both kept alive by the tab navigator — share one
 *    subscription instead of tripping realtime-js's "subscribed twice" guard);
 *  - optimistic is_active toggle with rollback and a confirming silent refetch;
 *  - soft delete via `update({ deleted_at })…select("id")` with the zero-row
 *    check (an RLS-filtered update is not a success) and a cache write.
 *
 * `error` is raised only when a cold, cache-less foreground load fails —
 * a failed background refresh over cached rows sets `refreshError` instead so
 * the UI can show "Couldn't refresh · showing saved data" without wiping the
 * list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "./supabase";
import { getStockListFromDb, updateProductActiveState } from "./storeProducts";
import { useSmartPoll } from "./useSmartPoll";
import { hydrateCache, peekCache, sameData, writeCache } from "./persistCache";

export type StockProduct = {
  /** master_product_id — stable identity for rows and keys. */
  id: string;
  name: string;
  unit?: string;
  /** products.id — the row toggles / deletes act on. */
  storeProductId?: string;
  is_active?: boolean;
  quantity?: number;
  is_loose?: boolean;
  /** master product thumbnail, when the catalog has one. */
  image_url?: string | null;
};

/** persistCache key for the stock list — lets it paint instantly on cold start. */
export const productsCacheKey = (storeId: string) => `products:${storeId}`;

export type UseStoreStockOptions = {
  storeId: string | null | undefined;
  token: string | null | undefined;
  /** Gates the safety-net poll (pass the screen's `useIsFocused()`). */
  enabled: boolean;
};

export type UseStoreStockResult = {
  /** Every product, in DB order. */
  products: StockProduct[];
  /** `products` where `!is_loose`. */
  packaged: StockProduct[];
  /** `products` where `is_loose`. */
  loose: StockProduct[];
  /** True only while a cold, cache-less foreground load is in flight. */
  loading: boolean;
  /** True only when a cold, cache-less foreground load failed (nothing to show). */
  error: boolean;
  /** True when a refresh failed while cached/previous rows are still shown. Cleared on the next success. */
  refreshError: boolean;
  /**
   * Refetch. `silent` (default false) skips the cache-paint / spinner path and
   * never raises `error` — use it for background refreshes. Non-silent is the
   * "Try again" path.
   */
  refresh: (silent?: boolean) => Promise<void>;
  /** Optimistic is_active flip with rollback. Resolves `true` on success. */
  toggleActive: (product: StockProduct) => Promise<boolean>;
  /** Soft-deletes one product. Rejects with an Error on failure (never alerts). */
  removeProduct: (product: StockProduct) => Promise<void>;
  /** Soft-deletes every product in `list`. Rejects with an Error on failure. */
  removeAll: (list: readonly StockProduct[]) => Promise<void>;
  /** `id` of the product whose toggle is in flight, else null. */
  togglingProductId: string | null;
};

// ─── Shared realtime subscription ────────────────────────────────────────────
// One `products-{storeId}` channel per store, refcounted across every mounted
// hook instance. The channel name stays stable (no Date.now() suffix) so
// switching stores doesn't churn out never-reused channel identities.

type Listener = () => void;
type Shared = { channel: ReturnType<NonNullable<typeof supabase>["channel"]>; listeners: Set<Listener> };
const sharedChannels = new Map<string, Shared>();

function subscribeProductsChannel(storeId: string, listener: Listener): () => void {
  if (!supabase) return () => {};
  let entry = sharedChannels.get(storeId);
  if (!entry) {
    const listeners = new Set<Listener>();
    const channel = supabase
      .channel(`products-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `store_id=eq.${storeId}` },
        () => {
          listeners.forEach((fn) => fn());
        }
      )
      .subscribe();
    entry = { channel, listeners };
    sharedChannels.set(storeId, entry);
  }
  entry.listeners.add(listener);
  return () => {
    const current = sharedChannels.get(storeId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      sharedChannels.delete(storeId);
      supabase?.removeChannel(current.channel);
    }
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStoreStock({ storeId, token, enabled }: UseStoreStockOptions): UseStoreStockResult {
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // True only when a cold, cache-less load failed — drives a "Couldn't load"
  // + Retry block instead of the "No products yet" empty state, which used to
  // be shown for a plain network failure as if it were the truth.
  const [error, setError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);

  // Multiple independent triggers can call fetch concurrently (realtime
  // subscription, focus effect, the mount effect, the poll). Tracking a
  // monotonically-increasing request id and only committing the result of the
  // most-recently-*started* request avoids an older, in-flight fetch
  // clobbering a newer one's result.
  const fetchRequestIdRef = useRef(0);
  // Timestamp of the most recent local product mutation (toggle/delete). A
  // fetch already in flight when the mutation landed carries pre-mutation
  // rows — committing it would visibly revert the optimistic update until the
  // next refetch.
  const productsMutationRef = useRef(0);
  const lastFetchRef = useRef(0);

  const fetchProducts = useCallback(
    async (silent = false) => {
      if (!token || !storeId) return;
      const requestId = ++fetchRequestIdRef.current;
      const startedAt = Date.now();
      lastFetchRef.current = startedAt;

      // Stale-while-revalidate: on a foreground load, paint the last-known list
      // from the persisted cache immediately and demote the network fetch to a
      // background refresh — the spinner is reserved for a genuinely cold cache.
      let spinnerShown = false;
      if (!silent) {
        const cached =
          peekCache<StockProduct[]>(productsCacheKey(storeId)) ??
          (await hydrateCache<StockProduct[]>(productsCacheKey(storeId)));
        if (requestId !== fetchRequestIdRef.current) return;
        if (cached && cached.length > 0) {
          setProducts((prev) => (sameData(prev, cached) ? prev : cached));
          setLoading(false);
        } else {
          spinnerShown = true;
          // "Try again" path: clear the failed flag so the skeleton replaces
          // the error block while the retry is in flight.
          setError(false);
          setLoading(true);
        }
      }

      try {
        const fromDb = await getStockListFromDb(storeId);
        if (requestId !== fetchRequestIdRef.current) return;
        if (productsMutationRef.current > startedAt) return;
        const mapped: StockProduct[] = Array.isArray(fromDb)
          ? fromDb.map((item: any) => ({
              id: item.id,
              name: (item.name || item.product_name || "").trim() || "Product",
              unit: item.unit || "",
              storeProductId: item.storeProductId,
              is_active: item.is_active !== false,
              is_loose: item.is_loose === true,
              image_url: item.image_url ?? null,
            }))
          : [];
        setProducts((prev) => (sameData(prev, mapped) ? prev : mapped));
        setError(false);
        setRefreshError(false);
        writeCache(productsCacheKey(storeId), mapped);
      } catch {
        if (requestId !== fetchRequestIdRef.current) return;
        // Only flag `error` on a genuinely cold, cache-less foreground load. A
        // silent background refresh — or a load that already painted cached
        // data — failing shouldn't wipe a real product list over a transient
        // network hiccup; it surfaces as `refreshError` instead.
        if (!silent && spinnerShown) {
          setProducts([]);
          setError(true);
        } else {
          setRefreshError(true);
        }
      } finally {
        // Always clear the spinner this call raised, regardless of whether a
        // newer request has since superseded it for the purpose of committing
        // data — otherwise a silent refetch starting before the initial
        // non-silent load resolves permanently strands `loading` at true.
        if (!silent) setLoading(false);
      }
    },
    [token, storeId]
  );

  const fetchRef = useRef(fetchProducts);
  useEffect(() => {
    fetchRef.current = fetchProducts;
  }, [fetchProducts]);

  // Foreground load whenever the store / session resolves or changes.
  useEffect(() => {
    if (!token || !storeId) return;
    fetchProducts();
  }, [token, storeId, fetchProducts]);

  // Realtime: any change to this store's products → silent refetch.
  useEffect(() => {
    if (!storeId) return;
    return subscribeProductsChannel(storeId, () => {
      fetchRef.current(true);
    });
  }, [storeId]);

  // Focus refetch — a safety net behind the realtime channel and the poll, so
  // skip the very first focus (the mount effect already fetched) and any focus
  // within 10s of the last fetch.
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      if (Date.now() - lastFetchRef.current < 10_000) return;
      if (token && storeId) fetchRef.current(true);
    }, [token, storeId])
  );

  // Safety net for the realtime channel + focus refresh: mobile realtime
  // sockets can drop silently across app backgrounding. Focus-gated by
  // `enabled` — polling a hidden screen is pure waste.
  useSmartPoll(() => fetchRef.current(true), {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!(token && storeId) && enabled,
  });

  const toggleActive = useCallback(
    async (product: StockProduct): Promise<boolean> => {
      if (!product.storeProductId) return false;
      const wasActive = product.is_active !== false;
      const nowActive = !wasActive;
      setTogglingProductId(product.id);
      productsMutationRef.current = Date.now();
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: nowActive } : p)));
      try {
        const success = await updateProductActiveState(product.storeProductId, nowActive, token ?? null);
        if (!success) {
          productsMutationRef.current = Date.now();
          setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: wasActive } : p)));
          return false;
        }
        // The confirming refetch starts after the mutation stamp, so it's
        // allowed to commit — and it rewrites the persisted cache too.
        fetchRef.current(true);
        return true;
      } catch {
        productsMutationRef.current = Date.now();
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: wasActive } : p)));
        return false;
      } finally {
        setTogglingProductId(null);
      }
    },
    [token]
  );

  const removeProduct = useCallback(
    async (product: StockProduct): Promise<void> => {
      if (!product.storeProductId || !supabase) throw new Error("Couldn't remove this product.");
      // .select() so an update RLS filtered out (0 rows, no error) is not
      // treated as a successful removal.
      const { data, error: dbError } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", product.storeProductId)
        .select("id");
      if (dbError || !data || data.length === 0) throw new Error("Failed to remove product.");
      productsMutationRef.current = Date.now();
      // Functional update — the caller's handler may be frozen inside a confirm
      // sheet's state at open time, so a closure snapshot of `products` could
      // be stale by the time the user confirms. The cache write is deferred out
      // of the updater so it stays pure.
      const cacheKey = storeId ? productsCacheKey(storeId) : null;
      setProducts((prev) => {
        const next = prev.filter((p) => p.id !== product.id);
        if (cacheKey) queueMicrotask(() => writeCache(cacheKey, next));
        return next;
      });
    },
    [storeId]
  );

  const removeAll = useCallback(
    async (list: readonly StockProduct[]): Promise<void> => {
      if (!supabase) throw new Error("Couldn't remove these products.");
      const ids = list.map((p) => p.storeProductId).filter(Boolean) as string[];
      if (ids.length === 0) return;
      const { data, error: dbError } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids)
        .select("id");
      if (dbError || !data || data.length === 0) throw new Error("Failed to remove products.");
      productsMutationRef.current = Date.now();
      const removedIds = new Set(list.map((p) => p.id));
      const cacheKey = storeId ? productsCacheKey(storeId) : null;
      setProducts((prev) => {
        const next = prev.filter((p) => !removedIds.has(p.id));
        if (cacheKey) queueMicrotask(() => writeCache(cacheKey, next));
        return next;
      });
    },
    [storeId]
  );

  const packaged = useMemo(() => products.filter((p) => !p.is_loose), [products]);
  const loose = useMemo(() => products.filter((p) => p.is_loose), [products]);

  return {
    products,
    packaged,
    loose,
    loading,
    error,
    refreshError,
    refresh: fetchProducts,
    toggleActive,
    removeProduct,
    removeAll,
    togglingProductId,
  };
}
