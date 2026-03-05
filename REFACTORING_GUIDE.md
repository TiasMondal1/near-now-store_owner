# Code Refactoring Guide

This document outlines the major refactoring improvements made to the codebase for better maintainability, scalability, and code quality.

## ✅ Completed Improvements

### 1. Custom Hooks for Data Fetching

Created reusable hooks to separate data fetching logic from UI components:

#### **`hooks/useStore.ts`**
- Manages store fetching, selection, and online/offline status
- Handles store caching with AsyncStorage
- Provides `toggleStoreStatus()` for easy status updates
- Auto-selects first store or restores from cache

**Usage:**
```typescript
import { useStore } from '../hooks/useStore';

function MyComponent() {
  const { stores, selectedStore, loading, toggleStoreStatus } = useStore(token);
  
  // Toggle store online/offline
  await toggleStoreStatus(selectedStore, true);
}
```

#### **`hooks/useOrders.ts`**
- Manages order fetching, accepting, rejecting
- Handles incoming order popups with countdown timer
- Provides QR verification functionality
- Auto-polls orders every 10 seconds

**Usage:**
```typescript
import { useOrders } from '../hooks/useOrders';

function OrdersScreen() {
  const { orders, incomingOrder, acceptOrder, rejectOrder } = useOrders(token, storeId);
  
  // Accept incoming order
  await acceptOrder();
}
```

#### **`hooks/useProducts.ts`**
- Manages product/inventory fetching and caching
- Handles quantity updates with optimistic UI
- Provides cache invalidation
- Integrates with Supabase and API fallback

**Usage:**
```typescript
import { useProducts } from '../hooks/useProducts';

function InventoryScreen() {
  const { products, loading, updateQuantity } = useProducts(token, storeId);
  
  // Update product quantity
  await updateQuantity(product, newQty);
}
```

---

### 2. Service Layer for API Calls

Centralized API logic in service classes to separate concerns:

#### **`services/orderService.ts`**
- `OrderService.fetchOrders()` - Fetch all orders
- `OrderService.fetchOrderDetails()` - Get order details
- `OrderService.acceptOrder()` - Accept an order
- `OrderService.rejectOrder()` - Reject an order
- `OrderService.verifyQR()` - Verify QR code

#### **`services/storeService.ts`**
- `StoreService.fetchStores()` - Fetch user's stores
- `StoreService.updateStoreStatus()` - Update online/offline status
- `StoreService.fetchStoreProducts()` - Get store products

**Benefits:**
- Single source of truth for API calls
- Easy to test and mock
- Consistent error handling
- Reusable across components

---

### 3. Proper Logging Utility

Replaced `console.log` with structured logging:

#### **`utils/logger.ts`**
- Context-based logging (e.g., `[OrderService]`, `[useStore]`)
- Log levels: debug, info, warn, error
- Automatic timestamp formatting
- Only logs in development mode
- Performance timing utilities

**Usage:**
```typescript
import { createLogger } from '../utils/logger';

const logger = createLogger('MyComponent');

logger.debug('Fetching data', { userId: '123' });
logger.info('Data fetched successfully');
logger.warn('Cache miss, fetching from API');
logger.error('Failed to fetch data', error);

// Performance timing
logger.time('fetchOrders');
await fetchOrders();
logger.timeEnd('fetchOrders');
```

**Benefits:**
- Easy to filter logs by context
- Structured data logging
- Can be disabled in production
- Better debugging experience

---

### 4. Global State Management with Context API

#### **`context/AppContext.tsx`**
- Provides global session state
- Auto-refreshes session on mount
- Accessible throughout the app
- Type-safe with TypeScript

**Usage:**
```typescript
import { useAppContext } from '../context/AppContext';

function MyComponent() {
  const { session, loading, refreshSession } = useAppContext();
  
  if (loading) return <Loading />;
  if (!session) return <Login />;
  
  return <Dashboard />;
}
```

**Wrap your app:**
```typescript
import { AppProvider } from './context/AppContext';

export default function App() {
  return (
    <AppProvider>
      <YourApp />
    </AppProvider>
  );
}
```

---

### 5. TypeScript Strict Mode

Updated `tsconfig.json` with stricter settings:
- ✅ `strict: true` - Enable all strict type checks
- ✅ `noUnusedLocals: true` - Error on unused variables
- ✅ `noUnusedParameters: true` - Error on unused function params
- ✅ `noImplicitReturns: true` - Ensure all code paths return
- ✅ `noFallthroughCasesInSwitch: true` - Prevent switch fallthrough bugs
- ✅ `forceConsistentCasingInFileNames: true` - Consistent file naming

**Benefits:**
- Catches more bugs at compile time
- Better IDE autocomplete
- Safer refactoring
- Cleaner code

---

### 6. Dependency Cleanup

Removed deprecated/unused dependencies:
- ❌ `react-native-camera` - Deprecated, using `expo-camera` instead

**Next Steps:**
Run `npm install` to update dependencies.

---

## 🔄 Migration Guide

### Migrating `owner-home.tsx` to Use Hooks

**Before (1757 lines):**
```typescript
export default function OwnerHomeScreen() {
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  
  const fetchStores = async () => { /* 50 lines */ };
  const fetchOrders = async () => { /* 40 lines */ };
  const fetchProducts = async () => { /* 60 lines */ };
  
  // ... 1500+ more lines
}
```

