/**
 * Store Service - Centralized API calls for stores
 * Separates API logic from UI components
 */

import { config } from '../lib/config';
import { createLogger } from '../utils/logger';

const API_BASE = config.API_BASE;
const logger = createLogger('StoreService');

export interface Store {
  id: string;
  name: string;
  is_active: boolean;
  address?: string;
  phone?: string;
  [key: string]: any;
}

export class StoreService {
  /**
   * Fetch all stores for the authenticated user
   */
  static async fetchStores(token: string, userId?: string): Promise<Store[]> {
    try {
      logger.debug('Fetching stores', { userId });

      const url = userId 
        ? `${API_BASE}/store-owner/stores?userId=${userId}`
        : `${API_BASE}/store-owner/stores`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      
      if (!res.ok) {
        logger.error('Failed to fetch stores', { status: res.status });
        return [];
      }

      const json = raw ? JSON.parse(raw) : null;
      const stores = json?.stores || [];

      logger.info(`Fetched ${stores.length} stores`);
      return stores;
    } catch (error) {
      logger.error('Error fetching stores', error);
      return [];
    }
  }

  /**
   * Update store online/offline status
   */
  static async updateStoreStatus(
    token: string,
    storeId: string,
    isActive: boolean
  ): Promise<boolean> {
    try {
      logger.info('Updating store status', { storeId, isActive });

      const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/online`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: isActive }),
      });

      if (!res.ok) {
        logger.error('Failed to update store status', { status: res.status });
        return false;
      }

      logger.info('Store status updated successfully', { storeId, isActive });
      return true;
    } catch (error) {
      logger.error('Error updating store status', error);
      return false;
    }
  }

  /**
   * Fetch store products
   */
  static async fetchStoreProducts(token: string, storeId: string): Promise<any[]> {
    try {
      logger.debug('Fetching store products', { storeId });

      const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;

      const products = json?.products || [];
      logger.info(`Fetched ${products.length} products`);
      
      return products;
    } catch (error) {
      logger.error('Error fetching store products', error);
      return [];
    }
  }
}
