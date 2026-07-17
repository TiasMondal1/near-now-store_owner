import { fetchStoresCached, peekStores, type CachedStore } from "./appCache";
import { config } from "./config";

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
): Promise<"/(tabs)/home" | "/pending-verification"> {
  const { approved } = await checkStoreApproval(token, userId);
  return approved ? "/(tabs)/home" : "/pending-verification";
}

export async function refreshStoreApproval(
  token: string,
  userId?: string
): Promise<{ approved: boolean; store: ApprovalStore | null }> {
  const url = `${config.API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Failed to refresh store status");
  const json = await res.json();
  const stores: ApprovalStore[] = json?.stores ?? [];
  const store = stores[0] ?? null;
  return { approved: isStoreApproved(store), store };
}
