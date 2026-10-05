/**
 * Event bus for simulated ("demo") incoming orders raised by Developer tools.
 * Dependency-free on purpose: both lib/devTools.ts (the scheduler) and
 * lib/notifications.ts (the notification-tap handler) emit on it, and
 * components/IncomingOrderAlertHost.tsx listens — without this file those
 * two would import each other.
 */
import type { Allocation } from "../components/orders/types";

export const DEMO_ALLOCATION_PREFIX = "demo-";

export function isDemoAllocation(allocationId: string | null | undefined): boolean {
  return !!allocationId && allocationId.startsWith(DEMO_ALLOCATION_PREFIX);
}

type Listener = (alloc: Allocation) => void;
const listeners = new Set<Listener>();
// A demo order raised before the popup host mounted (cold start from the
// demo notification) is held until the first subscriber arrives.
let parked: Allocation | null = null;

export function onDemoOrder(listener: Listener): () => void {
  listeners.add(listener);
  if (parked) {
    const a = parked;
    parked = null;
    listener(a);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function emitDemoOrder(alloc: Allocation): void {
  if (listeners.size === 0) {
    parked = alloc;
    return;
  }
  listeners.forEach((l) => {
    try {
      l(alloc);
    } catch {
      // never let one listener break the others
    }
  });
}
