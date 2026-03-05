# Code Cleanup Tasks

## Files to Review/Remove

### ❌ Files to Delete (After Verification)

#### 1. **`app/App.tsx`**
- **Status:** Legacy entry point, not used with Expo Router
- **Reason:** Expo Router uses `app/_layout.tsx` as entry point
- **Action:** Safe to delete
- **Command:** `rm app/App.tsx`

#### 2. **`app/owner-orders.tsx`**
- **Status:** Functionality integrated into `owner-home.tsx`
- **Reason:** Orders are now managed in the main dashboard
- **Action:** Review for any unique features, then delete
- **Command:** `rm app/owner-orders.tsx`

#### 3. **`app/registration-success.tsx`**
- **Status:** Success confirmation screen, rarely used
- **Reason:** Can be replaced with Alert or inline message
- **Action:** Review usage, consider replacing with simpler UI
- **Command:** `rm app/registration-success.tsx` (if not needed)

#### 4. **`app/add.product.tsx`**
- **Status:** Alternative product adding flow
- **Reason:** Not in main navigation flow
- **Action:** **REVIEW FIRST** - May be used for specific features
- **Decision:** Keep if actively used, otherwise remove

---

## Dependencies to Clean Up

### ❌ Deprecated Dependencies

#### 1. **`react-native-camera`** ✅ REMOVED
- **Status:** Deprecated package
- **Replacement:** `expo-camera` (already installed)
- **Action:** ✅ Removed from package.json
- **Next:** Run `npm install` to update

### 🔍 Dependencies to Review

Run this command to check for unused dependencies:
```bash
npx depcheck
```

### Potential Unused Dependencies
Review these after running depcheck:
- `expo-media-library` - Check if actually used
- `expo-image-picker` - Verify usage in product uploads
- `@react-navigation/native` - May be redundant with expo-router
- `@react-navigation/native-stack` - May be redundant with expo-router

---

## Code Cleanup Checklist

### 🔄 Replace console.log with Logger

**Files to update:**
- [ ] `app/owner-home.tsx` - ~50+ console.log statements
- [ ] `app/inventory.tsx` - ~30+ console.log statements
- [ ] `app/otp.tsx` - ~10+ console.log statements
- [ ] `lib/storeProducts.ts` - ~15+ console.log statements
- [ ] `lib/supabase.ts` - ~5+ console.log statements

**Find all console.log:**
```bash
grep -r "console.log" app/ lib/ --exclude-dir=node_modules
```

**Replace with:**
```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('ComponentName');

// Before
console.log('Fetching data', data);

// After
logger.debug('Fetching data', data);
```

---

### 🧹 Remove Duplicate Code

#### Between `inventory.tsx` and `owner-home.tsx`

**Duplicate Logic:**
1. **Product fetching** - Both fetch and cache products
2. **Quantity updates** - Both update quantities with optimistic UI
3. **Cache management** - Both use AsyncStorage for caching

**Solution:**
- ✅ Created `hooks/useProducts.ts` to centralize logic
- [ ] Update `inventory.tsx` to use hook
- [ ] Update `owner-home.tsx` to use hook

**Example Migration:**
```typescript
// Before (in both files)
const [products, setProducts] = useState([]);
const fetchProducts = async () => { /* 60 lines */ };
const updateQuantity = async () => { /* 40 lines */ };

// After (using hook)
const { products, updateQuantity, loading } = useProducts(token, storeId);
```

---

### 📦 Extract Reusable Components

#### Components to Create

1. **`components/OrderCard.tsx`**
   - Extract from `owner-home.tsx`
   - Display order details
   - Accept/Reject buttons
   - ~50 lines

2. **`components/ProductCard.tsx`**
   - Extract from `owner-home.tsx` and `inventory.tsx`
   - Product image, name, price
   - Quantity controls (+/-)
   - ~80 lines

3. **`components/IncomingOrderPopup.tsx`**
   - Extract from `owner-home.tsx`
   - Animated popup
   - Countdown timer
   - Accept/Reject actions
   - ~150 lines

4. **`components/StoreStatusToggle.tsx`**
   - Extract from `owner-home.tsx`
   - Online/Offline switch
   - Confirmation alerts
   - ~100 lines

5. **`components/QRScanner.tsx`**
   - Extract from `owner-home.tsx`
   - QR scanning modal
   - Verification logic
   - ~120 lines

---

## Refactoring Priority

### Phase 1: Foundation ✅ COMPLETE
- [x] Create custom hooks (useStore, useOrders, useProducts)
- [x] Create service layer (OrderService, StoreService)
- [x] Create logging utility
- [x] Setup Context API
- [x] Enable TypeScript strict mode
- [x] Remove deprecated dependencies

### Phase 2: Component Refactoring 🔄 IN PROGRESS
- [ ] Extract reusable components
- [ ] Update `owner-home.tsx` to use hooks
- [ ] Update `inventory.tsx` to use hooks
- [ ] Replace console.log with logger

### Phase 3: Cleanup 📋 PENDING
- [ ] Delete unused files
- [ ] Remove duplicate code
- [ ] Clean up dependencies
- [ ] Add unit tests

### Phase 4: Documentation 📋 PENDING
- [ ] Update README with new architecture
- [ ] Add JSDoc comments to hooks
- [ ] Create component documentation
- [ ] Add migration guide for new developers

---

## Commands to Run

### 1. Install Dependencies
```bash
npm install
```

### 2. Check for Unused Dependencies
```bash
npx depcheck
```

### 3. Find All console.log
```bash
grep -r "console.log" app/ lib/ --exclude-dir=node_modules | wc -l
```

### 4. Check TypeScript Errors
```bash
npx tsc --noEmit
```

### 5. Format Code
```bash
npx prettier --write "**/*.{ts,tsx,js,jsx}"
```

---

## Metrics

### Before Refactoring
- **Total Lines:** ~4500 lines
- **Largest File:** owner-home.tsx (1757 lines)
- **console.log Count:** ~150+
- **Duplicate Code:** ~40%
- **TypeScript Strict:** ❌ No

### After Refactoring (Target)
- **Total Lines:** ~3000 lines (33% reduction)
- **Largest File:** <500 lines
- **console.log Count:** 0 (replaced with logger)
- **Duplicate Code:** <10%
- **TypeScript Strict:** ✅ Yes

---

## Testing Checklist

After refactoring, test these flows:

- [ ] Login flow works
- [ ] Store selection works
- [ ] Orders load correctly
- [ ] Accept/Reject orders works
- [ ] Product quantity updates work
- [ ] Inventory screen works
- [ ] QR scanning works
- [ ] Online/Offline toggle works
- [ ] Payments screen works
- [ ] All navigation works

---

**Status:** Phase 1 Complete, Phase 2 Ready  
**Next Action:** Start extracting components from owner-home.tsx  
**Date:** March 5, 2026
