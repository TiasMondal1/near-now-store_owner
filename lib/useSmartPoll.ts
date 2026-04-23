import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

/**
 * AppState-aware polling hook.
 *
 * Behaviour:
 *  - Polls at `intervalMs` when app is in foreground.
 *  - Fires an immediate refresh when app returns from background (no waiting for
 *    the next tick — shopkeepers need instant order visibility on resume).
 *  - Clears the interval when app is backgrounded (saves battery + CPU).
 *  - When `isRealtimeHealthy` is true, uses `slowIntervalMs` instead of `intervalMs`
 *    because realtime is delivering changes in real time; polling becomes a safety net only.
 *  - Completely pauses when `enabled` is false (e.g. no session, no storeId).
 */
export function useSmartPoll(
  callback: () => void,
  {
    intervalMs = 10_000,
    slowIntervalMs = 30_000,
    isRealtimeHealthy = false,
    enabled = true,
  }: {
    intervalMs?: number;
    slowIntervalMs?: number;
    isRealtimeHealthy?: boolean;
    enabled?: boolean;
  } = {}
): void {
  // Keep callback ref so the interval always calls the freshest version without
  // needing to be in the dependency array (avoids spurious interval restarts).
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeInterval = isRealtimeHealthy ? slowIntervalMs : intervalMs;

  useEffect(() => {
    function clear() {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function start() {
      clear();
      if (!enabledRef.current) return;
      if (appStateRef.current !== "active") return;

      intervalRef.current = setInterval(() => {
        if (appStateRef.current === "active" && enabledRef.current) {
          callbackRef.current();
        }
      }, activeInterval);
    }

    if (!enabled) {
      clear();
      return;
    }

    start();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === "active" && prev !== "active") {
        // Returned to foreground — refresh immediately then restart interval.
        if (enabledRef.current) callbackRef.current();
        start();
      } else if (next !== "active") {
        // Went to background — stop polling to save battery.
        clear();
      }
    });

    return () => {
      sub.remove();
      clear();
    };
  }, [enabled, activeInterval]);
}
