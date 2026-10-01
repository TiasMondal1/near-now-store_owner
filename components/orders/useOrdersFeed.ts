/**
 * Data layer for the Orders tab (app/(tabs)/previous-orders.tsx).
 *
 * Owns the live allocations feed (Incoming + Active), the terminal-state
 * order history (Previous), the persisted cache seed, smart polling, the
 * push/realtime nudge and the focus refetch. Session and store come from
 * `useSelectedStore()` (lib/useSelectedStore) — the screen calls it and passes
 * the result in, so `store.is_active` is already re-read on every focus. The
 * screen keeps only presentation plus the accept/reject actions, which mutate
 * `allocations` through `setAllocations` and stamp `markLocalMutation()` so an
 * in-flight poll cannot revert them.
 *
 * Every endpoint, payload, interval, guard and cache behaviour here is the
 * pre-redesign contract moved verbatim out of the screen file.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { UserSession } from "../../session";
import { getOrdersFromDb, OrdersFetchFailedError } from "../../lib/orders-db";
import { supabase } from "../../lib/supabase";
import type { CachedStore } from "../../lib/appCache";
import { useSmartPoll } from "../../lib/useSmartPoll";
import { onOrdersChanged } from "../../lib/orderEvents";
import { apiClient } from "../../lib/api-client";
import { useIncomingOrdersCount } from "../../lib/incomingOrdersContext";
import { hydrateCache, sameData, writeCache } from "../../lib/persistCache";
import type { Allocation } from "./types";

/** persistCache key for the terminal-state order list — instant "Previous" tab paint. */
const ordersCacheKey = (storeId: string) => `orders200:${storeId}`;

/** The slice of `useSelectedStore()`'s result the feed needs. */
export type SelectedStoreInput = {
  session: UserSession | null;
  store: CachedStore | null;
  /** True while the first store bootstrap is in flight. */
  loading: boolean;
};

export type OrdersFeed = {
  /** Resolved session (`{ token, user }`), or null until bootstrap finishes. */
  session: UserSession | null;
  /** Store online state (`store.is_active`), re-read on every focus by useSelectedStore. */
  storeActive: boolean;
  /** Every allocation with alloc_status accepted | pending_acceptance. */
  allocations: Allocation[];
  setAllocations: Dispatch<SetStateAction<Allocation[]>>;
  /** True until the FIRST fetchActiveOrders settles; never re-armed by polls. */
  allocLoading: boolean;
  /**
   * True once fetchActiveOrders has committed at least one successful response.
   * Lets the screen tell "nothing has ever loaded" (ErrorState) apart from
   * "loaded, list happens to be empty, a later poll blipped" (EmptyState +
   * stale notice) — the filtered per-tab slice can be empty in both cases.
   */
  activeLoaded: boolean;
  activeOrdersError: boolean;
  /** Raw store orders (200 most recent) for the Previous tab. */
  allOrders: any[];
  /** True until the FIRST fetchPreviousOrders settles; never re-armed by polls. */
  prevLoading: boolean;
  /** Same contract as `activeLoaded`, for fetchPreviousOrders. */
  prevLoaded: boolean;
  previousOrdersError: boolean;
  refreshingActive: boolean;
  refreshingPrevious: boolean;
  /** Pull-to-refresh / retry wrappers that show a spinner around the fetchers. */
  handleRefreshActive: () => Promise<void>;
  handleRefreshPrevious: () => Promise<void>;
  /**
   * Stamp a local accept/reject so a poll issued before it cannot commit its
   * stale, pre-mutation response over the optimistic update.
   */
  markLocalMutation: () => void;
};

