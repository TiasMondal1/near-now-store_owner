import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { config } from '../lib/config';
import { useSmartPoll } from '../lib/useSmartPoll';

const API_BASE = config.API_BASE;
const ORDER_TIMEOUT_SECONDS = 60;

export interface Order {
  id: string;
  order_code: string;
  status: string;
  customer_name?: string;
  total_amount: number;
  items?: any[];
  [key: string]: any;
}

export function useOrders(token: string | null, storeId: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(ORDER_TIMEOUT_SECONDS);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  // Ref mirror of incomingOrder so fetchOrders doesn't need it as a dep
  const incomingOrderRef = useRef<Order | null>(null);

  const closeIncomingOrder = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    deadlineRef.current = null;
    incomingOrderRef.current = null;
    setIncomingOrder(null);
  }, []);

  const rejectOrder = useCallback(async () => {
    const order = incomingOrderRef.current;
    if (!order || !token) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await fetch(`${API_BASE}/store-owner/orders/${order.id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // non-fatal — order will auto-expire server-side
    }

    closeIncomingOrder();
  }, [token, closeIncomingOrder]);

  const openIncomingOrder = useCallback(async (order: Order) => {
    if (incomingOrderRef.current?.id === order.id) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    incomingOrderRef.current = order;
    setIncomingOrder(order);

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

  // fetchOrders no longer depends on incomingOrder state — uses ref instead
  const fetchOrders = useCallback(async () => {
    if (!token || !storeId) return;

    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/orders`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!json?.success) {
        setOrders([]);
        return;
      }

      const orderList: Order[] = json.orders || [];
      setOrders(orderList);

      const pending = orderList.find((o) => o.status === 'pending_store');
      if (pending && !incomingOrderRef.current) {
        openIncomingOrder(pending);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token, storeId, openIncomingOrder]);

  const acceptOrder = useCallback(async () => {
    const order = incomingOrderRef.current;
    if (!order || !token) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await fetch(`${API_BASE}/store-owner/orders/${order.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      closeIncomingOrder();
      fetchOrders();
    } catch {
      Alert.alert('Error', 'Failed to accept order. Please try again.');
    }
  }, [token, closeIncomingOrder, fetchOrders]);

  const verifyQR = useCallback(async (qrData: string, order: Order) => {
    if (!token) return { success: false, error: 'No authentication token' };

    try {
      const res = await fetch(
        `${API_BASE}/store-owner/orders/${order.id}/verify-qr`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: qrData }),
        }
      );

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!res.ok || !json?.success) {
        return { success: false, error: json?.error_code || 'VERIFICATION_FAILED' };
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [token]);

  const fetchOrderDetails = useCallback(async (orderId: string) => {
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      return json?.success ? json.order : null;
    } catch {
      return null;
    }
  }, [token]);

  // Initial fetch on mount / when credentials arrive
  useEffect(() => {
    if (!token || !storeId) return;
    fetchOrders();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [token, storeId, fetchOrders]);

  // Smart poll: pauses in background, immediate refresh on foreground
  useSmartPoll(fetchOrders, {
    intervalMs: 10_000,
    slowIntervalMs: 30_000,
    enabled: !!(token && storeId),
  });

  return {
    orders,
    selectedOrder,
    incomingOrder,
    loading,
    countdown,
    fetchOrders,
    acceptOrder,
    rejectOrder,
    verifyQR,
    fetchOrderDetails,
    setSelectedOrder,
    closeIncomingOrder,
  };
}
