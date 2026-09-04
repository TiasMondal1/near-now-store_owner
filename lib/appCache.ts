/**
 * Shared runtime + persistent cache for store data.
 * Eliminates 4 redundant per-tab API calls on startup and tab switching.
 * All tabs call fetchStoresCached() — only the first one hits the network.
 *
 * Expiry means "stale", not "absent": data older than the TTL is no longer
 * served as fresh (peekStores/fetchStoresCached will refetch), but it is kept
 * around (peekStoresAny) so cold starts can route/render instantly from
 * last-known-good data and so a failed refetch can fall back to it instead of
 * pretending the owner has no stores.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "./api-client";

const STORE_CACHE_KEY = "nanow_store_cache_v2";
const STORE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export type CachedStore = {
  id: string;
  name: string;
  address: string | null;
  delivery_radius_km: number;
  is_active: boolean;
  is_approved?: boolean;
  owner_image_url?: string | null;
};

let _mem: { stores: CachedStore[]; ts: number } | null = null;
let _inflight: Promise<CachedStore[]> | null = null;

// Bumped whenever local truth changes out from under an in-flight request
// (a toggle PATCH landing, an explicit invalidation). A response issued
// before the bump carries pre-mutation data — persisting it would stamp
// stale is_active/is_approved as fresh and visibly revert the toggle.
let _generation = 0;

function fresh(ts: number) {
  return Date.now() - ts < STORE_CACHE_TTL;
}

/** Synchronous peek — returns stores only while the in-memory cache is fresh. */
export function peekStores(): CachedStore[] | null {
  return _mem && fresh(_mem.ts) ? _mem.stores : null;
}

/** Synchronous peek that also serves stale data — last-known-good fallback. */
export function peekStoresAny(): CachedStore[] | null {
  return _mem?.stores ?? null;
}

/**
 * Hydrate in-memory cache from AsyncStorage.
 * Call once early in the app (e.g. splash screen) to warm the cache before tabs mount.
 * Returns the stores only when still fresh; stale disk data is still loaded
 * into memory (for peekStoresAny) but reported as a miss so callers refetch.
 */
export async function hydrateStoreCache(): Promise<CachedStore[] | null> {
  if (peekStores()) return peekStores();
  try {
    const raw = await AsyncStorage.getItem(STORE_CACHE_KEY);
    if (!raw) return null;
    const parsed: { stores: CachedStore[]; ts: number } = JSON.parse(raw);
    if (parsed?.ts && Array.isArray(parsed.stores)) {
      if (!_mem) _mem = parsed;
      if (fresh(parsed.ts)) return parsed.stores;
    }
  } catch (error) {
    if (__DEV__) console.warn('[appCache] Hydrate store cache failed', error);
  }
  return null;
}

/** Persist updated store list to memory + AsyncStorage. */
export async function persistStores(stores: CachedStore[]): Promise<void> {
  _mem = { stores, ts: Date.now() };
  try {
    await AsyncStorage.setItem(STORE_CACHE_KEY, JSON.stringify(_mem));
  } catch (error) {
    if (__DEV__) console.warn('[appCache] Persist store cache failed', error);
  }
}

/**
 * Force-update the is_active flag after a server-confirmed toggle, in memory
 * AND on disk, and invalidate any in-flight fetch that started pre-toggle so
 * its stale response can't overwrite this.
 */
export function patchStoreActive(storeId: string, isActive: boolean): void {
  _generation++;
  if (!_mem) return;
  _mem = {
    ts: Date.now(),
    stores: _mem.stores.map((s) =>
      s.id === storeId ? { ...s, is_active: isActive } : s
    ),
  };
  AsyncStorage.setItem(STORE_CACHE_KEY, JSON.stringify(_mem)).catch(() => {});
}

/** Clear on logout or when stores may have changed server-side. */
export function clearStoreCache(): void {
  _generation++;
  _mem = null;
  // Orphan any in-flight fetch: its awaiters still resolve, but new callers
  // (possibly a different account after logout) start a fresh request instead
  // of joining a stale one issued with the old token.
  _inflight = null;
  AsyncStorage.removeItem(STORE_CACHE_KEY).catch(() => {});
}

/**
 * Current cache generation — capture before a stores fetch and compare after:
 * a mismatch means local truth changed (toggle PATCH, logout) while the
 * request was in flight, so its response must not be persisted as fresh.
 * Used by every writer of this cache, not just forceFetchStores.
 */
export function storeCacheGeneration(): number {
  return _generation;
}

/**
 * Fetch stores with deduplication + caching.
 * Concurrent callers share a single in-flight request.
 * Returns cached data instantly if still fresh.
 */
export async function fetchStoresCached(
  token: string,
  userId?: string
): Promise<CachedStore[]> {
  const hit = peekStores();
  if (hit) return hit;

  return forceFetchStores(token, userId);
}

/**
 * Always hits the network, bypassing the warm-cache short-circuit that
 * fetchStoresCached uses. Identity fields (store name/address) must be able
 * to self-correct — a caller that already showed cached data and now wants a
 * background "refresh" gets nothing from fetchStoresCached() while the
 * 10-minute cache is still warm, since that function just returns the same
 * cached array again. Use this instead wherever the intent is genuinely "get
 * the current truth from the server", not "get something to show quickly".
 *
 * On failure this returns the last-known-good stores (even stale) rather
 * than [] — "the network died" must never be conflated with "the server says
 * you have no stores", which is what used to route approved owners into the
 * signup flow on an offline cold start.
 */
export async function forceFetchStores(
  token: string,
  userId?: string
): Promise<CachedStore[]> {
  if (_inflight) return _inflight;

  const generationAtStart = _generation;
  _inflight = (async (): Promise<CachedStore[]> => {
    try {
      const endpoint = `/store-owner/stores${userId ? `?userId=${userId}` : ""}`;
      const res = await apiClient.request<{ stores?: CachedStore[] }>(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15_000,
        retries: 0,
      });
      if (!res.success) return peekStoresAny() ?? [];
      const stores: CachedStore[] = res.data?.stores ?? [];
      if (stores.length > 0) {
        // A local mutation (toggle PATCH) landed while this request was in
        // flight — this response predates it. Serve the local truth instead.
        if (_generation !== generationAtStart) return peekStoresAny() ?? stores;
        await persistStores(stores);
      }
      return stores;
    } catch {
      return peekStoresAny() ?? [];
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}
