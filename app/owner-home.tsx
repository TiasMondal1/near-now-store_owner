import { useEffect } from "react";
import { router } from "expo-router";
import { getSession } from "../session";

export default function OwnerHomeScreen() {
  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) {
        router.replace("/landing");
      } else {
        router.replace("/(tabs)/home");
      }
    })();
  }, []);

  return null;
}
