import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  /** Force an immediate refetch of the pending list. */
  refreshIncoming: () => Promise<void>;
};

const IncomingOrdersContext = createContext<IncomingOrdersValue>({
  incomingCount: 0,
  setIncomingCount: () => {},
  pendingAllocations: [],
  session: null,
  refreshIncoming: async () => {},
});

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
    } catch {
      // Non-fatal — badge stays on its last known count.
    }
  }, [session?.token]);

  useEffect(() => { pollIncomingCount(); }, [pollIncomingCount]);

  // Realtime health: true while every store channel reports SUBSCRIBED.
  // Drives both polls below — realtime delivers order changes in ~1s, so a
  // healthy socket only needs a slow safety-net poll.
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const channelStatusRef = useRef<Map<string, string>>(new Map());

  useSmartPoll(pollIncomingCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    isRealtimeHealthy: realtimeHealthy,
    enabled: !!session?.token,
  });

  // Instant refresh when a push arrives or a store_orders row changes —
  // the poll above is only the safety net.
  useEffect(() => onOrdersChanged(pollIncomingCount), [pollIncomingCount]);

  // useSmartPoll pauses in the background on purpose. While the "store
  // online" foreground service keeps the process alive, run a background
  // safety-net poll so a new order is noticed even if realtime drops — the
  // popup host turns it into the lock-screen ring. 60 s while the realtime
  // socket is healthy (it delivers changes itself), 20 s when it is down.
  const [listenerRunning, setListenerRunning] = useState(isOrderListenerRunning());
  useEffect(() => onOrderListenerChange(setListenerRunning), []);
  useEffect(() => {
    if (!listenerRunning || !session?.token) return;
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') pollIncomingCount();
    }, realtimeHealthy ? 60_000 : 20_000);
    return () => clearInterval(id);
  }, [listenerRunning, session?.token, pollIncomingCount, realtimeHealthy]);

  // Realtime nudge: this provider wraps the whole tab layout, so it is the
  // one always-mounted place to watch store_orders for every store the
  // shopkeeper owns. Any INSERT/UPDATE just emits the shared event; the
  // subscribers do their normal (authoritative) backend fetch. If realtime
  // is blocked by RLS or the socket drops, nothing breaks — polling still
  // runs.
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
          .subscribe((status) => {
            channelStatusRef.current.set(storeId, status);
            const all = Array.from(channelStatusRef.current.values());
            setRealtimeHealthy(all.length === ids.length && all.every((st) => st === 'SUBSCRIBED'));
          })
      );
    })();
    return () => {
      cancelled = true;
      channelStatusRef.current.clear();
      setRealtimeHealthy(false);
      channels.forEach((ch) => supabase?.removeChannel(ch as any));
    };
  }, [session?.token, session?.user?.id]);

  // Memoized so a re-render of this provider for reasons unrelated to
  // incomingCount (e.g. its own session bootstrap effect) doesn't
  // force every useIncomingOrdersCount() consumer across the whole tab
  // layout to re-render just because this object literal has a new
  // reference.
  const value = useMemo<IncomingOrdersValue>(
    () => ({ incomingCount, setIncomingCount, pendingAllocations, session, refreshIncoming: pollIncomingCount }),
    [incomingCount, pendingAllocations, session, pollIncomingCount]
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
