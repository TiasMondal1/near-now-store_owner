/**
 * Inventory management service
 * Handles product operations, categories, low stock alerts, and bulk operations
 */

import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Product {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  base_price?: number;
  image_url?: string;
  storeProductId?: string;
  unit?: string;
  description?: string;
  is_active?: boolean;
}

export interface Category {
  id: string;
  name: string;
  count: number;
}

export interface InventoryStats {
  totalProducts: number;
  active: number;
  inactive: number;
}

class InventoryService {
  private static instance: InventoryService;

  private constructor() {}

  static getInstance(): InventoryService {
    if (!InventoryService.instance) {
      InventoryService.instance = new InventoryService();
    }
    return InventoryService.instance;
  }

  /**
   * Get all categories from products
   */
  getCategories(products: Product[]): Category[] {
    const categoryMap = new Map<string, number>();

    products.forEach((product) => {
      if (product.category) {
        const count = categoryMap.get(product.category) || 0;
        categoryMap.set(product.category, count + 1);
      }
    });

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Filter products by category
   */
  filterByCategory(products: Product[], category: string): Product[] {
    if (!category) return products;
    return products.filter((p) => p.category === category);
  }

  /**
   * Search products with fuzzy matching
   */
  searchProducts(products: Product[], query: string): Product[] {
    if (!query.trim()) return products;

    const searchTerm = query.toLowerCase().trim();
    
    return products.filter((product) => {
      const searchableFields = [
        product.name,
        product.brand,
        product.category,
        product.description,
      ].filter(Boolean);

      return searchableFields.some((field) =>
        field!.toLowerCase().includes(searchTerm)
      );
    });
  }

  /**
   * Get inventory statistics
   */
  getInventoryStats(products: Product[]): InventoryStats {
    const stats: InventoryStats = {
      totalProducts: products.length,
      active: 0,
      inactive: 0,
    };

    products.forEach((product) => {
      if (product.is_active !== false) {
        stats.active++;
      } else {
        stats.inactive++;
      }
    });

    return stats;
  }

  /**
   * Bulk add products to store
   */
  async bulkAddProducts(
    storeId: string,
    productIds: string[],
    _token: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const productId of productIds) {
      try {
        if (!supabase) {
          failed++;
          continue;
        }

        const { error } = await supabase
          .from('products')
          .insert({
            store_id: storeId,
            master_product_id: productId,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          failed++;
          console.error('Failed to add product:', productId, error);
        } else {
          success++;
        }
      } catch (error) {
        failed++;
        console.error('Failed to add product:', productId, error);
      }
    }

    return { success, failed };
  }

  /**
   * Delete product from store
   */
  async deleteProduct(storeProductId: string): Promise<boolean> {
    try {
      if (!supabase) return false;

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', storeProductId);

      return !error;
    } catch (error) {
      console.error('Failed to delete product:', error);
      return false;
    }
  }

  /**
   * Bulk delete products
   */
  async bulkDeleteProducts(storeProductIds: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of storeProductIds) {
      const result = await this.deleteProduct(id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Set low stock threshold
   */
  async setLowStockThreshold(threshold: number): Promise<void> {
    this.lowStockThreshold = threshold;
    await AsyncStorage.setItem(LOW_STOCK_THRESHOLD_KEY, threshold.toString());
  }

  /**
   * Get low stock threshold
   */
  getLowStockThreshold(): number {
    return this.lowStockThreshold;
  }

  /**
   * Load low stock threshold from storage
   */
  private async loadLowStockThreshold(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LOW_STOCK_THRESHOLD_KEY);
      if (stored) {
        this.lowStockThreshold = parseInt(stored, 10) || DEFAULT_LOW_STOCK_THRESHOLD;
      }
    } catch (error) {
      console.error('Failed to load low stock threshold:', error);
    }
  }

  /**
   * Export inventory to CSV
   */
  exportToCSV(products: Product[]): string {
    const headers = [
      'Product Name',
      'Brand',
      'Category',
      'Price',
      'Unit',
      'Status',
    ];

    const rows = products.map((product) => {
      const status = product.is_active !== false ? 'Active' : 'Inactive';
      return [
        product.name,
        product.brand || 'N/A',
        product.category || 'N/A',
        `₹${product.price || product.base_price || 0}`,
        product.unit || 'pcs',
        status,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Sort products
   */
  sortProducts(
    products: Product[],
    sortBy: 'name' | 'price' | 'category',
    order: 'asc' | 'desc' = 'asc'
  ): Product[] {
    const sorted = [...products].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'price':
          comparison = (a.price || a.base_price || 0) - (b.price || b.base_price || 0);
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }
}

export const inventoryService = InventoryService.getInstance();
export default inventoryService;
