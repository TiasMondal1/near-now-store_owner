# Backend Changes: Prevent Orders to Offline Stores

## Overview
This document outlines the backend changes needed to ensure that:
1. **No orders are sent to offline stores**
2. **Offline stores' products are hidden from customer app and website**
3. **Order routing algorithm respects store online/offline status**

---

## 1. Database Schema Requirements

### Stores Table
Ensure the `stores` table has the `is_active` column:

```sql
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_stores_is_active ON stores(is_active);
```

### Products Table
Ensure products are linked to stores and can be filtered by store status:

```sql
-- Assuming products table has store_id
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
```

---

## 2. Customer App API Changes

### 2.1 Product Listing Endpoint
**Endpoint**: `GET /api/products` or `GET /api/stores/nearby`

**Current Behavior**: Returns all products from all stores
**Required Behavior**: Only return products from stores where `is_active = true`

#### Implementation:

```javascript
// Backend: products.controller.js or similar

async function getNearbyProducts(req, res) {
  const { latitude, longitude, radius } = req.query;

  try {
    // Query only ACTIVE stores within radius
    const query = `
      SELECT 
        p.*,
        s.name as store_name,
        s.is_active as store_is_active,
        s.delivery_radius_km
      FROM products p
      INNER JOIN stores s ON p.store_id = s.id
      WHERE 
        s.is_active = true  -- ✅ CRITICAL: Only active stores
        AND p.quantity > 0  -- Only products in stock
        AND ST_DWithin(
          s.location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY p.created_at DESC
    `;

    const products = await db.query(query, [longitude, latitude, radius]);

    return res.json({
      success: true,
      products: products.rows
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
}
```

### 2.2 Store Listing Endpoint
**Endpoint**: `GET /api/stores/nearby`

**Filter**: Only return stores where `is_active = true`

```javascript
async function getNearbyStores(req, res) {
  const { latitude, longitude, radius } = req.query;

  const query = `
    SELECT 
      s.*,
      COUNT(p.id) as product_count
    FROM stores s
    LEFT JOIN products p ON p.store_id = s.id AND p.quantity > 0
    WHERE 
      s.is_active = true  -- ✅ Only online stores
      AND ST_DWithin(
        s.location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    GROUP BY s.id
    HAVING COUNT(p.id) > 0  -- Only stores with products
    ORDER BY s.created_at DESC
  `;

  const stores = await db.query(query, [longitude, latitude, radius]);

  return res.json({
    success: true,
    stores: stores.rows
  });
}
```

---

## 3. Order Creation & Routing Logic

### 3.1 Order Creation Validation
**Endpoint**: `POST /api/orders`

**Validation**: Before creating an order, verify all selected stores are online

```javascript
async function createOrder(req, res) {
  const { items, customer_id, delivery_address } = req.body;

  try {
    // Get unique store IDs from order items
    const storeIds = [...new Set(items.map(item => item.store_id))];

    // ✅ CRITICAL: Verify all stores are ACTIVE
    const storeCheck = await db.query(
      `SELECT id, is_active, name FROM stores WHERE id = ANY($1)`,
      [storeIds]
    );

    const offlineStores = storeCheck.rows.filter(s => !s.is_active);
    
    if (offlineStores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some stores are currently offline',
        offline_stores: offlineStores.map(s => s.name)
      });
    }

    // Proceed with order creation...
    const order = await createOrderInDatabase(items, customer_id, delivery_address);

    return res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create order' });
  }
}
```

### 3.2 Order Routing Algorithm
**When**: Order is created or rejected by a store

**Logic**: Only route orders to stores where `is_active = true`

```javascript
async function routeOrderToStore(orderId) {
  try {
    const order = await getOrderById(orderId);
    
    // Get eligible stores (ACTIVE + within delivery radius + has products)
    const eligibleStores = await db.query(`
      SELECT 
        s.id,
        s.name,
        s.delivery_radius_km,
        COUNT(oi.id) as matching_products
      FROM stores s
      INNER JOIN products p ON p.store_id = s.id
      INNER JOIN order_items oi ON oi.product_id = p.id AND oi.order_id = $1
      WHERE 
        s.is_active = true  -- ✅ CRITICAL: Only active stores
        AND p.quantity >= oi.quantity  -- Has enough stock
        AND ST_DWithin(
          s.location::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          s.delivery_radius_km * 1000
        )
      GROUP BY s.id
      ORDER BY matching_products DESC, s.created_at ASC
      LIMIT 1
    `, [orderId, order.delivery_longitude, order.delivery_latitude]);

    if (eligibleStores.rows.length === 0) {
      // No active stores available
      await updateOrderStatus(orderId, 'no_stores_available');
      return null;
    }

    const selectedStore = eligibleStores.rows[0];
    
    // Assign order to store
    await db.query(
      `UPDATE orders SET store_id = $1, status = 'pending_store' WHERE id = $2`,
      [selectedStore.id, orderId]
    );

    return selectedStore;
  } catch (error) {
    console.error('Order routing error:', error);
    throw error;
  }
}
```

### 3.3 Re-routing After Rejection
**When**: Store owner rejects an order

**Logic**: Find next available ACTIVE store, respecting the 60-second cooldown

```javascript
async function handleOrderRejection(orderId, storeId) {
  try {
    // Mark current assignment as rejected
    await db.query(`
      INSERT INTO order_rejections (order_id, store_id, rejected_at)
      VALUES ($1, $2, NOW())
    `, [orderId, storeId]);

    // Update order status
    await db.query(
      `UPDATE orders SET status = 'pending_reassignment' WHERE id = $1`,
      [orderId]
    );

    // Wait 60 seconds before re-routing (as per app logic)
    setTimeout(async () => {
      await routeOrderToStore(orderId);
    }, 60000);

    return { success: true };
  } catch (error) {
    console.error('Rejection handling error:', error);
    throw error;
  }
}
```

---

## 4. Store Owner API Changes

### 4.1 Toggle Store Online/Offline
**Endpoint**: `PUT /api/store-owner/stores/:storeId/toggle-status`

**Implementation**:

```javascript
async function toggleStoreStatus(req, res) {
  const { storeId } = req.params;
  const { is_active } = req.body;
  const userId = req.user.id; // From auth middleware

  try {
    // Verify ownership
    const store = await db.query(
      `SELECT * FROM stores WHERE id = $1 AND owner_id = $2`,
      [storeId, userId]
    );

    if (store.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    // Update status
    await db.query(
      `UPDATE stores SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [is_active, storeId]
    );

    // If going offline, handle pending orders
    if (!is_active) {
      await handleStoreGoingOffline(storeId);
    }

    return res.json({
      success: true,
      is_active
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update status' });
  }
}

async function handleStoreGoingOffline(storeId) {
  // Get all pending orders for this store
  const pendingOrders = await db.query(
    `SELECT id FROM orders WHERE store_id = $1 AND status = 'pending_store'`,
    [storeId]
  );

  // Re-route each order to another active store
  for (const order of pendingOrders.rows) {
    await routeOrderToStore(order.id);
  }
}
```

---

## 5. Real-time Updates

### 5.1 Supabase Realtime for Store Status
When a store goes offline, immediately hide its products from customer apps:

```javascript
// Backend: Set up Supabase trigger or use webhook

// When store.is_active changes to false:
supabase
  .channel('store-status-changes')
  .on('postgres_changes', 
    { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'stores',
      filter: 'is_active=eq.false'
    }, 
    (payload) => {
      const storeId = payload.new.id;
      
      // Broadcast to all customer apps
      broadcastStoreOffline(storeId);
      
      // Re-route pending orders
      handleStoreGoingOffline(storeId);
    }
  )
  .subscribe();
```

---

## 6. Website Changes

### 6.1 Product Display
**File**: Website product listing component

**Filter**: Only show products from active stores

```javascript
// Frontend: website/pages/products.js

async function fetchProducts() {
  const response = await fetch('/api/products?latitude=X&longitude=Y&radius=5000');
  const data = await response.json();
  
  // Backend already filters by is_active=true, but double-check
  const activeProducts = data.products.filter(p => p.store_is_active === true);
  
  setProducts(activeProducts);
}
```

---

## 7. Testing Checklist

### Backend Tests

- [ ] **Test 1**: Create order with offline store → Should fail with error
- [ ] **Test 2**: Store goes offline → Pending orders re-routed to other stores
- [ ] **Test 3**: Product listing → Only shows products from active stores
- [ ] **Test 4**: Store listing → Only shows active stores
- [ ] **Test 5**: Order routing → Never assigns to offline stores
- [ ] **Test 6**: Store rejects order → Re-routes after 60s to active store only

### Integration Tests

- [ ] **Test 7**: Customer app → Products from offline stores disappear immediately
- [ ] **Test 8**: Website → Products from offline stores not visible
- [ ] **Test 9**: Store owner toggles offline → No new orders received
- [ ] **Test 10**: All stores offline → Customer sees "No stores available" message

---

## 8. Database Migrations

### Migration Script

```sql
-- Migration: Add is_active column and indexes
-- File: migrations/YYYYMMDD_add_store_active_status.sql

BEGIN;

-- Add is_active column if not exists
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Set existing stores to active (one-time migration)
UPDATE stores SET is_active = true WHERE is_active IS NULL;

-- Add NOT NULL constraint
ALTER TABLE stores ALTER COLUMN is_active SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_stores_is_active ON stores(is_active);
CREATE INDEX IF NOT EXISTS idx_stores_active_location ON stores(is_active, location) WHERE is_active = true;

-- Create order_rejections table for tracking
CREATE TABLE IF NOT EXISTS order_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  rejected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_rejections_order_id ON order_rejections(order_id);
CREATE INDEX IF NOT EXISTS idx_order_rejections_store_id ON order_rejections(store_id);

COMMIT;
```

---

## 9. Environment Variables

Add to backend `.env`:

```bash
# Order routing settings
ORDER_REJECTION_COOLDOWN_MS=60000  # 60 seconds
MAX_ROUTING_ATTEMPTS=5  # Max times to try routing an order
```

---

## 10. Implementation Priority

### Phase 1 (Critical - Do First)
1. ✅ Add `is_active` column to stores table
2. ✅ Update product listing API to filter by `is_active = true`
3. ✅ Update store listing API to filter by `is_active = true`
4. ✅ Add validation in order creation to check store status

### Phase 2 (High Priority)
5. ✅ Update order routing algorithm to only select active stores
6. ✅ Implement store offline handler (re-route pending orders)
7. ✅ Add order rejection tracking table

### Phase 3 (Medium Priority)
8. ✅ Set up real-time updates for store status changes
9. ✅ Update website to respect store status
10. ✅ Add comprehensive tests

---

## 11. API Endpoints Summary

| Endpoint | Method | Purpose | Filter |
|----------|--------|---------|--------|
| `/api/products` | GET | List products | `is_active = true` |
| `/api/stores/nearby` | GET | List stores | `is_active = true` |
| `/api/orders` | POST | Create order | Validate stores are active |
| `/api/store-owner/stores/:id/toggle-status` | PUT | Toggle online/offline | Owner only |
| `/api/store-owner/stores/:id/orders` | GET | Get store orders | Current store only |

---

## 12. Error Messages

### Customer-Facing Errors

```javascript
const ERROR_MESSAGES = {
  STORE_OFFLINE: "This store is currently offline. Please try another store.",
  NO_STORES_AVAILABLE: "No stores are available in your area right now. Please try again later.",
  ORDER_CREATION_FAILED: "Unable to create order. Some items may no longer be available."
};
```

---

## Summary

**Key Changes Required:**

1. **Database**: Add `is_active` column and indexes
2. **Product API**: Filter by `is_active = true`
3. **Order Creation**: Validate store status before creating order
4. **Order Routing**: Only route to active stores
5. **Store Toggle**: Handle pending orders when going offline
6. **Website**: Respect store active status

**Expected Behavior:**
- ✅ Offline stores receive NO orders
- ✅ Offline stores' products are HIDDEN from customers
- ✅ Pending orders are RE-ROUTED when store goes offline
- ✅ Order routing algorithm SKIPS offline stores
- ✅ Customer sees clear messaging when no stores available

---

**Next Steps**: Implement Phase 1 changes on the backend, then test thoroughly before deploying to production.
