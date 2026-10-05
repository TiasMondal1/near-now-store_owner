import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSession } from '../session';
import { apiClient } from './api-client';
import { useSmartPoll } from './useSmartPoll';
import { supabase } from './supabase';
import { fetchStoresCached, peekStores } from './appCache';
import { emitOrdersChanged, onOrdersChanged } from './orderEvents';
import type { UserSession } from '../session';
import type { Allocation } from '../components/orders/types';
import { AppState } from 'react-native';
import { isOrderListenerRunning, onOrderListenerChange } from './orderListenerService';

type IncomingOrdersValue = {
  incomingCount: number;
  setIncomingCount: (n: number) => void;
  /**
   * Full pending_acceptance allocations from this provider's own poll — the
   * incoming-order popup (components/IncomingOrderAlertHost) decides which
   * of these to ring for. Only ever replaced after a successful fetch, so a
   * failed poll never looks like "all orders gone".
   */
  pendingAllocations: Allocation[];
  session: UserSession | null;
  /**
   * Accepted (in-progress) allocations per store id, from the same poll —
   * Home's "active orders" count reads this instead of sending the identical
   * GET /shopkeeper/orders?active=true request itself.
   */
  acceptedCountByStore: Readonly<Record<string, number>>;
  /** Force an immediate refetch of the pending list. */
  refreshIncoming: () => Promise<void>;
};

/** How often the app checks for new orders while open. */
export const INCOMING_POLL_MS = 15_000;
/** How often it checks in the background while the "store online" service runs. */
export const INCOMING_BACKGROUND_POLL_MS = 20_000;

const IncomingOrdersContext = createContext<IncomingOrdersValue>({
  incomingCount: 0,
  setIncomingCount: () => {},
  pendingAllocations: [],
  session: null,
  acceptedCountByStore: {},
  refreshIncoming: async () => {},
});

/** Accepted allocations per store id — Home's former count, for every store at once. */
export function countAcceptedByStore(orders: readonly { store_id?: string | null; alloc_status?: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of orders) {
    if (o.alloc_status !== 'accepted' || !o.store_id) continue;
    counts[o.store_id] = (counts[o.store_id] ?? 0) + 1;
  }
  return counts;
}

function sameCounts(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}

