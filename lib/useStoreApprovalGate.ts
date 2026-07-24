import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../session";
import { isStoreApproved, refreshStoreApproval, type ApprovalStore } from "./storeApproval";
import { supabase } from "./supabase";

type GateMode = "require-approved" | "require-pending";

const POLL_INTERVAL_MS = 30_000;

/**
 * require-approved  → blocks unapproved shopkeepers (tabs, settings, orders, etc.)
 * require-pending   → tracks approval state on the pending-verification screen,
 *                      but does NOT navigate on its own. That screen shows a
 *                      "Store Verified" alert and navigates only from the
 *                      alert's own Continue button (see pending-verification.tsx)
 *                      — a silent auto-redirect here would bypass that alert
 *                      on the ordinary cold-launch-after-approval path, since
 *                      this hook's mount check fires before the user can ever
 *                      see or act on anything.
 */
export function useStoreApprovalGate(mode: GateMode) {
  const [checking, setChecking] = useState(true);
  const [store, setStore] = useState<ApprovalStore | null>(null);
  const [approved, setApproved] = useState(false);

  // Once we've genuinely confirmed the store is approved, a later transient
  // network error is safe to fail open on (don't kick an active shopkeeper
  // out mid-session over a flaky connection). Before that first confirmation
  // — i.e. we've never actually verified this store is approved — failing
  // open on an error would let an unapproved shopkeeper straight past the
  // gate on the very first, unconfirmed check. So: fail closed until proven
  // otherwise, fail open only after trust has been established.
  const hasConfirmedApprovedRef = useRef(false);

  const evaluate = useCallback(async () => {
    const session = await getSession();
    if (!session?.token) {
      router.replace("/landing");
      return null;
    }

    let result;
    try {
      // refreshStoreApproval (not checkStoreApproval) deliberately — this
      // gate wraps every tab screen, and a cache-preferring read here is
      // exactly what let an admin's revoke of an already-approved store go
      // undetected while the shopkeeper sat on a tab screen: the stale
      // cached (still-approved) store kept passing this check indefinitely.
      result = await refreshStoreApproval(session.token, session.user?.id);
    } catch {
      if (mode === "require-approved" && !hasConfirmedApprovedRef.current) {
        router.replace("/pending-verification");
      }
      // Already-confirmed-approved sessions fail open here so a transient
      // error does not lock the owner out or hang this screen on "checking"
      // forever.
      return null;
    }

    setStore(result.store);
    setApproved(result.approved);
    if (result.approved) hasConfirmedApprovedRef.current = true;

    if (mode === "require-approved" && !result.approved) {
      router.replace("/pending-verification");
      return result;
    }
    // require-pending intentionally does not navigate here — see the mode
    // doc comment above.

    return result;
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await evaluate();
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluate]);

  useFocusEffect(
    useCallback(() => {
      void evaluate();
    }, [evaluate])
  );

  // Periodic re-check so an admin action (approve/revoke) taken while the
  // shopkeeper is sitting still on a tab screen — not navigating, not
  // refocusing — is still detected within a bounded time, not only on the
  // next mount/focus. Fallback: the realtime subscription below delivers
  // near-instantly once it's connected; this covers the gap before that
  // first connects, or a store row we don't have an id for yet.
  useEffect(() => {
    const id = setInterval(() => {
      void evaluate();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [evaluate]);

  // Realtime: near-instant re-check the moment an admin approves or revokes
  // this store, instead of waiting up to 30s for the poll above. This gate
  // wraps every tab screen plus pending-verification, so this is what
  // actually closes the gap that previously only home.tsx's own bespoke
  // subscription covered for its own local dashboard state — every other
  // screen using this hook (settings, orders, pending-verification itself)
  // had no realtime at all until now.
  //
  // stores.public_read is intentionally open (USING (true)) — store data
  // (name/address/approval status) isn't sensitive, so unlike the rider
  // app's own-row fix this needs no auth bridge, just a plain filtered
  // subscription on the anon client.
  useEffect(() => {
    if (!store?.id || !supabase) return;
    const channel = supabase
      .channel(`store-approval-gate:${store.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stores", filter: `id=eq.${store.id}` },
        () => {
          void evaluate();
        }
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [store?.id, evaluate]);

  return { checking, store, approved, isApproved: isStoreApproved(store), refresh: evaluate };
}
