import { fetchStoresCached, forceFetchStores, peekStores, peekStoresAny, persistStores, storeCacheGeneration, type CachedStore } from "./appCache";
import { apiClient } from "./api-client";

export type ApprovalStore = CachedStore & {
  is_approved?: boolean;
};

/** Store is live for customers only after explicit admin approval. */
export function isStoreApproved(store: ApprovalStore | null | undefined): boolean {
  return store?.is_approved === true;
}

export async function getPrimaryStore(
  token: string,
  userId?: string
): Promise<ApprovalStore | null> {
  const cached = peekStores();
  const stores: ApprovalStore[] = cached?.length
    ? cached
    : await fetchStoresCached(token, userId);
  return stores[0] ?? null;
}

export async function checkStoreApproval(
  token: string,
  userId?: string
): Promise<{ approved: boolean; store: ApprovalStore | null }> {
  const store = await getPrimaryStore(token, userId);
  return { approved: isStoreApproved(store), store };
}

export async function resolveAuthenticatedRoute(
  token: string,
  userId?: string
): Promise<"/(tabs)/home" | "/store-owner-signup"> {
  // Route instantly from last-known-good data (even stale) ONLY when it says
  // approved — the tabs layout's approval gate re-verifies against the server
  // within seconds and bounces a since-revoked store. The signup flow has no
  // such gate and never redirects to home on its own, so a stale
  // "unapproved" must never fast-path there: an owner approved while the app
  // was closed would cold-start into the signup screen with no way back
  // short of another cold start. Unapproved-or-unknown waits for the real
  // answer below (checkStoreApproval refetches when the cache isn't fresh).
  const known = peekStoresAny();
  if (known?.length && isStoreApproved(known[0])) {
    forceFetchStores(token, userId).catch(() => {});
    return "/(tabs)/home";
  }
  const { approved } = await checkStoreApproval(token, userId);
  // A returning, already-signed-up, not-yet-approved owner always lands on
  // Details first — they can then move freely between Details/Documents/
  // Billing/Status via VerificationNavBar, instead of being dropped straight
  // onto the Status tab.
  return approved ? "/(tabs)/home" : "/store-owner-signup";
}

// ── Shared refresh with dedup + short reuse window ──────────────────────────
// This function is polled independently by the tabs-layout gate, by
// useRequireStoreApproval on every gated screen (which all stay mounted once
// visited), and by home's own approval poll — without sharing, that added up
// to an identical GET /store-owner/stores every ~5 seconds. Concurrent
// callers now share one in-flight request, and a result younger than
// REFRESH_REUSE_MS is served as-is. Worst-case revoke-detection latency grows
// from 30s to ~45s, still bounded; realtime subscriptions pass force=true to
// bypass the reuse window when the server says the row actually changed.
const REFRESH_REUSE_MS = 15_000;

type RefreshResult = { approved: boolean; store: ApprovalStore | null };

let _refreshInflight: Promise<RefreshResult> | null = null;
let _lastRefresh: { result: RefreshResult; ts: number } | null = null;

/**
 * Drop the memoized refresh result and stop sharing any in-flight request.
 * Must be called on logout (see session.ts) — this module-level memo would
 * otherwise hand the previous shopkeeper's store/approval to the next account
 * logging in on the same device within the reuse window, the same
 * cross-account leak class clearStoreCache/clearNotificationsCache guard.
 */
export function clearStoreApprovalCache(): void {
  _lastRefresh = null;
  _refreshInflight = null;
}

export async function refreshStoreApproval(
  token: string,
  userId?: string,
  opts?: { force?: boolean }
): Promise<RefreshResult> {
  if (!opts?.force && _lastRefresh && Date.now() - _lastRefresh.ts < REFRESH_REUSE_MS) {
    return _lastRefresh.result;
  }
  if (_refreshInflight) return _refreshInflight;

  _refreshInflight = (async (): Promise<RefreshResult> => {
    try {
      // Capture the cache generation before the request: if a local mutation
      // (toggle PATCH, logout) lands while this GET is in flight, its
      // response is pre-mutation data — persisting it would freshly stamp
      // stale is_active over the local truth (the exact revert forceFetchStores
      // already guards against), and memoizing it would serve that stale
      // result to every gate for the next 15 seconds.
      const generationAtStart = storeCacheGeneration();
      const endpoint = `/store-owner/stores${userId ? `?userId=${userId}` : ""}`;
      const res = await apiClient.get<{ stores?: ApprovalStore[] }>(endpoint, {
        Authorization: `Bearer ${token}`,
      });
      if (!res.success) throw new Error(res.error || "Failed to refresh store status");
      const stores: ApprovalStore[] = res.data?.stores ?? [];
      if (storeCacheGeneration() !== generationAtStart) {
        const local = peekStoresAny();
        const store = (local?.[0] ?? stores[0] ?? null) as ApprovalStore | null;
        return { approved: isStoreApproved(store), store };
      }
      const store = stores[0] ?? null;
      // This bypasses the shared store cache (appCache.ts) to force a genuinely
      // fresh read — but without writing the result back, the cache stays stale
      // for up to its 10-minute TTL. The very next screen (e.g. the tabs layout,
      // reached right after this detects approval) reads that stale cache via
      // useStoreApprovalGate and would immediately bounce the user right back to
      // pending-verification, even though they were just approved.
      if (stores.length > 0) await persistStores(stores);
      const result = { approved: isStoreApproved(store), store };
      // Re-check after the await: a logout (clearStoreCache bumps the
      // generation, clearStoreApprovalCache nulls this memo) landing inside
      // persistStores must not have its clear undone by re-memoizing the
      // logged-out account's result here.
      if (storeCacheGeneration() === generationAtStart) {
        _lastRefresh = { result, ts: Date.now() };
      }
      return result;
    } finally {
      // Unconditional reset: after a clearStoreApprovalCache() raced with this
      // request, this may null a newer in-flight promise — that only costs one
      // dedup window, never correctness.
      _refreshInflight = null;
    }
  })();

  return _refreshInflight;
}
