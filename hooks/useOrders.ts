/**
 * Custom hook for order management
 * Handles fetching, accepting, rejecting, and verifying orders
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { config } from '../lib/config';

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
  
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const deadlineRef = useRef<number | null>(null);

  // Fetch orders
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

      setOrders(json.orders || []);

      // Check for pending orders
      const pending = json.orders?.find((o: Order) => o.status === 'pending_store');
      if (pending && !incomingOrder) {
        openIncomingOrder(pending);
      }
    } catch (err) {
      console.error('[useOrders] Error fetching orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token, storeId, incomingOrder]);

  // Open incoming order popup
  const openIncomingOrder = useCallback(async (order: Order) => {
    if (incomingOrder?.id === order.id) return;

    // Clear existing countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    setIncomingOrder(order);

    const deadline = Date.now() + ORDER_TIMEOUT_SECONDS * 1000;
    deadlineRef.current = deadline;
    setCountdown(ORDER_TIMEOUT_SECONDS);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // Start countdown
    countdownRef.current = setInterval(() => {
      const remainingMs = (deadlineRef.current ?? 0) - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

      setCountdown(remainingSec);

      if (remainingSec <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        rejectOrder();
      }
    }, 500);
  }, [incomingOrder]);

  // Close incoming order popup
  const closeIncomingOrder = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    deadlineRef.current = null;
    setIncomingOrder(null);
  }, []);

  // Accept order
  const acceptOrder = useCallback(async () => {
    if (!incomingOrder || !token) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await fetch(`${API_BASE}/store-owner/orders/${incomingOrder.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      closeIncomingOrder();
      fetchOrders();
    } catch (err) {
      console.error('[useOrders] Error accepting order:', err);
      Alert.alert('Error', 'Failed to accept order. Please try again.');
    }
  }, [incomingOrder, token, closeIncomingOrder, fetchOrders]);

  // Reject order
  const rejectOrder = useCallback(async () => {
    if (!incomingOrder || !token) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await fetch(`${API_BASE}/store-owner/orders/${incomingOrder.id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      closeIncomingOrder();
      fetchOrders();
    } catch (err) {
      console.error('[useOrders] Error rejecting order:', err);
    }
  }, [incomingOrder, token, closeIncomingOrder, fetchOrders]);

  // Verify QR code
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
      console.error('[useOrders] Error verifying QR:', err);
      return { success: false, error: err.message };
    }
  }, [token]);

  // Fetch order details
  const fetchOrderDetails = useCallback(async (orderId: string) => {
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!json?.success) {
        return null;
      }

      return json.order;
    } catch (err) {
      console.error('[useOrders] Error fetching order details:', err);
      return null;
    }
  }, [token]);

  // Auto-fetch orders on mount and interval
  useEffect(() => {
    if (!token || !storeId) return;

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000); // Poll every 10s

    return () => {
      clearInterval(interval);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [token, storeId, fetchOrders]);

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
