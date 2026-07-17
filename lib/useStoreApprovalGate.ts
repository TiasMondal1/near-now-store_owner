import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../session";
import { isStoreApproved, refreshStoreApproval, type ApprovalStore } from "./storeApproval";

type GateMode = "require-approved" | "require-pending";

const POLL_INTERVAL_MS = 30_000;

/**
 * require-approved  → blocks unapproved shopkeepers (tabs, settings, orders, etc.)
 * require-pending   → keeps approved shopkeepers off the pending screen
 */
export function useStoreApprovalGate(mode: GateMode) {
  const [checking, setChecking] = useState(true);
  const [store, setStore] = useState<ApprovalStore | null>(null);
  const [approved, setApproved] = useState(false);

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
      // Network failure: fail open so a transient error does not lock the
      // owner out or hang this screen on "checking" forever.
      return null;
    }

    setStore(result.store);
    setApproved(result.approved);

    if (mode === "require-approved" && !result.approved) {
      router.replace("/pending-verification");
      return result;
    }
    if (mode === "require-pending" && result.approved) {
      router.replace("/(tabs)/home");
      return result;
    }

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
  // next mount/focus.
  useEffect(() => {
    const id = setInterval(() => {
      void evaluate();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [evaluate]);

  return { checking, store, approved, isApproved: isStoreApproved(store), refresh: evaluate };
}
