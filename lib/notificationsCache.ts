/**
 * Lightweight cache for the notification inbox, same shape as appCache.ts's
 * store cache — lets notification-inbox.tsx render the last-known list
 * instantly instead of blocking on getSession() + a network round-trip
 * behind a blank spinner on every single visit. Unlike the store cache this
 * has no TTL short-circuit: a background refetch always still happens on
 * mount, this only avoids showing nothing while it's in flight.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIFICATIONS_CACHE_KEY = "nanow_notifications_cache_v1";

export type CachedNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
};

let _mem: CachedNotification[] | null = null;

/** Synchronous peek — returns the last-cached list if the in-memory copy is warm, else null. */
export function peekNotifications(): CachedNotification[] | null {
  return _mem;
}

/** Hydrate the in-memory cache from AsyncStorage. Call once early (e.g. this screen's module scope) to warm it before mount. */
export async function hydrateNotificationsCache(): Promise<CachedNotification[] | null> {
  if (_mem) return _mem;
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedNotification[] = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      _mem = parsed;
      return parsed;
    }
  } catch (error) {
    if (__DEV__) console.warn("[notificationsCache] Hydrate failed", error);
  }
  return null;
}

/** Persist the latest list to memory + AsyncStorage. */
export async function persistNotifications(list: CachedNotification[]): Promise<void> {
  _mem = list;
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(list));
  } catch (error) {
    if (__DEV__) console.warn("[notificationsCache] Persist failed", error);
  }
}

/** Clear on logout — same cross-account leak class already fixed for the store list/owner photo caches in session.ts. */
export function clearNotificationsCache(): void {
  _mem = null;
  AsyncStorage.removeItem(NOTIFICATIONS_CACHE_KEY).catch(() => {});
}

// ── Read-mutation stamp ──────────────────────────────────────────────────────
// The inbox writes optimistic mark-read state into this cache; Home's badge
// poll is a second, independent writer. A poll response issued before a
// mark-read tap but landing after it would overwrite the optimistic state (in
// UI and on disk) with pre-mutation rows. Writers capture their request start
// time and skip committing when a read mutation postdates it.
let _lastReadMutationTs = 0;

/** Call whenever read-state is optimistically mutated (mark one/all read). */
export function noteNotificationsReadMutation(): void {
  _lastReadMutationTs = Date.now();
}

/** Timestamp of the most recent optimistic read-state mutation. */
export function lastNotificationsReadMutationTs(): number {
  return _lastReadMutationTs;
}
