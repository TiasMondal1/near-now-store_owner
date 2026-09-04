import { useCallback, useEffect, useRef } from "react";
import { router } from "expo-router";
import { getSession } from "../session";
import { refreshStoreApproval } from "./storeApproval";
import { useSmartPoll } from "./useSmartPoll";

const POLL_INTERVAL_MS = 30_000;

/**
 * Redirects unapproved shopkeepers to the pending verification screen.
 * Use on Orders, Payouts, Inventory, and Settings screens.
 *
 * Network cost note: refreshStoreApproval dedupes and briefly reuses results
 * across every mounted instance of this hook + useStoreApprovalGate (see
 * storeApproval.ts), so stacking this on many kept-mounted tab screens no
 * longer multiplies GET /store-owner/stores traffic.
 */
export function useRequireStoreApproval() {
  // Fail closed until we've genuinely confirmed approval at least once;
  // fail open on later transient errors only after that trust is
  // established (see useStoreApprovalGate.ts for the same pattern).
  const hasConfirmedApprovedRef = useRef(false);

  // An in-flight check settling after the owning screen unmounted must not
  // navigate — this hook lives on pushed screens (inbox, billing) too, where
  // a late router.replace would yank the user off whatever they moved on to.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const check = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.token) return;
      // refreshStoreApproval (not checkStoreApproval) deliberately — a
      // cache-preferring read here would let an admin's revoke of an
      // already-approved store go undetected for as long as the client
      // cache stays valid, while the shopkeeper sits on this screen.
      const { approved } = await refreshStoreApproval(session.token, session.user?.id);
      if (approved) hasConfirmedApprovedRef.current = true;
      if (!approved && mountedRef.current) {
        router.replace("/pending-verification");
      }
    } catch {
      if (!hasConfirmedApprovedRef.current && mountedRef.current) {
        router.replace("/pending-verification");
      }
      // Already-confirmed-approved sessions fail open on a later
      // transient error so a flaky network blip doesn't lock the owner out.
    }
  }, []);

  // Immediate check on mount, then AppState-aware re-checks (raw setInterval
  // kept ticking pointlessly in the background) — a revoke taken while the
  // shopkeeper is sitting still on this screen is still noticed within the
  // poll interval.
  useEffect(() => { void check(); }, [check]);
  useSmartPoll(check, { intervalMs: POLL_INTERVAL_MS });
}
