/**
 * Store management service
 * Handles store settings, business hours, delivery configuration
 */

import { apiClient } from './api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  business_hours?: BusinessHours;
  delivery_fee?: number;
  min_order_amount?: number;
}

export interface BusinessHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string; // Format: "HH:MM"
  close: string; // Format: "HH:MM"
  closed: boolean;
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
  business_hours?: BusinessHours;
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: { open: '09:00', close: '21:00', closed: false },
  tuesday: { open: '09:00', close: '21:00', closed: false },
  wednesday: { open: '09:00', close: '21:00', closed: false },
  thursday: { open: '09:00', close: '21:00', closed: false },
  friday: { open: '09:00', close: '21:00', closed: false },
  saturday: { open: '09:00', close: '21:00', closed: false },
  sunday: { open: '10:00', close: '20:00', closed: false },
};

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
   * Get store details
   */
  async getStore(storeId: string, token: string): Promise<Store | null> {
    const response = await apiClient.get(
      `/store-owner/stores/${storeId}`,
      { Authorization: `Bearer ${token}` }
    );

    if (response.success && response.data?.store) {
      this.storeCache = response.data.store;
      return response.data.store;
    }

    return null;
  }

  /**
   * Update store settings
   */
  async updateStore(
    storeId: string,
    settings: Partial<StoreSettings>,
    token: string
  ): Promise<boolean> {
    const response = await apiClient.patch(
      `/store-owner/stores/${storeId}`,
      settings,
      { Authorization: `Bearer ${token}` }
    );

    if (response.success) {
      this.invalidateCache();
      return true;
    }

    return false;
  }

  /**
   * Update business hours
   */
  async updateBusinessHours(
    storeId: string,
    businessHours: BusinessHours,
    token: string
  ): Promise<boolean> {
    return this.updateStore(storeId, { business_hours: businessHours }, token);
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
   * Check if store is open now
   */
  isStoreOpenNow(businessHours?: BusinessHours): boolean {
    if (!businessHours) return true;

    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHours = businessHours[dayName as keyof BusinessHours];

    if (!dayHours || dayHours.closed) return false;

    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= dayHours.open && currentTime <= dayHours.close;
  }

  /**
   * Get next opening time
   */
  getNextOpeningTime(businessHours?: BusinessHours): string | null {
    if (!businessHours) return null;

    const now = new Date();
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + i);
      
      const dayName = daysOfWeek[checkDate.getDay()];
      const dayHours = businessHours[dayName as keyof BusinessHours];

      if (dayHours && !dayHours.closed) {
        if (i === 0) {
          const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          if (currentTime < dayHours.open) {
            return `Today at ${dayHours.open}`;
          }
        } else {
          const dayLabel = i === 1 ? 'Tomorrow' : checkDate.toLocaleDateString('en-US', { weekday: 'long' });
          return `${dayLabel} at ${dayHours.open}`;
        }
      }
    }

    return null;
  }

  /**
   * Get default business hours
   */
  getDefaultBusinessHours(): BusinessHours {
    return { ...DEFAULT_BUSINESS_HOURS };
  }

  /**
   * Validate business hours
   */
  validateBusinessHours(businessHours: BusinessHours): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    Object.entries(businessHours).forEach(([day, hours]) => {
      if (!hours) return;

      if (!hours.closed) {
        if (!hours.open || !hours.close) {
          errors.push(`${day}: Opening and closing times are required`);
        } else if (hours.open >= hours.close) {
          errors.push(`${day}: Opening time must be before closing time`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Upload store image
   */
  async uploadStoreImage(
    storeId: string,
    imageUri: string,
    token: string
  ): Promise<string | null> {
    try {
      // Create form data
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'store-image.jpg',
      } as any);

      const response = await fetch(`${apiClient['baseUrl']}/store-owner/stores/${storeId}/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.image_url) {
        this.invalidateCache();
        return data.image_url;
      }

      return null;
    } catch (error) {
      console.error('Failed to upload store image:', error);
      return null;
    }
  }

  /**
   * Toggle store online/offline status
   */
  async toggleStoreStatus(
    storeId: string,
    isActive: boolean,
    token: string
  ): Promise<boolean> {
    const response = await apiClient.patch(
      `/store-owner/stores/${storeId}/online`,
      { is_active: isActive },
      { Authorization: `Bearer ${token}` }
    );

    if (response.success) {
      this.invalidateCache();
      return true;
    }

    return false;
  }

  /**
   * Get cached store
   */
  getCachedStore(): Store | null {
    return this.storeCache;
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.storeCache = null;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.invalidateCache();
  }
}

export const storeService = StoreService.getInstance();
export default storeService;
