/**
 * Order management service
 * Handles order filtering, search, export, and bulk operations
 */

import { apiClient } from './api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export enum OrderStatus {
  PENDING = 'pending_store',
  ACCEPTED = 'accepted',
  READY = 'ready_for_pickup',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

export interface OrderFilters {
  status?: OrderStatus[];
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface Order {
  id: string;
  order_code: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  order_items: OrderItem[];
  payment_status?: string;
  notes?: string;
}

export interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  price: number;
  image_url?: string;
}

export interface OrderStats {
  total: number;
  pending: number;
  accepted: number;
  completed: number;
  cancelled: number;
  totalRevenue: number;
}

class OrderService {
  private static instance: OrderService;
  private ordersCache: Order[] = [];
  private lastFetchTime: number = 0;
  private cacheTimeout: number = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): OrderService {
    if (!OrderService.instance) {
      OrderService.instance = new OrderService();
    }
    return OrderService.instance;
  }

  /**
   * Fetch orders for a store
   */
  async fetchOrders(storeId: string, token: string, forceRefresh = false): Promise<Order[]> {
    const now = Date.now();
    
    // Return cached data if fresh
    if (!forceRefresh && this.ordersCache.length > 0 && now - this.lastFetchTime < this.cacheTimeout) {
      return this.ordersCache;
    }

    const response = await apiClient.get(
      `/store-owner/stores/${storeId}/orders`,
      { Authorization: `Bearer ${token}` }
    );

    if (response.success && response.data?.orders) {
      this.ordersCache = response.data.orders;
      this.lastFetchTime = now;
      return this.ordersCache;
    }

    return [];
  }

  /**
   * Filter orders based on criteria
   */
  filterOrders(orders: Order[], filters: OrderFilters): Order[] {
    let filtered = [...orders];

    // Filter by status
    if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter((order) => filters.status!.includes(order.status as OrderStatus));
    }

    // Filter by date range
    if (filters.startDate) {
      filtered = filtered.filter(
        (order) => new Date(order.created_at) >= filters.startDate!
      );
    }
    if (filters.endDate) {
      filtered = filtered.filter(
        (order) => new Date(order.created_at) <= filters.endDate!
      );
    }

    // Filter by amount range
    if (filters.minAmount !== undefined) {
      filtered = filtered.filter((order) => order.total_amount >= filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      filtered = filtered.filter((order) => order.total_amount <= filters.maxAmount!);
    }

    // Search in order code, customer name, items
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((order) => {
        const matchesCode = order.order_code.toLowerCase().includes(query);
        const matchesCustomer = order.customer_name?.toLowerCase().includes(query);
        const matchesItems = order.order_items.some((item) =>
          item.product_name.toLowerCase().includes(query)
        );
        return matchesCode || matchesCustomer || matchesItems;
      });
    }

    return filtered;
  }

  /**
   * Get order statistics
   */
  getOrderStats(orders: Order[]): OrderStats {
    const stats: OrderStats = {
      total: orders.length,
      pending: 0,
      accepted: 0,
      completed: 0,
      cancelled: 0,
      totalRevenue: 0,
    };

    orders.forEach((order) => {
      switch (order.status) {
        case OrderStatus.PENDING:
          stats.pending++;
          break;
        case OrderStatus.ACCEPTED:
        case OrderStatus.READY:
          stats.accepted++;
          break;
        case OrderStatus.COMPLETED:
          stats.completed++;
          stats.totalRevenue += order.total_amount;
          break;
        case OrderStatus.CANCELLED:
        case OrderStatus.REJECTED:
          stats.cancelled++;
          break;
      }
    });

    return stats;
  }

  /**
   * Accept order
   */
  async acceptOrder(orderId: string, token: string): Promise<boolean> {
    const response = await apiClient.post(
      `/store-owner/orders/${orderId}/accept`,
      {},
      { Authorization: `Bearer ${token}` }
    );
    
    if (response.success) {
      this.invalidateCache();
    }
    
    return response.success;
  }

  /**
   * Reject order
   */
  async rejectOrder(orderId: string, token: string, reason?: string): Promise<boolean> {
    const response = await apiClient.post(
      `/store-owner/orders/${orderId}/reject`,
      { reason },
      { Authorization: `Bearer ${token}` }
    );
    
    if (response.success) {
      this.invalidateCache();
    }
    
    return response.success;
  }

  /**
   * Bulk accept orders
   */
  async bulkAcceptOrders(orderIds: string[], token: string): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const orderId of orderIds) {
      const result = await this.acceptOrder(orderId, token);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Bulk reject orders
   */
  async bulkRejectOrders(orderIds: string[], token: string, reason?: string): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const orderId of orderIds) {
      const result = await this.rejectOrder(orderId, token, reason);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Export orders to CSV format
   */
  exportToCSV(orders: Order[]): string {
    const headers = [
      'Order Code',
      'Status',
      'Date',
      'Customer',
      'Items',
      'Total Amount',
      'Payment Status',
    ];

    const rows = orders.map((order) => [
      order.order_code,
      order.status,
      new Date(order.created_at).toLocaleString(),
      order.customer_name || 'N/A',
      order.order_items.map((item) => `${item.product_name} (${item.quantity})`).join('; '),
      `₹${order.total_amount}`,
      order.payment_status || 'N/A',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string, token: string): Promise<Order | null> {
    const response = await apiClient.get(
      `/store-owner/orders/${orderId}`,
      { Authorization: `Bearer ${token}` }
    );

    if (response.success && response.data?.order) {
      return response.data.order;
    }

    return null;
  }

  /**
   * Add note to order
   */
  async addOrderNote(orderId: string, note: string, token: string): Promise<boolean> {
    const response = await apiClient.post(
      `/store-owner/orders/${orderId}/notes`,
      { note },
      { Authorization: `Bearer ${token}` }
    );

    return response.success;
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.ordersCache = [];
    this.lastFetchTime = 0;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.invalidateCache();
  }
}

export const orderService = OrderService.getInstance();
export default orderService;
