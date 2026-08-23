import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession } from '../session';
import { fetchStoresCached, peekStores } from './appCache';
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
  // mounted — the two polls run on their own separate schedules and both hit
  // the same endpoint while Orders is open (some redundant traffic, not a
  // correctness issue: both always compute the same count from the same
  // live data), rather than one deferring to the other.
  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (cancelled || !s?.token) return;
        setSession(s);
        const selId = await AsyncStorage.getItem('selected_store_id');
        const cached = peekStores() || (await fetchStoresCached(s.token, s.user?.id));
        if (cancelled) return;
        const picked = (selId && cached?.find((st: any) => st.id === selId)) || cached?.[0];
        if (picked) setStoreId(picked.id);
      } catch {
        // Non-fatal — this provider always mounts (wraps the whole tab
        // layout), unlike previous-orders.tsx's own equivalent bootstrap
        // (which only runs when that screen is opened), so a cold-start
        // network hiccup here shouldn't produce an unhandled rejection on
        // every single app launch. Badge just stays at 0 until the next
        // successful poll or until previous-orders.tsx supplies a count.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pollIncomingCount = useCallback(async () => {
    if (!session?.token || !storeId) return;
    try {
      const res = await apiClient.get<{ orders?: Array<{ store_id?: string; alloc_status?: string }> }>(
        '/shopkeeper/orders?active=true',
        { Authorization: `Bearer ${session.token}` }
      );
      if (!res.success) return;
      const orders = res.data?.orders ?? [];
      const count = orders.filter(
        (o) => o.store_id === storeId && o.alloc_status === 'pending_acceptance'
      ).length;
      setIncomingCount(count);
    } catch {
      // Non-fatal — badge stays on its last known count.
    }
  }, [session?.token, storeId]);

  useEffect(() => { pollIncomingCount(); }, [pollIncomingCount]);

  useSmartPoll(pollIncomingCount, {
    intervalMs: 15_000,
    slowIntervalMs: 30_000,
    enabled: !!(session?.token && storeId),
  });

  // Memoized so a re-render of this provider for reasons unrelated to
  // incomingCount (e.g. its own session/storeId bootstrap effects) doesn't
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