export function useOrdersFeed(isFocused: boolean, selected: SelectedStoreInput): OrdersFeed {
  const { setIncomingCount } = useIncomingOrdersCount();

  const session = selected.session;
  const storeId = selected.store?.id ?? null;
  // Mirrors home.tsx's storeActive gate on the product Active/Off toggle —
  // this screen had no equivalent check on Accept, so a shopkeeper who took
  // their store offline could still accept a still-pending incoming order in
  // the same session. `!== false` keeps it true before store data has loaded
  // so it never blocks early. Found 2026-09-09.
  const storeActive = selected.store?.is_active !== false;

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  // True from mount until the FIRST fetchActiveOrders settles (success or
  // failure). Only ever flipped false — later polls/refreshes must not bring
  // the skeleton back over an already-painted list.
  const [allocLoading, setAllocLoading] = useState(true);
  // Flipped true on the first successful commit; never reset by later failures.
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [activeOrdersError, setActiveOrdersError] = useState(false);
  const [refreshingActive, setRefreshingActive] = useState(false);
  const [refreshingPrevious, setRefreshingPrevious] = useState(false);

  const [allOrders, setAllOrders] = useState<any[]>([]);
  // Same contract as allocLoading, for the first fetchPreviousOrders.
  const [prevLoading, setPrevLoading] = useState(true);
  const [prevLoaded, setPrevLoaded] = useState(false);
  const [previousOrdersError, setPreviousOrdersError] = useState(false);

  // Loading flags are NOT cleared when the store id resolves — that only
  // means the first fetchActiveOrders/fetchPreviousOrders is about to start;
  // each fetcher clears its own flag when it settles. Clearing them early
  // painted "No incoming orders" while the request was in flight.
  // When the bootstrap has finished and there is still no store (lookup
  // failed or the account has none) nothing will ever fetch, so surface the
  // error state instead of an infinite skeleton or a false empty list.
  useEffect(() => {
    if (!selected.loading && !storeId) {
      setAllocLoading(false);
      setPrevLoading(false);
      setActiveOrdersError(true);
      setPreviousOrdersError(true);
    }
  }, [selected.loading, storeId]);

  // Seed the Previous list from the persisted cache the moment the store id
  // resolves — switching to that tab used to show "No previous orders" (an
  // empty state presented as truth) until the first network fetch landed.
  // Store switch (multi-store owners): drop the previous store's history so it
  // isn't shown under the new store while the new store's list loads — the
  // cache seed below only fills an empty list.
  const prevStoreIdRef = useRef(storeId);
  useEffect(() => {
    if (prevStoreIdRef.current && storeId && prevStoreIdRef.current !== storeId) {
      setAllOrders([]);
      setPrevLoaded(false);
      setPrevLoading(true);
    }
    prevStoreIdRef.current = storeId;
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    hydrateCache<any[]>(ordersCacheKey(storeId)).then((cached) => {
      if (cancelled || !cached?.length) return;
      setAllOrders((prev) => (prev.length > 0 ? prev : cached));
    });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Timestamp of the most recent local accept/reject mutation. A poll that
  // was already in-flight when the shopkeeper accepted/rejected an order
  // carries pre-mutation server data — applying it after the fact would
  // revert the just-completed action's optimistic update (e.g. an accepted
  // allocation flashing back to pending_acceptance) for one poll cycle.
  const lastLocalMutationRef = useRef(0);
  const prevOrdersRequestIdRef = useRef(0);
  // Mount effect + focus effect fire on the same dep changes — throttle so
  // the same request doesn't go out 2-3 times back to back.
  const lastActiveFetchRef = useRef(0);
  const lastPrevFetchRef = useRef(0);

  const markLocalMutation = useCallback(() => {
    lastLocalMutationRef.current = Date.now();
  }, []);

  const fetchActiveOrders = useCallback(async () => {
    if (!session?.token) return;
    const requestStartedAt = Date.now();
    lastActiveFetchRef.current = requestStartedAt;
    try {
      const response = await apiClient.get("/shopkeeper/orders", {
        Authorization: `Bearer ${session.token}`,
      });
      if (!response.success) {
        if (__DEV__) console.warn("[orders] fetchActiveOrders failed:", response.error_code, response.error);
        setActiveOrdersError(true);
        return;
      }
      const json: any = response.data;
      if (json?.success) {
        // A local mutation landed after this request was issued — its
        // response reflects stale, pre-mutation state. Skip applying it;
        // the next scheduled poll will pick up the real current state.
        if (lastLocalMutationRef.current > requestStartedAt) return;

        const active = (json.orders || []).filter(
          (a: Allocation) => a.alloc_status === "accepted" || a.alloc_status === "pending_acceptance"
        );

        setActiveOrdersError(false);
        setActiveLoaded(true);
        setAllocations((prev) => {
          const prevMap = new Map(prev.map((a) => [a.allocation_id, a]));
          const next = active.map((o: Allocation) => ({
            ...o,
            pickup_code: o.pickup_code ?? prevMap.get(o.allocation_id)?.pickup_code ?? null,
          }));
          // Identity-stable commit — this runs every 10s; an identical-but-new
          // array re-rendered every card and the SectionList each tick.
          return sameData(prev, next) ? prev : next;
        });
      } else {
        if (__DEV__) console.warn("[orders] fetchActiveOrders: success=false", json);
        setActiveOrdersError(true);
      }
    } catch (e) {
      if (__DEV__) console.warn("[orders] fetchActiveOrders threw:", e);
      setActiveOrdersError(true);
    } finally {
      // First request has settled (either way) — never re-armed by polls.
      setAllocLoading(false);
    }
  }, [session?.token]);

  const fetchPreviousOrders = useCallback(async () => {
    if (!session || !storeId) return;
    lastPrevFetchRef.current = Date.now();
    // Sequence guard: focus effect, 60s poll, and pull-to-refresh can overlap;
    // only the most recently started request may commit.
    const requestId = ++prevOrdersRequestIdRef.current;
    try {
      // "Previous" only ever shows terminal-state orders — a shopkeeper
      // reviewing history has no real need to see more than the most recent
      // few hundred, and this now-bounded fetch is what previously grew
      // unbounded with a store's entire lifetime order count on every 60s
      // poll. payments.tsx's "All Time" view intentionally stays unbounded
      // (getOrdersFromDb(sid), no limit) since it needs a genuinely
      // complete total.
      const fromDb = await getOrdersFromDb(storeId, 200);
      if (requestId !== prevOrdersRequestIdRef.current) return;
      setPreviousOrdersError(false);
      setPrevLoaded(true);
      if (!Array.isArray(fromDb) || fromDb.length === 0) {
        setAllOrders((prev) => (prev.length === 0 ? prev : []));
        writeCache(ordersCacheKey(storeId), []);
        return;
      }

      // getOrdersFromDb already resolves placed_at for the normal path — only
      // backfill the (rare) rows that still lack it, instead of re-querying
      // customer_orders for all ~200 orders on every poll tick.
      const coIds = [
        ...new Set(
          fromDb
            .filter((o: any) => !o.placed_at && o.customer_order_id)
            .map((o: any) => o.customer_order_id) as string[]
        ),
      ];
      const tsMap: Record<string, string> = {};
      if (coIds.length > 0 && supabase) {
        const { data } = await supabase.from("customer_orders").select("id, placed_at").in("id", coIds);
        if (data) {
          (data as { id: string; placed_at?: string }[]).forEach((co) => {
            if (co.placed_at) tsMap[co.id] = co.placed_at;
          });
        }
      }

      const withPlacedAt = fromDb.map((o: any) => {
        const placedAt = o.placed_at || (o.customer_order_id && tsMap[o.customer_order_id]) || undefined;
        return { ...o, ...(placedAt ? { placed_at: placedAt } : {}) };
      });

      // Orders the RPC returned with no `order_items` (an edge case — the
      // normal/happy path already includes them) previously each triggered
      // their own individual getOrderByIdFromDb() call — a full multi-join
      // single-order lookup, N of them fired concurrently via Promise.all
      // on every poll tick. All that's actually missing is order_items
      // itself, so this batches just that piece in one query instead.
      const missingItemIds = withPlacedAt
        .filter((o: any) => (!Array.isArray(o.order_items) || o.order_items.length === 0) && o?.id)
        .map((o: any) => String(o.id));

      const itemsByOrderId: Record<string, any[]> = {};
      if (missingItemIds.length > 0 && supabase) {
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("id, store_order_id, product_name, unit, image_url, unit_price, quantity")
          .in("store_order_id", missingItemIds);
        (itemsData ?? []).forEach((it: any) => {
          const list = itemsByOrderId[it.store_order_id] ?? [];
          list.push({
            id: it.id,
            product_name: it.product_name || "Item",
            quantity: Number(it.quantity ?? 0),
            unit: it.unit ?? "pcs",
            image_url: it.image_url ?? undefined,
            price: it.unit_price != null ? Number(it.unit_price) : undefined,
          });
          itemsByOrderId[it.store_order_id] = list;
        });
      }

      const withData = withPlacedAt.map((o: any) => {
        if (Array.isArray(o.order_items) && o.order_items.length > 0) return o;
        const items = itemsByOrderId[String(o.id)];
        return items ? { ...o, order_items: items } : o;
      });
      if (requestId !== prevOrdersRequestIdRef.current) return;
      setAllOrders((prev) => (sameData(prev, withData) ? prev : withData));
      // Persist for instant paint next session — strip item images, the list
      // only renders order codes/dates/counts.
      writeCache(
        ordersCacheKey(storeId),
        withData.map((o: any) => ({
          ...o,
          order_items: Array.isArray(o.order_items) ? o.order_items.map(({ image_url, ...it }: any) => it) : [],
        }))
      );
    } catch (e) {
      if (requestId !== prevOrdersRequestIdRef.current) return;
      if (__DEV__ && !(e instanceof OrdersFetchFailedError)) {
        console.warn("[orders] fetchPreviousOrders threw:", e);
      }
      // Any failure to load counts — the empty-list branch only shows the
      // error UI when there's nothing cached to display anyway.
      setPreviousOrdersError(true);
      // Never wipe an already-displayed list over a transient failure — a
      // background poll blip used to blank the whole Previous tab.
      setAllOrders((prev) => (prev.length > 0 ? prev : []));
    } finally {
      // First request has settled (either way) — never re-armed by polls.
      // Only the most recent request may clear it, so a superseded early
      // return can't drop the skeleton before the live request lands.
      if (requestId === prevOrdersRequestIdRef.current) setPrevLoading(false);
    }
  }, [session, storeId]);

  // Wrap the poll-shared fetchers with their own `refreshing` flags so
  // pull-to-refresh (and the ErrorState / InlineNotice retry) shows a spinner
  // — the raw fetchers are also called silently by useSmartPoll/focus effects
  // and shouldn't spin the UI then.
  const handleRefreshActive = useCallback(async () => {
    setRefreshingActive(true);
    await fetchActiveOrders();
    setRefreshingActive(false);
  }, [fetchActiveOrders]);

  const handleRefreshPrevious = useCallback(async () => {
    setRefreshingPrevious(true);
    await fetchPreviousOrders();
    setRefreshingPrevious(false);
  }, [fetchPreviousOrders]);

  useEffect(() => {
    if (session && storeId) {
      fetchActiveOrders();
      fetchPreviousOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, storeId]);

  // Keep the bottom tab-bar badge (IncomingOrdersProvider) in sync with the
  // richer allocation state this screen holds.
  useEffect(() => {
    const count = allocations.filter((a) => a.alloc_status === "pending_acceptance").length;
    setIncomingCount(count);
  }, [allocations, setIncomingCount]);

  useSmartPoll(fetchActiveOrders, {
    intervalMs: 10_000,
    slowIntervalMs: 20_000,
    // Focus-gated: while another tab is up, IncomingOrdersProvider still
    // polls for the badge — this screen's richer poll can pause.
    enabled: !!session?.token && isFocused,
  });

  // Push / realtime nudge: refetch the live queues immediately instead of
  // waiting up to 10s for the next poll tick.
  useEffect(() => {
    if (!session?.token) return;
    return onOrdersChanged(() => {
      fetchActiveOrders();
    });
  }, [session?.token, fetchActiveOrders]);

  // "Previous" only ever shows terminal-state orders that essentially never
  // change once reached, so it polls 6x slower than the live queues.
  useSmartPoll(fetchPreviousOrders, {
    intervalMs: 60_000,
    slowIntervalMs: 120_000,
    enabled: !!(session && storeId) && isFocused,
  });

  useFocusEffect(
    useCallback(() => {
      if (session?.token && Date.now() - lastActiveFetchRef.current > 3_000) fetchActiveOrders();
      // Terminal-state orders essentially never change — a focus refetch
      // within half a poll interval of the last one is pure duplicate.
      if (session?.token && storeId && Date.now() - lastPrevFetchRef.current > 30_000) fetchPreviousOrders();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.token, storeId])
  );

  return {
    session,
    storeActive,
    allocations,
    setAllocations,
    allocLoading,
    activeLoaded,
    activeOrdersError,
    allOrders,
    prevLoading,
    prevLoaded,
    previousOrdersError,
    refreshingActive,
    refreshingPrevious,
    handleRefreshActive,
    handleRefreshPrevious,
    markLocalMutation,
  };
}

export default useOrdersFeed;
