import { fetchStoresCached, peekStores, persistStores, type CachedStore } from "./appCache";
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
  const { approved } = await checkStoreApproval(token, userId);
  // A returning, already-signed-up, not-yet-approved owner always lands on
  // Details first — they can then move freely between Details/Documents/
  // Billing/Status via VerificationNavBar, instead of being dropped straight
  // onto the Status tab.
  return approved ? "/(tabs)/home" : "/store-owner-signup";
}

export async function refreshStoreApproval(
  token: string,
  userId?: string
): Promise<{ approved: boolean; store: ApprovalStore | null }> {
  const endpoint = `/store-owner/stores${userId ? `?userId=${userId}` : ""}`;
  const res = await apiClient.get<{ stores?: ApprovalStore[] }>(endpoint, {
    Authorization: `Bearer ${token}`,
  });
  if (!res.success) throw new Error(res.error || "Failed to refresh store status");
  const stores: ApprovalStore[] = res.data?.stores ?? [];
  const store = stores[0] ?? null;
  // This bypasses the shared store cache (appCache.ts) to force a genuinely
  // fresh read — but without writing the result back, the cache stays stale
  // for up to its 10-minute TTL. The very next screen (e.g. the tabs layout,
  // reached right after this detects approval) reads that stale cache via
  // useStoreApprovalGate and would immediately bounce the user right back to
  // pending-verification, even though they were just approved.
  if (stores.length > 0) await persistStores(stores);
  return { approved: isStoreApproved(store), store };
}
