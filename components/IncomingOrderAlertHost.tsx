/**
 * Controller for the incoming-order popup. Mounted once inside
 * `IncomingOrdersProvider` (app/(tabs)/_layout.tsx) so it is alive whenever
 * the shopkeeper is logged in, whichever tab or pushed screen is up.
 *
 * Flow:
 *   push arrives / realtime row / poll tick
 *     → provider refetches pending allocations
 *     → `pickNewAlerts` finds ones never shown before
 *     → queue them, open the sheet, start the ringer (loop chime + vibrate)
 *     → Accept / Reject call the same endpoints as the Orders tab, then
 *       `emitOrdersChanged()` so every list refetches immediately
 *     → an order that vanishes from the pending list while shown (accepted
 *       on another device, expired) closes itself with a toast.
 *
 * Every allocation ever shown is remembered on disk, so a restart, a
 * dismissed popup or a second poll never rings the same order twice.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { apiClient } from "../lib/api-client";
import { peekStoresAny } from "../lib/appCache";
import { loadSeenAlertIds, orderRinger, pickNewAlerts, saveSeenAlertIds } from "../lib/incomingOrderAlert";
import { isDemoAllocation, onDemoOrder } from "../lib/demoOrderEvents";
import {
  cancelLockScreenAlerts,
  onPendingLockScreenAction,
  showLockScreenOrderAlert,
  takePendingLockScreenAction,
} from "../lib/lockScreenAlert";
import { pluralItems } from "./orders/format";
import { useIncomingOrders } from "../lib/incomingOrdersContext";
import { notificationService } from "../lib/notifications";
import { emitOrdersChanged } from "../lib/orderEvents";
import { LOCK_ACTION_TTL_MS, resolveLockScreenTap, type LockScreenTap } from "../lib/orderAlertRules";
import { triggerHaptic, useToast } from "./ui";
import { IncomingOrderAlertSheet } from "./IncomingOrderAlertSheet";
import type { Allocation } from "./orders/types";

function errorMessageOf(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

/** Online state of an allocation's store from the cached store list; unknown → allow. */
function storeActiveFor(alloc: Allocation | null): boolean {
  if (!alloc?.store_id) return true;
  const store = peekStoresAny()?.find((s) => String(s.id) === String(alloc.store_id));
  return store ? store.is_active !== false : true;
}

