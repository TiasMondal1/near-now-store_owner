/**
 * Order Service - Centralized API calls for orders
 * Separates API logic from UI components
 */

import { config } from '../lib/config';
import { createLogger } from '../utils/logger';

const API_BASE = config.API_BASE;
const logger = createLogger('OrderService');

export interface Order {
  id: string;
  order_code: string;
  status: string;
  customer_name?: string;
  total_amount: number;
  items?: any[];
  [key: string]: any;
}

export class OrderService {
  /**
   * Fetch all orders for a store
   */
  static async fetchOrders(token: string, storeId: string): Promise<Order[]> {
    try {
      logger.debug('Fetching orders', { storeId });
      
      const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!json?.success) {
        logger.warn('Failed to fetch orders', { response: json });
        return [];
      }

      logger.info(`Fetched ${json.orders?.length || 0} orders`);
      return json.orders || [];
    } catch (error) {
      logger.error('Error fetching orders', error);
      throw error;
    }
  }

  /**
   * Fetch order details by ID
   */
  static async fetchOrderDetails(token: string, orderId: string): Promise<Order | null> {
    try {
      logger.debug('Fetching order details', { orderId });

      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!json?.success) {
        logger.warn('Failed to fetch order details', { orderId });
        return null;
      }

      return json.order;
    } catch (error) {
      logger.error('Error fetching order details', error);
      return null;
    }
  }

  /**
   * Accept an order
   */
  static async acceptOrder(token: string, orderId: string): Promise<boolean> {
    try {
      logger.info('Accepting order', { orderId });

      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        logger.error('Failed to accept order', { status: res.status });
        return false;
      }

      logger.info('Order accepted successfully', { orderId });
      return true;
    } catch (error) {
      logger.error('Error accepting order', error);
      return false;
    }
  }

  /**
   * Reject an order
   */
  static async rejectOrder(token: string, orderId: string): Promise<boolean> {
    try {
      logger.info('Rejecting order', { orderId });

      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        logger.error('Failed to reject order', { status: res.status });
        return false;
      }

      logger.info('Order rejected successfully', { orderId });
      return true;
    } catch (error) {
      logger.error('Error rejecting order', error);
      return false;
    }
  }

  /**
   * Verify QR code for order
   */
  static async verifyQR(
    token: string,
    orderId: string,
    qrToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.debug('Verifying QR code', { orderId });

      const res = await fetch(`${API_BASE}/store-owner/orders/${orderId}/verify-qr`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: qrToken }),
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      if (!res.ok || !json?.success) {
        logger.warn('QR verification failed', { error: json?.error_code });
        return { success: false, error: json?.error_code || 'VERIFICATION_FAILED' };
      }

      logger.info('QR verified successfully', { orderId });
      return { success: true };
    } catch (error: any) {
      logger.error('Error verifying QR', error);
      return { success: false, error: error.message };
    }
  }
}
