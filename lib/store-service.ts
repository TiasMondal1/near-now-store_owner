/**
 * Store management service
 * Handles store settings and delivery configuration
 */

import { config } from './config';

export interface Store {
  id: string;
  name: string;
  address: string | null;
  latitude?: number;
  longitude?: number;
  delivery_radius_km: number;
  is_active: boolean;
  phone?: string;
  email?: string;
  description?: string;
  image_url?: string;
  delivery_fee?: number;
  min_order_amount?: number;
}

export interface StoreSettings {
  name: string;
  address: string;
  phone?: string;
  email?: string;
  description?: string;
  delivery_radius_km: number;
  delivery_fee?: number;
  min_order_amount?: number;
}

class StoreService {
  private static instance: StoreService;
  private storeCache: Store | null = null;

  private constructor() {}

  static getInstance(): StoreService {
    if (!StoreService.instance) {
      StoreService.instance = new StoreService();
    }
    return StoreService.instance;
  }

  /**
   * Update store settings.
   * Uses /store-owner/stores/:id (not /api/store-owner/...) — Vercel routes
   * /store-owner/* directly to the Express app without the /api prefix.
   */
  async updateStore(
    storeId: string,
    settings: Partial<StoreSettings>,
    token: string
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `${config.API_BASE}/store-owner/stores/${storeId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(settings),
        }
      );
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (res.ok && json?.success) {
        this.invalidateCache();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Update delivery radius
   */
  async updateDeliveryRadius(
    storeId: string,
    radiusKm: number,
    token: string
  ): Promise<boolean> {
    return this.updateStore(storeId, { delivery_radius_km: radiusKm }, token);
  }

  /**
   * Update delivery fee
   */
  async updateDeliveryFee(
    storeId: string,
    fee: number,
    token: string
  ): Promise<boolean> {
    return this.updateStore(storeId, { delivery_fee: fee }, token);
  }

  /**
   * Toggle store online/offline status.
   * Uses /store-owner/stores/:id/online directly (no /api prefix).
   */
  async toggleStoreStatus(
    storeId: string,
    isActive: boolean,
    token: string
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `${config.API_BASE}/store-owner/stores/${storeId}/online`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_active: isActive }),
        }
      );
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (res.ok && json?.success) {
        this.invalidateCache();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  getCachedStore(): Store | null {
    return this.storeCache;
  }

  invalidateCache(): void {
    this.storeCache = null;
  }

  clearCache(): void {
    this.invalidateCache();
  }
}

export const storeService = StoreService.getInstance();
export default storeService;
