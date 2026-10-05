/**
 * Which store the shopkeeper is working in — multi-store ownership
 * (2026-10-02). THE single source of truth for that choice: every screen, the
 * approval gate and app-start routing resolve "the store" through
 * pickSelectedStore() and are told about switches via subscribeSelectedStore().
 *
 * Before this, "the store" was decided in several places, mostly as
 * `stores[0]`, and `selected_store_id` was written once at first login and
 * never changed — so an owner with two stores was locked to whichever came
 * first, and the approval gate could check a different store from the one on
 * screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SELECTED_STORE_KEY = "selected_store_id";

type StoreLike = { id: string; is_approved?: boolean | null };

/**
 * The store to work in, from the owner's live stores (server order, oldest
 * first) and the remembered choice:
 *  1. the remembered store, if it still exists;
 *  2. else the first approved store — a newly added, still-pending store
 *     must never become the default and lock the owner out of an approved one;
 *  3. else the first store.
 */
export function pickSelectedStore<T extends StoreLike>(
  stores: readonly T[] | null | undefined,
  selectedId: string | null | undefined
): T | null {
  if (!stores || stores.length === 0) return null;
  if (selectedId) {
    const remembered = stores.find((s) => s.id === selectedId);
    if (remembered) return remembered;
  }
  return stores.find((s) => s.is_approved === true) ?? stores[0] ?? null;
}

// In-memory mirror so synchronous readers (first render, gates) don't wait on
// AsyncStorage. `undefined` = not loaded yet; `null` = loaded, nothing stored.
let _selectedId: string | null | undefined;
const _listeners = new Set<(id: string | null) => void>();

/** Synchronous read of the remembered store id (undefined until first loaded). */
export function peekSelectedStoreId(): string | null | undefined {
  return _selectedId;
}

/** Remembered store id, loading it from storage on first call. */
export async function loadSelectedStoreId(): Promise<string | null> {
  if (_selectedId !== undefined) return _selectedId;
  try {
    _selectedId = (await AsyncStorage.getItem(SELECTED_STORE_KEY)) ?? null;
  } catch {
    _selectedId = null;
  }
  return _selectedId;
}

/** Switch stores: remembered across restarts, and every subscriber is told. */
export async function setSelectedStoreId(id: string): Promise<void> {
  const changed = _selectedId !== id;
  _selectedId = id;
  try {
    await AsyncStorage.setItem(SELECTED_STORE_KEY, id);
  } catch {
    // The in-memory choice still applies for this session.
  }
  if (changed) _listeners.forEach((fn) => fn(id));
}

/** Remember the default pick without notifying (nothing visible changes). */
export async function rememberDefaultStoreId(id: string): Promise<void> {
  if ((await loadSelectedStoreId()) === id) return;
  if (_selectedId) return; // an explicit choice already exists — keep it
  _selectedId = id;
  try {
    await AsyncStorage.setItem(SELECTED_STORE_KEY, id);
  } catch {
    // non-fatal
  }
}

export function subscribeSelectedStore(fn: (id: string | null) => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

/** Logout: forget the choice (it belongs to the previous account). */
export function clearSelectedStore(): void {
  _selectedId = null;
  _listeners.forEach((fn) => fn(null));
  AsyncStorage.removeItem(SELECTED_STORE_KEY).catch(() => {});
}

/** Mirrors the backend's MAX_STORES_PER_OWNER (storeOwner.controller.ts). */
export const MAX_STORES_PER_OWNER = 10;

export type StoreStatus = { label: string; tone: "success" | "neutral" | "info" | "warning" };

/** One-word status for a store in the switcher. */
export function storeStatus(store: {
  is_approved?: boolean | null;
  is_active?: boolean | null;
  verification_submitted_at?: string | null;
}): StoreStatus {
  if (store.is_approved === true) return store.is_active ? { label: "Live", tone: "success" } : { label: "Offline", tone: "neutral" };
  if (store.verification_submitted_at) return { label: "Under review", tone: "info" };
  return { label: "Setup needed", tone: "warning" };
}
