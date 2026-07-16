import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../session";
import { checkStoreApproval, isStoreApproved, type ApprovalStore } from "./storeApproval";

type GateMode = "require-approved" | "require-pending";

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

    const result = await checkStoreApproval(session.token, session.user?.id);
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

  return { checking, store, approved, isApproved: isStoreApproved(store), refresh: evaluate };
}
