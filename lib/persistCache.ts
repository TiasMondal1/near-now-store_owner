/**
 * Tiny shared stale-while-revalidate cache: in-memory map backed by
 * AsyncStorage. Screens seed their first paint from here (peek/hydrate),
 * kick a network refresh in the background, and write the fresh result back
 * (write). Same pattern appCache.ts/notificationsCache.ts use, generalized so
 * products/orders/payouts don't each reinvent it.
 *
 * Keys are namespaced under one prefix so logout can wipe everything at once
 * (cross-account leak class — see session.ts's clearSession).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "nanow_swr:";

const _mem = new Map<string, unknown>();

/** Synchronous read — returns the cached value only if it's already in memory. */
export function peekCache<T>(key: string): T | null {
  return (_mem.get(key) as T | undefined) ?? null;
}

/** Read through to AsyncStorage (and warm the memory layer). */
export async function hydrateCache<T>(key: string): Promise<T | null> {
  const hit = _mem.get(key);
  if (hit !== undefined) return hit as T;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    // A writeCache() may have landed while the disk read was in flight — the
    // memory layer is then strictly newer than what we just read; never let
    // the older disk copy overwrite or outrank it.
    const memAfter = _mem.get(key);
    if (memAfter !== undefined) return memAfter as T;
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as T;
    _mem.set(key, parsed);
    return parsed;
  } catch (error) {
    if (__DEV__) console.warn(`[persistCache] Hydrate failed for ${key}`, error);
    return null;
  }
}

/** Persist to memory + AsyncStorage (disk write is fire-and-forget). */
export function writeCache<T>(key: string, value: T): void {
  _mem.set(key, value);
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch((error) => {
    if (__DEV__) console.warn(`[persistCache] Persist failed for ${key}`, error);
  });
}

export function removeCache(key: string): void {
  _mem.delete(key);
  AsyncStorage.removeItem(PREFIX + key).catch(() => {});
}

/** Wipe every persisted cache entry — call on logout / fresh-install guard. */
export async function clearAllCaches(): Promise<void> {
  _mem.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch (error) {
    if (__DEV__) console.warn("[persistCache] Clear failed", error);
  }
}

/**
 * Structural equality for plain fetched data (arrays/objects of JSON values).
 * Used to keep state identity stable across poll ticks: committing an
 * identical-but-fresh array every 10-15s re-renders the whole screen and
 * defeats every memo below it. JSON.stringify is plenty fast at the list
 * sizes involved (≤ a few hundred rows) compared to one wasted render pass.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
