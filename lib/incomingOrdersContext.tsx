import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSession } from '../session';
import { apiClient } from './api-client';
import { useSmartPoll } from './useSmartPoll';

const IncomingOrdersContext = createContext<{
  incomingCount: number;
  setIncomingCount: (n: number) => void;
}>({ incomingCount: 0, setIncomingCount: () => {} });

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
  const [session, setSession] = useState<any | null>(null);

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
      const res = await apiClient.get<{ orders?: Array<{ alloc_status?: string }> }>(
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
      const count = orders.filter((o) => o.alloc_status === 'pending_acceptance').length;
      setIncomingCount(count);
    } catch {
      // Non-fatal — badge stays on its last known count.
    }
  }, [session?.token]);

  useEffect(() => { pollIncomingCount(); }, [pollIncomingCount]);

  useSmartPoll(pollIncomingCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!session?.token,
  });

  // Memoized so a re-render of this provider for reasons unrelated to
  // incomingCount (e.g. its own session bootstrap effect) doesn't
  // force every useIncomingOrdersCount() consumer across the whole tab
  // layout to re-render just because this object literal has a new
  // reference.
  const value = useMemo(() => ({ incomingCount, setIncomingCount }), [incomingCount]);

  return (
    <IncomingOrdersContext.Provider value={value}>
      {children}
    </IncomingOrdersContext.Provider>
  );
}

export function useIncomingOrdersCount() {
  return useContext(IncomingOrdersContext);
}
