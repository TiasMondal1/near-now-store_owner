import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { getSession } from "../session";
import { refreshStoreApproval } from "./storeApproval";

const POLL_INTERVAL_MS = 30_000;

/**
 * Redirects unapproved shopkeepers to the pending verification screen.
 * Use on Orders, Payouts, Inventory, and Settings screens.
 */
export function useRequireStoreApproval() {
  // Fail closed until we've genuinely confirmed approval at least once;
  // fail open on later transient errors only after that trust is
  // established (see useStoreApprovalGate.ts for the same pattern).
  const hasConfirmedApprovedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const session = await getSession();
        if (!session?.token || cancelled) return;
        // refreshStoreApproval (not checkStoreApproval) deliberately — a
        // cache-preferring read here would let an admin's revoke of an
        // already-approved store go undetected for as long as the client
        // cache stays valid, while the shopkeeper sits on this screen.
        const { approved } = await refreshStoreApproval(session.token, session.user?.id);
        if (approved) hasConfirmedApprovedRef.current = true;
        if (!approved && !cancelled) {
          router.replace("/pending-verification");
        }
      } catch {
        if (!hasConfirmedApprovedRef.current && !cancelled) {
          router.replace("/pending-verification");
        }
        // Already-confirmed-approved sessions fail open on a later
        // transient error so a flaky network blip doesn't lock the owner out.
      }
    };

    void check();
    // Re-check periodically too, not just on mount — otherwise a revoke
    // taken while the shopkeeper is sitting still on this screen (not
    // navigating away and back) is never noticed.
    const id = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