export function IncomingOrdersProvider({ children }: { children: React.ReactNode }) {
  const [incomingCount, setIncomingCount] = useState(0);

  // Self-contained poll, independent of previous-orders.tsx ever having been
  // mounted. Expo Router's Tabs lazily mount screens by default, so the tab
  // badge previously stayed at 0 for a shopkeeper who opened the app to Home
  // and never tapped into Orders — this provider wraps the whole tab layout
  // (app/(tabs)/_layout.tsx), so it's always mounted regardless of which tab
  // is focused. previous-orders.tsx still independently recomputes and calls
  // setIncomingCount from its own richer allocations state whenever it *is*
  // mounted.
  const [session, setSession] = useState<UserSession | null>(null);
  const [pendingAllocations, setPendingAllocations] = useState<Allocation[]>([]);
  const [acceptedCountByStore, setAcceptedCountByStore] = useState<Readonly<Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (cancelled || !s?.token) return;
        setSession(s);
      } catch {
        // Non-fatal — badge just stays at 0 until the next successful poll or
        // until previous-orders.tsx supplies a count.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pollIncomingCount = useCallback(async () => {
    if (!session?.token) return;
    try {
      const res = await apiClient.get<{ orders?: Allocation[] }>(
        '/shopkeeper/orders?active=true',
        { Authorization: `Bearer ${session.token}` }
      );
      if (!res.success) return;
      const orders = res.data?.orders ?? [];
      // Count ALL pending allocations for this shopkeeper — the Orders
      // screen's Incoming tab shows every store's allocations, and it writes
      // its own count into this same context, so filtering by one store here
      // made the badge oscillate between two different numbers for
      // multi-store shopkeepers as the two writers alternated.
      const pending = orders.filter((o) => o.alloc_status === 'pending_acceptance');
      setIncomingCount(pending.length);
      // Identity-stable: this runs every 15s and the popup host keys effects
      // off this array — an identical-but-new array would churn them.
      setPendingAllocations((prev) => (samePending(prev, pending) ? prev : pending));
      const accepted = countAcceptedByStore(orders);
      setAcceptedCountByStore((prev) => (sameCounts(prev, accepted) ? prev : accepted));
    } catch {
      // Non-fatal — badge stays on its last known count.
    }
  }, [session?.token]);

  useEffect(() => { pollIncomingCount(); }, [pollIncomingCount]);

  // Fixed rate, never slowed for realtime. Production's store_orders RLS
  // (service_role / admins only) gives this app's realtime connection no
  // rows, yet every channel still reports SUBSCRIBED — slowing the poll on
  // that (30 s open / 60 s background, 2026-10-05) only made new orders show
  // up later. Fixed 2026-10-06.
  useSmartPoll(pollIncomingCount, {
    intervalMs: INCOMING_POLL_MS,
    enabled: !!session?.token,
  });

  // Instant refresh when a push arrives or a store_orders row changes —
  // the poll above is only the safety net.
  useEffect(() => onOrdersChanged(pollIncomingCount), [pollIncomingCount]);

  // useSmartPoll pauses in the background on purpose. While the "store
  // online" foreground service keeps the process alive, run a background
  // safety-net poll so a new order is noticed even if the push is late —
  // the popup host turns it into the lock-screen ring.
  const [listenerRunning, setListenerRunning] = useState(isOrderListenerRunning());
  useEffect(() => onOrderListenerChange(setListenerRunning), []);
  useEffect(() => {
    if (!listenerRunning || !session?.token) return;
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') pollIncomingCount();
    }, INCOMING_BACKGROUND_POLL_MS);
    return () => clearInterval(id);
  }, [listenerRunning, session?.token, pollIncomingCount]);

  // Realtime nudge: this provider wraps the whole tab layout, so it is the
  // one always-mounted place to watch store_orders for every store the
  // shopkeeper owns. Any INSERT/UPDATE just emits the shared event; the
  // subscribers do their normal (authoritative) backend fetch. Today RLS
  // blocks these rows for the app (see the poll above), so this delivers
  // nothing and polling carries the load; it starts working as soon as a
  // shopkeeper read path for store_orders exists.
  useEffect(() => {
    if (!session?.token || !supabase) return;
    let cancelled = false;
    let channels: { unsubscribe?: () => void }[] = [];
    (async () => {
      const stores = peekStores() ?? (await fetchStoresCached(session.token, session.user?.id).catch(() => []));
      if (cancelled || !supabase) return;
      const ids = stores.map((s) => String(s.id)).filter(Boolean);
      channels = ids.map((storeId) =>
        supabase!
          .channel(`store-orders-${storeId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'store_orders', filter: `store_id=eq.${storeId}` },
            () => emitOrdersChanged()
          )
          .subscribe()
      );
    })();
    return () => {
      cancelled = true;
      channels.forEach((ch) => supabase?.removeChannel(ch as any));
    };
  }, [session?.token, session?.user?.id]);

  // Memoized so a re-render of this provider for reasons unrelated to
  // incomingCount (e.g. its own session bootstrap effect) doesn't
  // force every useIncomingOrdersCount() consumer across the whole tab
  // layout to re-render just because this object literal has a new
  // reference.
  const value = useMemo<IncomingOrdersValue>(
    () => ({ incomingCount, setIncomingCount, pendingAllocations, session, acceptedCountByStore, refreshIncoming: pollIncomingCount }),
    [incomingCount, pendingAllocations, session, acceptedCountByStore, pollIncomingCount]
  );

  return (
    <IncomingOrdersContext.Provider value={value}>
      {children}
    </IncomingOrdersContext.Provider>
  );
}

export function useIncomingOrdersCount() {
  return useContext(IncomingOrdersContext);
}

/** Full provider value — pending allocations + session, for the alert popup. */
export function useIncomingOrders(): IncomingOrdersValue {
  return useContext(IncomingOrdersContext);
}

/** Cheap structural equality for the pending list (ids, status, item ids/qty). */
function samePending(a: Allocation[], b: Allocation[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.allocation_id !== y.allocation_id || x.alloc_status !== y.alloc_status) return false;
    const xi = x.items ?? [];
    const yi = y.items ?? [];
    if (xi.length !== yi.length) return false;
    for (let j = 0; j < xi.length; j++) {
      if (xi[j].id !== yi[j].id || xi[j].quantity !== yi[j].quantity) return false;
    }
  }
  return true;
}
