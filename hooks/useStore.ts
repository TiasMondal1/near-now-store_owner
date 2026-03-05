/**
 * Custom hook for store management
 * Handles store fetching, selection, and online/offline status
 */

import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { config } from '../lib/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = config.API_BASE;
const SELECTED_STORE_KEY = 'selected_store_id';

export interface Store {
  id: string;
  name: string;
  is_active: boolean;
  address?: string;
  phone?: string;
  [key: string]: any;
}

export function useStore(token: string | null) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch stores from API
  const fetchStores = useCallback(async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      
      const raw = await res.text();
      
      if (!res.ok) {
        throw new Error(`Failed to fetch stores: ${res.status}`);
      }

      const json = raw ? JSON.parse(raw) : null;
      const storeList = json?.stores || [];
      
      setStores(storeList);
      
      // Auto-select first store or restore from cache
      if (storeList.length > 0) {
        const cachedId = await AsyncStorage.getItem(SELECTED_STORE_KEY);
        const storeToSelect = cachedId 
          ? storeList.find((s: Store) => s.id === cachedId) || storeList[0]
          : storeList[0];
        
        setSelectedStore(storeToSelect);
        await AsyncStorage.setItem(SELECTED_STORE_KEY, storeToSelect.id);
      }
      
      setError(null);
      return storeList;
    } catch (err: any) {
      console.error('[useStore] Error fetching stores:', err);
      setError(err.message || 'Failed to fetch stores');
      setStores([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle store online/offline status
  const toggleStoreStatus = useCallback(async (
    store: Store,
    isActive: boolean,
    onSuccess?: () => void
  ) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/store-owner/stores/${store.id}/online`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: isActive }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update store status: ${response.status}`);
      }

      // Refresh stores
      await fetchStores(token);
      
      if (onSuccess) onSuccess();
      
      return true;
    } catch (err: any) {
      console.error('[useStore] Error toggling status:', err);
      Alert.alert('Error', 'Failed to update store status. Please try again.');
      return false;
    }
  }, [token, fetchStores]);

  // Select a different store
  const selectStore = useCallback(async (store: Store) => {
    setSelectedStore(store);
    await AsyncStorage.setItem(SELECTED_STORE_KEY, store.id);
  }, []);

  // Initial fetch
  useEffect(() => {
    if (token) {
      fetchStores(token);
    }
  }, [token, fetchStores]);

  return {
    stores,
    selectedStore,
    loading,
    error,
    fetchStores,
    toggleStoreStatus,
    selectStore,
  };
}
