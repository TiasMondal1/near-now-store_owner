/**
 * Custom hook for product/inventory management
 * Handles fetching, updating quantities, and caching
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../lib/config';
import { getMergedInventoryFromDb } from '../lib/storeProducts';

const API_BASE = config.API_BASE;
const INVENTORY_CACHE_KEY = 'inventory_products_cache';
const INVENTORY_PERSISTED_KEY = 'inventory_persisted_state';

export interface Product {
  id: string;
  name: string;
  price: number;
  storeProductId?: string | null;
  image_url?: string;
  brand?: string;
  category?: string;
  is_active?: boolean;
  [key: string]: any;
}

export function useProducts(token: string | null, storeId: string | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  // Fetch store products
  const fetchProducts = useCallback(async (forceRefresh = false) => {
    if (!token || !storeId) return;

    try {
      setLoading(true);

      // Try cache first
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem(INVENTORY_CACHE_KEY);
        if (cached) {
          const cachedProducts = JSON.parse(cached);
          if (cachedProducts.length > 0) {
            setProducts(cachedProducts);
            setLoading(false);
            // Fetch in background
            fetchProductsFromAPI(token, storeId);
            return;
          }
        }
      }

      await fetchProductsFromAPI(token, storeId);
    } catch (err) {
      console.error('[useProducts] Error fetching products:', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  const fetchProductsFromAPI = useCallback(async (authToken: string, storeIdVal: string) => {
    try {
      const fromDb = await getMergedInventoryFromDb(storeIdVal);
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        setProducts(fromDb);
        await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(fromDb));
        return;
      }

      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeIdVal}/products`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      const productList = json?.products || [];

      setProducts(productList);
      await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(productList));
    } catch { /* non-fatal */ }
  }, []);


  // Invalidate cache
  const invalidateCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
    } catch (err) {
      console.warn('[useProducts] Failed to invalidate cache:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (token && storeId) {
      fetchProducts();
    }
  }, [token, storeId, fetchProducts]);

  return {
    products,
    loading,
    updatingProductId,
    fetchProducts,
    invalidateCache,
    setProducts,
  };
}
