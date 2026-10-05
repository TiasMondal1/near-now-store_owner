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
- **Store Settings** - Edit store details and delivery configuration
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

The app requires the Near & Now Node.js/Express backend (default production URL is set in `app.config.js`).

## 📖 Documentation

- **[BUILD_COMMANDS.md](./BUILD_COMMANDS.md)** - Local and EAS build / release commands
- **[docs/design-system.md](./docs/design-system.md)** - Design system: tokens, components, screen patterns and information architecture
- **[components/ui/README.md](./components/ui/README.md)** - UI kit API reference (every component's props with usage examples)

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
- [ ] `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` set as EAS environment variables (the production build fails without them)
- [ ] `GOOGLE_SERVICES_JSON` uploaded as an EAS file secret (push notifications)
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set (crash reporting) plus `SENTRY_AUTH_TOKEN/ORG/PROJECT` for source maps
- [ ] `EXPO_PUBLIC_API_BASE_URL` points at the HTTPS production API
- [ ] Verify one real push notification renders the small icon correctly on a device
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
```

### Incoming-order popup (ring + Accept / Reject)

A new `pending_acceptance` allocation opens a full-screen popup over whatever
screen is up, loops `assets/sounds/order_chime.wav` + vibration for 45 s, and
offers Accept (with per-item ticks) / Reject (two-tap confirm) / Not now.

- Trigger: the always-mounted `IncomingOrdersProvider` poll (15 s), nudged
  instantly by a push (`lib/notifications.ts`) or a Supabase realtime row.
  The push payload carries no order data, so the popup is driven from the
  `/shopkeeper/orders?active=true` response, not the notification itself.
- Files: `components/IncomingOrderAlertHost.tsx` (queue, ringer, API calls),
  `components/IncomingOrderAlertSheet.tsx` (UI), `lib/incomingOrderAlert.ts`
  (`pickNewAlerts`, seen-set on disk, `orderRinger` via `expo-audio`).
- Each order rings once ever (seen-set in AsyncStorage); orders older than
  10 min never ring. An order that is answered elsewhere or expires while
  shown closes itself.
- App backgrounded (Android): a push of type `new_order` — only that type,
  never `order_cancelled` / `order_items_added` — is routed through a
  headless task (`lib/backgroundNotifications.ts`, registered from
  `index.ts`) to a Notifee alert (`lib/lockScreenAlert.ts`) that wakes the
  screen and loops the chime. The push carries no order id, so that alert
  has no Accept / Reject buttons: a tap opens the app on the popup. Alerts
  the app raises itself (store online, below) carry the order id and do have
  the buttons; a tapped action is applied only to that order
  (`lib/orderAlertRules.ts` `resolveLockScreenTap`) and dropped after 90 s if
  the order never loads. With the app open, only the in-app popup rings.
- Over the lock screen only the notification shows; opening the app from it
  asks for the unlock first (the app is deliberately not `showWhenLocked`).
  `plugins/withLockScreenAlerts.js` adds USE_FULL_SCREEN_INTENT and the
  foreground-service permissions; Android 14+ users are prompted once to
  allow full-screen notifications. Without the native module (Expo Go) the
  plain banner is the fallback.
- Known limit: with the app fully closed, expo-notifications runs the
  headless task only for data-only pushes, and order pushes carry a title
  and body, so a closed app gets the normal banner rather than the ring.

### "Store online" foreground service (`lib/orderListenerService.ts`)

While the store is online, a Notifee foreground service (ongoing silent
"Store online — listening for orders" notification, `specialUse` type) keeps
the process alive. The incoming-orders provider keeps a 20 s background poll
running, realtime stays connected, and a new pending order is raised by the
popup host as the Notifee lock-screen ring with order details — independent
of push delivery. Stops when the store goes offline or on logout.

### Order alert setup (`lib/alertSetup.ts`, `app/alert-setup.tsx`)

Checklist of the Android settings alerts depend on — notifications,
full-screen lock-screen alerts (Android 14+), battery
unrestricted, OEM autostart — with live status where the OS exposes it and a
deep link to the exact system page for each. Home shows a warning card until
everything passes; the screen auto-opens once per install after login.

### Developer tools (TEMPORARY — dev/preview builds only)

`lib/devTools.ts`, `app/dev-tools.tsx`; entry row at the bottom of Settings,
gated by `DEV_TOOLS_AVAILABLE` (`lib/devToolsFlag.ts`): true only in a dev
client (`__DEV__`) or a build with `EXPO_PUBLIC_ENV=preview`, so every other
release — including one built from a local `.env` that says `development` —
has no entry point, and demo payloads in notifications are ignored. Hide with
the toggle on the screen; re-show by tapping the Version row in Settings 7
times.

- **Simulate incoming order** — after 10 s raises a fake DEMO allocation into
  the popup and posts the real OS alert (Notifee lock-screen ring when the
  build has it, else a scheduled banner). Accept/Reject on DEMO orders are
  handled locally and never call the backend.
- **Demo login** — "Save this login" stores the current real session token
  (SecureStore); the landing screen then shows "Use saved demo session" so
  re-login skips the Twilio OTP for up to 30 days.


### Release builds (local)

`android/` is generated, not committed. `node scripts/build-apk-with-env.js`
(add `aab` for a Play Store bundle) runs `expo prebuild` first, so every
config plugin (Firebase, ABI splits + release signing, lock-screen alerts)
is applied, then Gradle. Releases are production builds whatever the `.env`
says; pass `--env=preview` for a tester build with developer tools. Prebuild
runs without `--clean`, so `android/keystore.properties` and a keystore kept
in `android/` survive — keep a backup of both outside `android/` anyway.

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
---

**Version**: 1.0.0
