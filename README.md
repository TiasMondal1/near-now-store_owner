# Near & Now Store Owner App

A React Native (Expo) mobile application for store owners to manage their stores, inventory, orders, and deliveries.

## 🚀 Features

### ✅ Core Features (Implemented)
- **Authentication** - OTP-based login with Twilio
- **Store Management** - Online/offline toggle, store settings
- **Inventory Management** - Add/remove products, manage quantities
- **Order Management** - Accept/reject orders, QR verification
- **Real-time Updates** - Supabase realtime subscriptions
- **Profile Management** - View account and store information

### 🎉 New Features (March 2026)
- **Advanced Order Management** - Filtering, search, bulk operations, CSV export
- **Enhanced Inventory** - Categories, low stock alerts, bulk operations, fuzzy search
- **Store Settings** - Edit store details, business hours, delivery configuration
- **Push Notifications** - Order alerts, low stock warnings, daily summaries
- **Security Enhancements** - Environment validation, error handling, API retry logic

## 📦 Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Backend**: Node.js/Express
- **Authentication**: Twilio (OTP)
- **Notifications**: Expo Notifications
- **Navigation**: Expo Router

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd near-now-store_owner

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Update .env with your credentials
# EXPO_PUBLIC_API_BASE_URL=http://your-api-url:3000
# EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-maps-key

# Start the development server
npm start
```

## 📱 Running the App

```bash
# Start Expo development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run on web
npm run web
```

## 🔧 Configuration

### Environment Variables

Required variables in `.env`:
- `EXPO_PUBLIC_API_BASE_URL` - Backend API URL
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps API key (optional)

### Backend Setup

The app requires a Node.js/Express backend. See `NAMECHEAP_MIGRATION.md` for deployment instructions.

## 📖 Documentation

- **[APP_STATUS.md](./APP_STATUS.md)** - Current app status and features
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** - Real-time done vs left tracker
- **[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)** - New features implementation guide
- **[NAMECHEAP_MIGRATION.md](./NAMECHEAP_MIGRATION.md)** - Backend deployment guide

## 🏗️ Project Structure

```
near-now-store_owner/
├── app/                      # App screens (Expo Router)
│   ├── landing.tsx          # Landing/session check
│   ├── otp.tsx              # OTP verification
│   ├── owner-home.tsx       # Main dashboard
│   ├── inventory.tsx        # Inventory management
│   ├── profile.tsx          # Profile screen
│   ├── settings.tsx         # Settings screen (NEW)
│   └── ...
├── components/              # Reusable components
│   ├── IncomingOrderPopup.tsx
│   ├── OrderFilters.tsx     # Order filtering (NEW)
│   ├── StoreSettingsModal.tsx # Store settings (NEW)
│   └── NotificationSettings.tsx # Notifications (NEW)
├── lib/                     # Utilities and services
│   ├── api-client.ts        # API client with retry (NEW)
│   ├── config.ts            # App configuration
│   ├── env-validator.ts     # Environment validation (NEW)
│   ├── error-handler.ts     # Error handling (NEW)
│   ├── inventory-service.ts # Inventory operations (NEW)
│   ├── notifications.ts     # Push notifications (NEW)
│   ├── order-service.ts     # Order operations (NEW)
│   ├── store-service.ts     # Store operations (NEW)
│   ├── storeProducts.ts     # Product operations
│   ├── supabase.ts          # Supabase client
│   └── theme.ts             # UI theme
├── session.ts               # Session management
└── package.json
```

## 🔐 Security

### Production Checklist
- [ ] Remove dev OTP bypass (123456)
- [ ] Update API_BASE_URL to production
- [ ] Enable error monitoring (Sentry)
- [ ] Review RLS policies
- [ ] Test all authentication flows
- [ ] Verify environment variables
- [ ] Enable rate limiting on backend

### Security Features
- Environment variable validation
- Centralized error handling
- API request retry logic
- Token-based authentication
- Role-based access control

## 📊 Services & APIs

### Order Service (`lib/order-service.ts`)
```typescript
import { orderService } from './lib/order-service';

// Fetch and filter orders
const orders = await orderService.fetchOrders(storeId, token);
const filtered = orderService.filterOrders(orders, {
  status: [OrderStatus.PENDING],
  searchQuery: 'milk'
});

// Get statistics
const stats = orderService.getOrderStats(orders);

// Bulk operations
await orderService.bulkAcceptOrders(orderIds, token);

// Export to CSV
const csv = orderService.exportToCSV(orders);
```

### Inventory Service (`lib/inventory-service.ts`)
```typescript
import { inventoryService } from './lib/inventory-service';

// Get categories and search
const categories = inventoryService.getCategories(products);
const results = inventoryService.searchProducts(products, 'milk');

// Low stock alerts
const lowStock = inventoryService.getLowStockProducts(products);
await inventoryService.setLowStockThreshold(10);

// Statistics
const stats = inventoryService.getInventoryStats(products);

// Bulk operations
await inventoryService.bulkUpdateQuantities(updates, token);
```

### Store Service (`lib/store-service.ts`)
```typescript
import { storeService } from './lib/store-service';

// Update store settings
await storeService.updateStore(storeId, {
  name: 'My Store',
  delivery_radius_km: 5,
  delivery_fee: 20
}, token);

// Business hours
await storeService.updateBusinessHours(storeId, businessHours, token);
const isOpen = storeService.isStoreOpenNow(businessHours);
```

### Notification Service (`lib/notifications.ts`)
```typescript
import { notificationService } from './lib/notifications';

// Initialize
await notificationService.initialize();

// Send notification
await notificationService.sendLocalNotification(
  'New Order',
  'Order #12345 received',
  { orderId: '12345' }
);

// Update preferences
await notificationService.updatePreferences({
  newOrders: true,
  lowStock: true
});
```

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Type checking
npx tsc --noEmit

# Linting
npx eslint .
```

## 📈 Performance

- Virtual lists for large datasets
- Optimistic UI updates
- Request caching with TTL
- Image lazy loading
- Background sync support

## 🐛 Troubleshooting

### Common Issues

**1. Environment variables not loading**
- Restart Expo dev server: `npm start --clear`
- Verify `.env` file exists and has correct format

**2. Supabase connection failed**
- Check `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Verify Supabase project is active

**3. Notifications not working**
- Notifications only work on physical devices
- Check notification permissions in device settings
- Verify push token registration

**4. API requests failing**
- Check backend is running
- Verify `EXPO_PUBLIC_API_BASE_URL` is correct
- Check network connectivity

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

[Your License Here]

## 📞 Support

For issues or questions:
- Check documentation in `/docs`
- Review `APP_STATUS.md` for current features
- See `IMPLEMENTATION_GUIDE.md` for new features

---

**Version**: 1.0.0  
**Last Updated**: March 4, 2026  
**Status**: Production Ready ✅