**After (much cleaner):**
```typescript
import { useStore } from '../hooks/useStore';
import { useOrders } from '../hooks/useOrders';
import { useProducts } from '../hooks/useProducts';

export default function OwnerHomeScreen() {
  const { session } = useAppContext();
  const { stores, selectedStore, toggleStoreStatus } = useStore(session?.token);
  const { orders, incomingOrder, acceptOrder, rejectOrder } = useOrders(
    session?.token, 
    selectedStore?.id
  );
  const { products, updateQuantity } = useProducts(session?.token, selectedStore?.id);
  
  // Now just UI logic - much cleaner!
}
```

---

## 📁 New File Structure

```
near-now-store_owner/
├── hooks/
│   ├── useStore.ts          ✅ Store management hook
│   ├── useOrders.ts         ✅ Order management hook
│   └── useProducts.ts       ✅ Product/inventory hook
├── services/
│   ├── orderService.ts      ✅ Order API calls
│   └── storeService.ts      ✅ Store API calls
├── context/
│   └── AppContext.tsx       ✅ Global state management
├── utils/
│   └── logger.ts            ✅ Structured logging
├── app/
│   ├── owner-home.tsx       🔄 To be refactored
│   └── inventory.tsx        🔄 To be refactored
└── tsconfig.json            ✅ Strict mode enabled
```

---

## 🎯 Next Steps (Recommended)

### 1. Refactor `owner-home.tsx`
- Replace inline data fetching with hooks
- Move business logic to services
- Replace console.log with logger
- Extract components (OrderCard, ProductCard, etc.)
- Target: Reduce from 1757 lines to ~500 lines

### 2. Refactor `inventory.tsx`
- Use `useProducts` hook
- Remove duplicate code
- Use logger instead of console.log
- Target: Reduce from 779 lines to ~300 lines

### 3. Create Shared Components
- `components/OrderCard.tsx`
- `components/ProductCard.tsx`
- `components/StoreHeader.tsx`
- `components/IncomingOrderPopup.tsx`

### 4. Remove Unused Files
- ❌ `app/App.tsx` - Legacy entry point
- ❌ `app/owner-orders.tsx` - Integrated into home
- ❌ `app/registration-success.tsx` - Rarely used
- ❌ `app/add.product.tsx` - Alternative flow (review first)

### 5. Add Unit Tests
- Test hooks in isolation
- Test services with mocked fetch
- Test business logic separately from UI

---

## 📊 Impact Metrics

### Code Quality Improvements
- **Separation of Concerns:** ✅ Business logic separated from UI
- **Reusability:** ✅ Hooks can be used across components
- **Testability:** ✅ Services and hooks are easy to test
- **Type Safety:** ✅ Strict TypeScript enabled
- **Maintainability:** ✅ Smaller, focused files

### Expected Line Reduction
- `owner-home.tsx`: 1757 → ~500 lines (71% reduction)
- `inventory.tsx`: 779 → ~300 lines (61% reduction)
- **Total:** ~1700 lines of duplicate/business logic extracted

### Developer Experience
- ✅ Faster debugging with structured logging
- ✅ Better autocomplete with strict TypeScript
- ✅ Easier onboarding with clear separation
- ✅ Less merge conflicts with smaller files

---

## 🚀 Usage Examples

### Example 1: Using Multiple Hooks Together
```typescript
function DashboardScreen() {
  const { session } = useAppContext();
  const { selectedStore, toggleStoreStatus } = useStore(session?.token);
  const { orders, acceptOrder } = useOrders(session?.token, selectedStore?.id);
  const { products, updateQuantity } = useProducts(session?.token, selectedStore?.id);

  const handleGoOffline = async () => {
    await toggleStoreStatus(selectedStore, false);
  };

  return (
    <View>
      <StoreHeader store={selectedStore} onToggle={handleGoOffline} />
      <OrderList orders={orders} onAccept={acceptOrder} />
      <ProductList products={products} onUpdate={updateQuantity} />
    </View>
  );
}
```

### Example 2: Using Services Directly
```typescript
import { OrderService } from '../services/orderService';
import { createLogger } from '../utils/logger';

const logger = createLogger('CustomComponent');

async function handleCustomOrderFlow(token: string, orderId: string) {
  logger.info('Starting custom order flow', { orderId });
  
  const details = await OrderService.fetchOrderDetails(token, orderId);
  if (!details) {
    logger.error('Failed to fetch order details');
    return;
  }
  
  const success = await OrderService.acceptOrder(token, orderId);
  logger.info('Order accepted', { success });
}
```

---

## 📝 Best Practices

1. **Always use hooks for data fetching** - Don't fetch data directly in components
2. **Use services for API calls** - Keep API logic centralized
3. **Use logger instead of console.log** - Better debugging and filtering
4. **Keep components small** - Extract reusable components
5. **Use TypeScript strictly** - Let the compiler catch bugs
6. **Test hooks and services** - They're easy to test in isolation

---

**Status:** ✅ Foundation Complete  
**Next:** Refactor existing components to use new architecture  
**Date:** March 5, 2026  
**Version:** 2.0.0