export function IncomingOrderAlertHost() {
  const { pendingAllocations, session, refreshIncoming } = useIncomingOrders();
  const { show: showToast } = useToast();

  // Seen-set: null until loaded from disk. Alerts are never computed before
  // the load resolves, or the very first poll would ring for everything.
  const seenRef = useRef<Set<string> | null>(null);
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSeenAlertIds().then((ids) => {
      if (cancelled) return;
      seenRef.current = new Set(ids);
      setSeenLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback((ids: string[]) => {
    const seen = seenRef.current ?? (seenRef.current = new Set());
    ids.forEach((id) => seen.add(id));
    void saveSeenAlertIds(Array.from(seen));
  }, []);

  // Queue of allocations awaiting a response; the head is on screen.
  const [queue, setQueue] = useState<Allocation[]>([]);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [ringing, setRinging] = useState(false);
  const [ringStartedAt, setRingStartedAt] = useState<number | null>(null);

  const stopRinging = useCallback(() => {
    orderRinger.stop();
    setRinging(false);
  }, []);

  const startRinging = useCallback(() => {
    if (orderRinger.isRinging()) return;
    const sound = notificationService.getPreferences().newOrders !== false;
    setRingStartedAt(Date.now());
    setRinging(true);
    void orderRinger.start({ sound, onSilenced: () => setRinging(false) });
  }, []);

  // Enqueue newly-seen pending orders and keep queued ones in sync with the
  // latest server copy (items can change while the popup is up).
  useEffect(() => {
    if (!seenLoaded || !seenRef.current) return;
    const fresh = pickNewAlerts(pendingAllocations, seenRef.current);
    if (fresh.length === 0) return;
    // Remembered the moment they are queued — not when answered — so a
    // crash or force-close between the two never re-rings them.
    markSeen(fresh.map((a) => a.allocation_id));
    setQueue((prev) => {
      const have = new Set(prev.map((a) => a.allocation_id));
      return [...prev, ...fresh.filter((a) => !have.has(a.allocation_id))];
    });
    if (AppState.currentState === "active") {
      startRinging();
    } else {
      // App alive but not in front (foreground service / recently
      // backgrounded): ring on the lock screen with the order details. Any
      // plain push alert for the same order is replaced by this richer one.
      const a = fresh[0];
      void cancelLockScreenAlerts().then(() =>
        showLockScreenOrderAlert({
          id: `order-ring-${a.allocation_id}`,
          title: fresh.length > 1 ? `${fresh.length} new order requests` : `New order #${a.order_code}`,
          body: [pluralItems(a.items.length), a.customer_distance ? `${a.customer_distance} away` : null, "Tap to accept or reject"]
            .filter(Boolean)
            .join(" · "),
          data: { allocation_id: a.allocation_id },
        })
      );
    }
  }, [pendingAllocations, seenLoaded, markSeen, startRinging]);

  // Developer-tools demo orders (lib/devTools): injected straight into the
  // queue; they never exist on the server, so they are exempt from the
  // "vanished from pending" reconciliation below and answered locally.
  useEffect(
    () =>
      onDemoOrder((alloc) => {
        setQueue((prev) => (prev.some((a) => a.allocation_id === alloc.allocation_id) ? prev : [...prev, alloc]));
        startRinging();
      }),
    [startRinging]
  );

  // Drop queued orders that are no longer pending on the server (answered
  // elsewhere, timed out, cancelled). Only after the first successful poll
  // following queueing — an empty list from a failed fetch must not close
  // a live popup. `pendingAllocations` is only ever replaced on success.
  const pendingIds = useMemo(() => new Set(pendingAllocations.map((a) => a.allocation_id)), [pendingAllocations]);
  useEffect(() => {
    // Our own accept/reject is about to reconcile; re-evaluated when it ends
    // so an order that expired mid-request still gets cleared.
    if (busy) return;
    setQueue((prev) => {
      const next = prev.filter((a) => isDemoAllocation(a.allocation_id) || pendingIds.has(a.allocation_id));
      if (next.length === prev.length) return prev;
      const gone = prev.filter((a) => !isDemoAllocation(a.allocation_id) && !pendingIds.has(a.allocation_id));
      if (gone.length > 0 && next.length === 0) {
        showToast({ message: `Order #${gone[0].order_code} is no longer waiting for you` });
      }
      return next;
    });
  }, [pendingIds, busy, showToast]);

  // Refresh the queued copies with any newer server data.
  useEffect(() => {
    if (pendingAllocations.length === 0) return;
    const byId = new Map(pendingAllocations.map((a) => [a.allocation_id, a]));
    setQueue((prev) => {
      let changed = false;
      const next = prev.map((a) => {
        const latest = byId.get(a.allocation_id);
        if (latest && latest !== a) {
          changed = true;
          return latest;
        }
        return a;
      });
      return changed ? next : prev;
    });
  }, [pendingAllocations]);

  // Silence when the queue empties; re-ring when something new lands while
  // the popup is already up but has gone quiet.
  useEffect(() => {
    if (queue.length === 0) stopRinging();
  }, [queue.length, stopRinging]);

  // Never keep ringing from the background: the OS notification is the
  // background alert. Resume rings again if the popup is still up.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (orderRinger.isRinging()) stopRinging();
      } else if (queue.length > 0) {
        // Back in front with an order waiting: the popup is visible now, so
        // the OS alert can go, and the in-app ring takes over.
        void cancelLockScreenAlerts();
        if (!orderRinger.isRinging()) startRinging();
      }
    });
    return () => sub.remove();
  }, [queue.length, startRinging, stopRinging]);

  useEffect(() => () => orderRinger.stop(), []);

  const current = queue[0] ?? null;

  // The in-app popup is now ringing for this order — stop the OS lock-screen
  // ring (Notifee) so the two never play over each other. ONLY while the app
  // is actually in front: the JS runtime stays alive for a while after
  // backgrounding (timers, realtime events), and cancelling from there
  // silently killed the lock-screen alert the shopkeeper was meant to see.
  useEffect(() => {
    if (current && AppState.currentState === "active") void cancelLockScreenAlerts();
  }, [current?.allocation_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accept / Reject tapped on the lock-screen notification: the tap can
  // arrive before the order data does. Park it, then apply it to exactly the
  // order it was for once that order has loaded (resolveLockScreenTap) —
  // never to another one. It used to fall back to the first queued order
  // and wait forever, so a tap could answer an unrelated, later order.
  const [lockAction, setLockAction] = useState<LockScreenTap | null>(null);
  useEffect(() => {
    const pull = () => {
      const p = takePendingLockScreenAction();
      if (p) setLockAction(p);
    };
    pull();
    return onPendingLockScreenAction(pull);
  }, []);

  // Store online state for the order's store — Accept is blocked while the
  // store is offline, mirroring IncomingOrderCard. Unknown store → allow.
  const storeActive = useMemo(() => storeActiveFor(current), [current]);

  const finish = useCallback(
    (allocId: string) => {
      setQueue((prev) => prev.filter((a) => a.allocation_id !== allocId));
      emitOrdersChanged();
      void refreshIncoming();
    },
    [refreshIncoming]
  );

  // Answer one specific order. The popup buttons pass the order on screen;
  // a lock-screen tap passes the order it was for.
  const acceptAlloc = useCallback(
    async (alloc: Allocation, itemIds: string[]) => {
      if (busy) return;
      stopRinging();
      if (isDemoAllocation(alloc.allocation_id)) {
        void triggerHaptic("success");
        showToast({ message: `DEMO order accepted (${itemIds.length} items) — nothing was sent to the backend`, tone: "success" });
        setQueue((prev) => prev.filter((a) => a.allocation_id !== alloc.allocation_id));
        return;
      }
      if (!session?.token) return;
      setBusy("accept");
      try {
        const response = await apiClient.post(
          `/shopkeeper/allocations/${alloc.allocation_id}/accept`,
          { accepted_item_ids: itemIds },
          { Authorization: `Bearer ${session.token}` }
        );
        const json: any = response.data;
        if (response.success && json?.success) {
          void triggerHaptic("success");
          showToast({ message: `Order #${alloc.order_code} accepted · moved to Active`, tone: "success" });
          finish(alloc.allocation_id);
        } else {
          void triggerHaptic("error");
          showToast({
            message: errorMessageOf(json?.error, response.error) ?? "Couldn't accept the order. Try again.",
            tone: "error",
          });
        }
      } catch {
        void triggerHaptic("error");
        showToast({ message: "Couldn't accept the order. Try again.", tone: "error" });
      } finally {
        setBusy(null);
      }
    },
    [session?.token, busy, stopRinging, showToast, finish]
  );

  const rejectAlloc = useCallback(
    async (alloc: Allocation) => {
      if (busy) return;
      stopRinging();
      if (isDemoAllocation(alloc.allocation_id)) {
        showToast({ message: "DEMO order rejected — nothing was sent to the backend" });
        setQueue((prev) => prev.filter((a) => a.allocation_id !== alloc.allocation_id));
        return;
      }
      if (!session?.token) return;
      setBusy("reject");
      try {
        const response = await apiClient.post(`/shopkeeper/allocations/${alloc.allocation_id}/reject`, undefined, {
          Authorization: `Bearer ${session.token}`,
        });
        const json: any = response.data;
        if (response.success && json?.success !== false) {
          showToast({ message: `Order #${alloc.order_code} rejected` });
          finish(alloc.allocation_id);
        } else {
          void triggerHaptic("error");
          showToast({
            message: errorMessageOf(json?.error, response.error) ?? "Couldn't reject the order. Try again.",
            tone: "error",
          });
        }
      } catch {
        void triggerHaptic("error");
        showToast({ message: "Couldn't reject the order. Try again.", tone: "error" });
      } finally {
        setBusy(null);
      }
    },
    [session?.token, busy, stopRinging, showToast, finish]
  );

  const onAccept = useCallback(
    async (itemIds: string[]) => {
      if (!current) return;
      await acceptAlloc(current, itemIds);
    },
    [current, acceptAlloc]
  );

  const onReject = useCallback(async () => {
    if (!current) return;
    await rejectAlloc(current);
  }, [current, rejectAlloc]);

  // "Not now" / Android back: close everything queued; the orders stay in
  // the Orders tab's Incoming list and are already marked seen.
  const onDismiss = useCallback(() => {
    if (busy) return;
    stopRinging();
    setQueue([]);
  }, [busy, stopRinging]);

  useEffect(() => {
    if (!lockAction || busy) return undefined;
    const decision = resolveLockScreenTap(lockAction, queue, pendingAllocations);
    if (decision.kind === "wait") {
      // Its order has not loaded yet. Look again when the tap expires, so an
      // order that never appears (answered elsewhere, expired) is dropped.
      const tap = lockAction;
      const t = setTimeout(
        () => setLockAction((cur) => (cur === tap ? { ...tap } : cur)),
        Math.max(0, tap.at + LOCK_ACTION_TTL_MS - Date.now()) + 50
      );
      return () => clearTimeout(t);
    }
    setLockAction(null);
    if (decision.kind === "drop") {
      if (decision.reason === "expired") showToast({ message: "That order is no longer waiting for you" });
      return undefined;
    }
    const { alloc, inQueue } = decision;
    if (lockAction.action === "accept" && !storeActiveFor(alloc)) {
      // Same rule as the popup's Accept button: not while the store is
      // offline. Put the order on screen so it can still be answered.
      if (!inQueue) setQueue((prev) => (prev.some((a) => a.allocation_id === alloc.allocation_id) ? prev : [alloc, ...prev]));
      showToast({ message: `Store is offline. Go online to accept order #${alloc.order_code}.`, tone: "error" });
      return undefined;
    }
    if (lockAction.action === "accept") void acceptAlloc(alloc, alloc.items.map((i) => i.id));
    else void rejectAlloc(alloc);
    return undefined;
  }, [lockAction, busy, queue, pendingAllocations, acceptAlloc, rejectAlloc, showToast]);

  return (
    <IncomingOrderAlertSheet
      visible={!!current}
      alloc={current}
      position={{ index: 1, total: queue.length }}
      storeActive={storeActive}
      busy={busy}
      ringing={ringing}
      ringStartedAt={ringStartedAt}
      onAccept={onAccept}
      onReject={onReject}
      onDismiss={onDismiss}
    />
  );
}

export default IncomingOrderAlertHost;
