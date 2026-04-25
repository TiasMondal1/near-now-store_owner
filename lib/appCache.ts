/**
 * Shared runtime + persistent cache for store data.
 * Eliminates 4 redundant per-tab API calls on startup and tab switching.
 * All tabs call fetchStoresCached() — only the first one hits the network.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";

const STORE_CACHE_KEY = "nanow_store_cache_v2";
const STORE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export type CachedStore = {
  id: string;
  name: string;
  address: string | null;
  delivery_radius_km: number;
  is_active: boolean;
};

let _mem: { stores: CachedStore[]; ts: number } | null = null;
let _inflight: Promise<CachedStore[]> | null = null;

function fresh(ts: number) {
  return Date.now() - ts < STORE_CACHE_TTL;
}

/** Synchronous peek — returns stores if in-memory cache is valid, else null. */
export function peekStores(): CachedStore[] | null {
  return _mem && fresh(_mem.ts) ? _mem.stores : null;
}

/**
 * Hydrate in-memory cache from AsyncStorage.
 * Call once early in the app (e.g. splash screen) to warm the cache before tabs mount.
 */
export async function hydrateStoreCache(): Promise<CachedStore[] | null> {
  if (peekStores()) return peekStores();
  try {
    const raw = await AsyncStorage.getItem(STORE_CACHE_KEY);
    if (!raw) return null;
    const parsed: { stores: CachedStore[]; ts: number } = JSON.parse(raw);
    if (parsed?.ts && fresh(parsed.ts)) {
      _mem = parsed;
      return parsed.stores;
    }
  } catch {}
  return null;
}

/** Persist updated store list to memory + AsyncStorage. */
export async function persistStores(stores: CachedStore[]): Promise<void> {
  _mem = { stores, ts: Date.now() };
  try {
    await AsyncStorage.setItem(STORE_CACHE_KEY, JSON.stringify(_mem));
  } catch {}
}

/** Force-update the is_active flag without a full refetch. */
export function patchStoreActive(storeId: string, isActive: boolean): void {
  if (!_mem) return;
  _mem = {
    ts: _mem.ts,
    stores: _mem.stores.map((s) =>
      s.id === storeId ? { ...s, is_active: isActive } : s
    ),
  };
}

/** Clear on logout or when stores may have changed server-side. */
export function clearStoreCache(): void {
  _mem = null;
  AsyncStorage.removeItem(STORE_CACHE_KEY).catch(() => {});
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

  if (_inflight) return _inflight;

  _inflight = (async (): Promise<CachedStore[]> => {
    try {
      const url = `${config.API_BASE}/store-owner/stores${
        userId ? `?userId=${userId}` : ""
      }`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      const stores: CachedStore[] = json?.stores ?? [];
      if (stores.length > 0) await persistStores(stores);
      return stores;
    } catch {
      return [];
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}
