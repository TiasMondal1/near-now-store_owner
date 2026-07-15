import { useEffect } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { getSession } from "../session";
import { config } from "./config";

/**
 * Redirects away from a screen (back to Home) if the shopkeeper's store isn't
 * yet admin-approved. Call at the top of Orders/Payouts/Inventory screens —
 * those are gated behind approval, unlike Home which is always accessible.
 */
export function useRequireStoreApproval() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token || cancelled) return;
        const res = await fetch(`${config.API_BASE}/store-owner/stores`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const stores = json?.stores ?? [];
        const approved = stores.length > 0 && !!stores[0]?.is_approved;
        if (!approved && !cancelled) {
          router.replace("/(tabs)/home");
          Alert.alert(
            "Pending Approval",
            "Your store is awaiting admin approval. You'll be able to use this once approved."
          );
        }
      } catch {
        // Network failure: fail open rather than lock the owner out on a transient error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
