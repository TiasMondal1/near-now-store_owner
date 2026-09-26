/**
 * Tiny in-process event bus for "something about orders just changed".
 *
 * Emitters: the push-notification received listener (lib/notifications.ts)
 * and the Supabase realtime subscription on store_orders
 * (lib/incomingOrdersContext.tsx). Subscribers: every screen/provider that
 * polls the orders endpoints — they run their existing fetch immediately
 * instead of waiting up to a full poll interval (10–15s), which is why a
 * new order used to buzz the phone and then only appear in the list many
 * seconds later.
 *
 * Polling stays in place as the safety net; this only shortens the gap.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let lastEmitAt = 0;
// Collapse bursts (a push AND a realtime row for the same order arrive
// within milliseconds) into one refresh.
const DEBOUNCE_MS = 750;
let pending: ReturnType<typeof setTimeout> | null = null;

export function onOrdersChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitOrdersChanged(): void {
  if (pending) return;
  const sinceLast = Date.now() - lastEmitAt;
  const delay = sinceLast >= DEBOUNCE_MS ? 0 : DEBOUNCE_MS - sinceLast;
  pending = setTimeout(() => {
    pending = null;
    lastEmitAt = Date.now();
    listeners.forEach((l) => {
      try {
        l();
      } catch {
        // A subscriber throwing must not stop the others from refreshing.
      }
    });
  }, delay);
}
