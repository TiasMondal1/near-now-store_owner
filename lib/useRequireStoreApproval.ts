import { useEffect } from "react";
import { router } from "expo-router";
import { getSession } from "../session";
import { checkStoreApproval } from "./storeApproval";

/**
 * Redirects unapproved shopkeepers to the pending verification screen.
 * Use on Orders, Payouts, Inventory, and Settings screens.
 */
export function useRequireStoreApproval() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getSession();
        if (!session?.token || cancelled) return;
        const { approved } = await checkStoreApproval(session.token, session.user?.id);
        if (!approved && !cancelled) {
          router.replace("/pending-verification");
        }
      } catch {
        // Network failure: fail open so a transient error does not lock the owner out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
