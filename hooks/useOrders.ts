import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { config } from '../lib/config';
import { useSmartPoll } from '../lib/useSmartPoll';

const API_BASE = config.API_BASE;
const ORDER_TIMEOUT_SECONDS = 60;

export interface AllocationItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  image_url?: string;
  item_status: string;
}

export interface Allocation {
  allocation_id: string;
  order_id: string;
  order_code: string;
  alloc_status: 'pending_acceptance' | 'accepted';
  sequence_number: number;
  pickup_code: string | null;
  accepted_item_ids: string[];
  customer_area: string | null;
  customer_distance: string | null;
  placed_at: string;
  items: AllocationItem[];
  accepted_at: string | null;
}

// Backwards-compat alias so callers that imported Order still compile
export type Order = Allocation;

export function useOrders(token: string | null, _storeId?: string | null) {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [incomingAlloc, setIncomingAlloc] = useState<Allocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(ORDER_TIMEOUT_SECONDS);
  const [pickupCode, setPickupCode] = useState<string | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const incomingRef = useRef<Allocation | null>(null);

  const closeIncomingOrder = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    deadlineRef.current = null;
    incomingRef.current = null;
    setIncomingAlloc(null);
    setPickupCode(null);
  }, []);

  const rejectOrder = useCallback(async () => {
    const alloc = incomingRef.current;
    if (!alloc || !token) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await fetch(`${API_BASE}/shopkeeper/allocations/${alloc.allocation_id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // non-fatal — server will auto-expire
    }

    closeIncomingOrder();
  }, [token, closeIncomingOrder]);

  const openIncomingOrder = useCallback(async (alloc: Allocation) => {
    if (incomingRef.current?.allocation_id === alloc.allocation_id) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    incomingRef.current = alloc;
    setIncomingAlloc(alloc);

    const deadline = Date.now() + ORDER_TIMEOUT_SECONDS * 1000;
    deadlineRef.current = deadline;
    setCountdown(ORDER_TIMEOUT_SECONDS);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    countdownRef.current = setInterval(() => {
      const remainingMs = (deadlineRef.current ?? 0) - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setCountdown(remainingSec);

      if (remainingSec <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        rejectOrder();
      }
    }, 1000);
  }, [rejectOrder]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/shopkeeper/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!json?.success) {
        setAllocations([]);
        return;
      }

      const list: Allocation[] = json.orders || [];
      setAllocations(list);

      const pending = list.find((a) => a.alloc_status === 'pending_acceptance');
      if (pending && !incomingRef.current) {
        openIncomingOrder(pending);
      }
    } catch {
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, [token, openIncomingOrder]);

  // Accept: shopkeeper selects which items are available, backend generates pickup code
  const acceptOrder = useCallback(async (acceptedItemIds?: string[]) => {
    const alloc = incomingRef.current;
    if (!alloc || !token) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Default to accepting all items if none specified
    const itemIds = acceptedItemIds ?? alloc.items.map((i) => i.id);

    try {
      const res = await fetch(
        `${API_BASE}/shopkeeper/allocations/${alloc.allocation_id}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted_item_ids: itemIds }),
        }
      );
      const json = await res.json();
      if (json?.success && json?.pickup_code) {
        setPickupCode(json.pickup_code);
      }
      closeIncomingOrder();
      fetchOrders();
    } catch {
      Alert.alert('Error', 'Failed to accept order. Please try again.');
    }
  }, [token, closeIncomingOrder, fetchOrders]);

  useEffect(() => {
    if (!token) return;
    fetchOrders();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [token, fetchOrders]);

  useSmartPoll(fetchOrders, {
    intervalMs: 10_000,
    slowIntervalMs: 30_000,
    enabled: !!token,
  });

  return {
    allocations,
    orders: allocations,         // backwards compat
    selectedOrder: null,
    incomingOrder: incomingAlloc,
    incomingAlloc,
    loading,
    countdown,
    pickupCode,
    fetchOrders,
    acceptOrder,
    rejectOrder,
    setSelectedOrder: () => {},
    closeIncomingOrder,
    fetchOrderDetails: async (_id: string) => null,
    verifyQR: async (_qr: string, _order: any) => ({ success: false, error: 'Not supported' }),
  };
}
