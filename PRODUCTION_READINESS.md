# Production Readiness Checklist - Near&Now Store Owner App

**Status**: Pre-Production  
**Last Updated**: March 7, 2026  
**Version**: 1.0.0

---

## 🎯 Executive Summary

This document outlines all changes needed to make the Near&Now Store Owner app production-ready. The app is **functionally complete** but requires critical security, infrastructure, and operational improvements before launch.

**Priority Levels**:
- 🔴 **CRITICAL** - Must fix before launch (security/data loss risks)
- 🟡 **HIGH** - Should fix before launch (user experience/reliability)
- 🟢 **MEDIUM** - Fix within first month post-launch
- 🔵 **LOW** - Nice to have, can defer

---

## 🔐 1. SECURITY & AUTHENTICATION

### 🔴 CRITICAL

#### 1.1 Remove Development Bypass Code
**File**: Check all authentication flows
```typescript
// REMOVE THIS BEFORE PRODUCTION:
if (otp === "123456") { // Dev bypass
  return { success: true };
}
```
- **Action**: Remove all hardcoded OTP bypasses
- **Impact**: Major security vulnerability
- **Files to check**: `app/otp.tsx`, backend auth endpoints

#### 1.2 Environment Variables Security
**Current**: `.env` file in repo (if committed)
- **Action**: 
  - Add `.env` to `.gitignore` immediately
  - Create `.env.example` with dummy values
  - Never commit real credentials
  - Use Expo Secrets for production builds
- **Files**: Create `.gitignore` if missing

#### 1.3 API Token Security
**File**: `session.ts`, all API calls
- **Action**: 
  - Implement token refresh mechanism
  - Add token expiration handling
  - Store tokens securely (not in plain AsyncStorage)
  - Use `expo-secure-store` for sensitive data
- **Current**: Tokens stored in AsyncStorage without encryption

#### 1.4 Supabase RLS Policies
**Database**: Supabase tables
- **Action**: 
  - Review all Row Level Security policies
  - Ensure store owners can only access their own data
  - Test with different user roles
  - Enable RLS on ALL tables
- **Tables**: `stores`, `products`, `orders`, `payments`

### 🟡 HIGH

#### 1.5 API Rate Limiting
**Backend**: All endpoints
- **Action**: 
  - Implement rate limiting (e.g., 100 req/min per user)
  - Add DDoS protection
  - Use Redis for rate limit tracking
- **Library**: `express-rate-limit`

#### 1.6 Input Validation
**All forms**: OTP, signup, product creation
- **Action**: 
  - Add server-side validation for all inputs
  - Sanitize user inputs to prevent XSS
  - Validate phone numbers, emails, addresses
  - Add max length constraints
- **Library**: `joi` or `zod` for validation

#### 1.7 HTTPS Enforcement
**Backend API**: Currently HTTP in dev
- **Action**: 
  - Enforce HTTPS in production
  - Get SSL certificate (Let's Encrypt)
  - Redirect HTTP → HTTPS
  - Update `EXPO_PUBLIC_API_BASE_URL` to `https://`

---

## 🏗️ 2. INFRASTRUCTURE & DEPLOYMENT

### 🔴 CRITICAL

#### 2.1 Production API Endpoint
**File**: `lib/config.ts`
```typescript
const defaultApi = "http://localhost:3000"; // ❌ NOT FOR PRODUCTION
```
- **Action**: 
  - Deploy backend to production server
  - Update `EXPO_PUBLIC_API_BASE_URL` to production URL
  - Use environment-specific configs
- **Recommended**: Namecheap VPS, AWS, DigitalOcean, or Railway

#### 2.2 Database Backups
**Supabase**: No backup strategy
- **Action**: 
  - Enable automated daily backups
  - Test restore procedures
  - Set up point-in-time recovery
  - Document backup/restore process
- **Supabase**: Enable in project settings

#### 2.3 Build Configuration
**File**: `app.json`, `app.config.js`
- **Action**: 
  - Set unique `package` identifier (not `com.anonymous.*`)
  - Add proper app icons (all sizes)
  - Configure splash screen
  - Set version and build numbers
  - Add privacy policy URL
  - Configure app permissions properly

```json
{
  "android": {
    "package": "com.nearandnow.storeowner",
    "versionCode": 1,
    "permissions": ["CAMERA", "NOTIFICATIONS", "LOCATION"]
  },
  "ios": {
    "bundleIdentifier": "com.nearandnow.storeowner",
    "buildNumber": "1.0.0"
  }
}
```

### 🟡 HIGH

#### 2.4 EAS Build Setup
**Expo Application Services**
- **Action**: 
  - Set up EAS Build for production builds
  - Configure build profiles (dev, staging, production)
  - Set up OTA updates with EAS Update
  - Create signing certificates
- **Command**: `eas build:configure`

#### 2.5 CDN for Assets
**Images**: Currently from backend/Supabase
- **Action**: 
  - Use CDN for product images (Cloudflare, CloudFront)
  - Implement image optimization
  - Add lazy loading for images
  - Cache images locally
- **Library**: `expo-image` (already using)

#### 2.6 Backend Scaling
**Server**: Single instance
- **Action**: 
  - Set up load balancer
  - Use PM2 for process management
  - Configure auto-restart on crash
  - Set up horizontal scaling if needed
- **PM2 Config**: `ecosystem.config.js`

---

## 📊 3. MONITORING & ANALYTICS

### 🔴 CRITICAL

#### 3.1 Error Monitoring
**File**: `lib/error-handler.ts`
```typescript
// TODO: Initialize Sentry or other error monitoring service
```
- **Action**: 
  - Set up Sentry for error tracking
  - Add error boundaries in React components
  - Track API failures
  - Monitor crash rates
- **Service**: Sentry (recommended)
- **Setup**:
```bash
npm install @sentry/react-native
npx @sentry/wizard -i reactNative
```

#### 3.2 Performance Monitoring
**App**: No performance tracking
- **Action**: 
  - Add Firebase Performance Monitoring
  - Track screen load times
  - Monitor API response times
  - Track app startup time
- **Service**: Firebase Performance

### 🟡 HIGH

#### 3.3 Analytics
**App**: No user analytics
- **Action**: 
  - Add analytics (Firebase, Mixpanel, or Amplitude)
  - Track key user actions (orders accepted, products added)
  - Monitor user retention
  - Track feature usage
- **Events to track**:
  - Store online/offline toggles
  - Orders accepted/rejected
  - Products added/deleted
  - QR scans completed

#### 3.4 Logging Infrastructure
**Backend**: Console logs only
- **Action**: 
  - Set up centralized logging (Winston + CloudWatch/Papertrail)
  - Add structured logging
  - Set log retention policies
  - Create log alerts for errors
- **Library**: `winston`, `winston-cloudwatch`

---

## 🐛 4. ERROR HANDLING & RESILIENCE

### 🟡 HIGH

#### 4.1 Network Error Handling
**All API calls**: Basic try/catch
- **Action**: 
  - Implement exponential backoff retry
  - Add offline mode detection
  - Queue failed requests for retry
  - Show user-friendly error messages
- **File**: `lib/api-client.ts` (already has retry logic, needs enhancement)

#### 4.2 Offline Support
**App**: Limited offline functionality
- **Action**: 
  - Cache critical data locally
  - Implement offline queue for actions
  - Sync when connection restored
  - Show offline indicator
- **Library**: `@react-native-community/netinfo`

#### 4.3 Data Validation
**All API responses**: Minimal validation
- **Action**: 
  - Validate all API response schemas
  - Handle unexpected data gracefully
  - Add TypeScript runtime validation
  - Prevent app crashes from bad data
- **Library**: `zod` for runtime validation

---

## 🎨 5. USER EXPERIENCE

### 🟡 HIGH

#### 5.1 Loading States
**All screens**: Some missing loading indicators
- **Action**: 
  - Add skeleton screens for all data fetching
  - Show progress indicators for long operations
  - Disable buttons during API calls
  - Add pull-to-refresh everywhere
- **Files**: All screen components

#### 5.2 Empty States
**Lists**: Basic empty messages
- **Action**: 
  - Design proper empty states with icons
  - Add helpful CTAs (e.g., "Add your first product")
  - Show illustrations for better UX
- **Files**: `owner-home.tsx`, `inventory.tsx`

#### 5.3 Error Messages
**Errors**: Generic messages
- **Action**: 
  - Write user-friendly error messages
  - Provide actionable solutions
  - Avoid technical jargon
  - Add error illustrations
- **Example**: "Can't connect" → "No internet connection. Check your WiFi and try again."

### 🟢 MEDIUM

#### 5.4 Onboarding Flow
**New users**: No onboarding
- **Action**: 
  - Add app tour for first-time users
  - Show feature highlights
  - Add tooltips for key features
  - Create video tutorials
- **Library**: `react-native-onboarding-swiper`

#### 5.5 Accessibility
**App**: Basic accessibility
- **Action**: 
  - Add proper accessibility labels
  - Support screen readers
  - Ensure color contrast ratios
  - Test with TalkBack/VoiceOver
  - Add font scaling support

---

## 🧪 6. TESTING

### 🔴 CRITICAL

#### 6.1 End-to-End Testing
**App**: No E2E tests
- **Action**: 
  - Set up Detox or Maestro for E2E tests
  - Test critical flows (login, accept order, add product)
  - Run tests in CI/CD
- **Library**: `detox` or `maestro`

### 🟡 HIGH

#### 6.2 Unit Tests
**Code**: No unit tests
- **Action**: 
  - Add Jest tests for utilities
  - Test services (order-service, inventory-service)
  - Test API client
  - Aim for 70%+ coverage
- **Library**: `jest`, `@testing-library/react-native`

#### 6.3 Integration Tests
**API**: No integration tests
- **Action**: 
  - Test API endpoints
  - Test database operations
  - Test Supabase realtime subscriptions
- **Library**: `supertest` for API tests

---

## 📱 7. APP STORE PREPARATION

### 🔴 CRITICAL

#### 7.1 App Store Assets
**Missing**: Screenshots, descriptions
- **Action**: 
  - Create app screenshots (5-8 per platform)
  - Write app description
  - Create feature graphic
  - Add app icon (1024x1024)
  - Record preview video (optional but recommended)

#### 7.2 Privacy Policy & Terms
**Missing**: Legal documents
- **Action**: 
  - Create privacy policy
  - Create terms of service
  - Add GDPR compliance (if EU users)
  - Host on website
  - Link in app settings
- **Required by**: Google Play, App Store

#### 7.3 App Permissions
**File**: `app.json`
- **Action**: 
  - Document why each permission is needed
  - Request permissions at appropriate time (not on launch)
  - Add permission rationale messages
- **Permissions**: Camera (QR), Notifications, Location (optional)

### 🟡 HIGH

#### 7.4 Store Listings
**Google Play & App Store**
- **Action**: 
  - Create developer accounts ($25 Google, $99/year Apple)
  - Fill out store listings
  - Set up app categories
  - Add keywords for SEO
  - Configure pricing (free)

---

## 🔧 8. CODE QUALITY

### 🟢 MEDIUM

#### 8.1 Code Cleanup
**Codebase**: Some unused code
- **Action**: 
  - Remove `add.product.old.tsx` and other `.old` files
  - Remove commented-out code
  - Remove unused imports
  - Remove console.logs in production
- **Tool**: ESLint with `no-console` rule for production

#### 8.2 TypeScript Strictness
**File**: `tsconfig.json`
- **Action**: 
  - Enable `strict: true`
  - Fix all type errors
  - Remove `any` types
  - Add proper interfaces for all data
- **Current**: Some `any` types used

#### 8.3 Code Documentation
**Code**: Minimal comments
- **Action**: 
  - Add JSDoc comments for complex functions
  - Document API contracts
  - Create architecture documentation
  - Add inline comments for business logic

---

## 🚀 9. PERFORMANCE OPTIMIZATION

### 🟡 HIGH

#### 9.1 Bundle Size
**App**: Not optimized
- **Action**: 
  - Analyze bundle size with `expo-bundle-analyzer`
  - Remove unused dependencies
  - Use dynamic imports for large screens
  - Enable Hermes engine (already enabled)
- **Target**: < 30MB APK

#### 9.2 Image Optimization
**Images**: Not optimized
- **Action**: 
  - Compress images before upload
  - Use WebP format
  - Implement progressive loading
  - Add image caching
- **Library**: `expo-image` (already using)

#### 9.3 List Performance
**Long lists**: May lag with many items
- **Action**: 
  - Use `FlatList` with `windowSize` optimization
  - Implement pagination for orders/products
  - Add virtual scrolling
  - Memoize list items
- **Files**: `owner-home.tsx`, `inventory.tsx`

### 🟢 MEDIUM

#### 9.4 Memory Management
**App**: No memory profiling
- **Action**: 
  - Profile memory usage
  - Fix memory leaks (check useEffect cleanup)
  - Optimize image caching
  - Clear old data from AsyncStorage

---

## 📋 10. OPERATIONAL READINESS

### 🔴 CRITICAL

#### 10.1 Incident Response Plan
**Missing**: No incident plan
- **Action**: 
  - Create runbook for common issues
  - Set up on-call rotation
  - Define SLA targets
  - Create escalation procedures
- **Document**: `INCIDENT_RESPONSE.md`

#### 10.2 Rollback Strategy
**Deployment**: No rollback plan
- **Action**: 
  - Test rollback procedures
  - Keep previous builds available
  - Use EAS Update for quick fixes
  - Document rollback steps

### 🟡 HIGH

#### 10.3 Customer Support
**Support**: No support system
- **Action**: 
  - Set up support email/chat
  - Create FAQ documentation
  - Add in-app help/support
  - Create troubleshooting guide
- **Tool**: Intercom, Zendesk, or email

#### 10.4 Release Process
**Process**: Ad-hoc releases
- **Action**: 
  - Document release checklist
  - Set up staging environment
  - Create release notes template
  - Define release schedule
- **Document**: `RELEASE_PROCESS.md`

---

## 📝 11. COMPLIANCE & LEGAL

### 🔴 CRITICAL

#### 11.1 Data Protection
**GDPR/CCPA**: Not compliant
- **Action**: 
  - Add data deletion capability
  - Implement data export
  - Add cookie consent (if web)
  - Document data retention policies
- **Required if**: Serving EU/California users

#### 11.2 Payment Compliance
**Payments**: Handling payment data
- **Action**: 
  - Ensure PCI DSS compliance
  - Never store card details
  - Use payment gateway (Stripe/Razorpay)
  - Add payment security notices

### 🟡 HIGH

#### 11.3 Accessibility Compliance
**ADA/WCAG**: Not tested
- **Action**: 
  - Test with screen readers
  - Ensure WCAG 2.1 AA compliance
  - Add accessibility statement
- **Required by**: Some jurisdictions

---

## 🎯 12. LAUNCH CHECKLIST

### Pre-Launch (1-2 weeks before)

- [ ] All CRITICAL items completed
- [ ] All HIGH priority items completed
- [ ] Beta testing with 10+ store owners
- [ ] Load testing completed
- [ ] Security audit completed
- [ ] Backup/restore tested
- [ ] Monitoring dashboards set up
- [ ] Support documentation ready
- [ ] Privacy policy published
- [ ] Terms of service published

### Launch Day

- [ ] Deploy backend to production
- [ ] Update app config to production API
- [ ] Submit to Google Play Store
- [ ] Submit to Apple App Store
- [ ] Monitor error rates
- [ ] Monitor server performance
- [ ] Have team on standby
- [ ] Announce launch

### Post-Launch (First Week)

- [ ] Monitor crash rates daily
- [ ] Review user feedback
- [ ] Fix critical bugs immediately
- [ ] Monitor server costs
- [ ] Track key metrics (DAU, orders, etc.)
- [ ] Prepare first update

---

## 📊 13. METRICS TO TRACK

### Business Metrics
- Daily Active Users (DAU)
- Orders accepted/rejected ratio
- Average response time to orders
- Store online/offline time
- Revenue per store

### Technical Metrics
- App crash rate (target: < 1%)
- API error rate (target: < 0.5%)
- API response time (target: < 500ms p95)
- App startup time (target: < 3s)
- Screen load time (target: < 1s)

### User Experience
- Order acceptance rate
- Time to accept order
- Feature adoption rates
- User retention (D1, D7, D30)
- Support ticket volume

---

## 🛠️ 14. RECOMMENDED TOOLS & SERVICES

### Essential
- **Error Monitoring**: Sentry ($26/month)
- **Analytics**: Firebase (Free tier)
- **Backend Hosting**: Namecheap VPS ($10/month) or Railway ($5/month)
- **Database**: Supabase (Free tier → $25/month)
- **CDN**: Cloudflare (Free tier)

### Recommended
- **Push Notifications**: Expo Push (Free) or OneSignal
- **Customer Support**: Intercom or Crisp
- **Uptime Monitoring**: UptimeRobot (Free tier)
- **CI/CD**: GitHub Actions (Free for public repos)

### Total Estimated Monthly Cost
- **Minimum**: ~$50/month (VPS + Supabase + Sentry)
- **Recommended**: ~$100/month (adds support, monitoring, CDN)

---

## 🚦 PRIORITY ROADMAP

### Week 1 (CRITICAL Security)
1. Remove dev OTP bypass
2. Set up production API endpoint
3. Configure proper environment variables
4. Review Supabase RLS policies
5. Set up error monitoring (Sentry)

### Week 2 (Infrastructure)
1. Set up database backups
2. Configure EAS Build
3. Set up HTTPS on backend
4. Implement rate limiting
5. Add input validation

### Week 3 (Testing & Polish)
1. Write E2E tests for critical flows
2. Beta test with real users
3. Fix reported bugs
4. Optimize performance
5. Create app store assets

### Week 4 (Launch Prep)
1. Create privacy policy & terms
2. Submit to app stores
3. Set up monitoring dashboards
4. Prepare support documentation
5. Final security audit

---

## ✅ QUICK START - MOST CRITICAL FIXES

If you only have time for the absolute essentials:

1. **Remove OTP bypass** (`app/otp.tsx`)
2. **Set production API URL** (`lib/config.ts`)
3. **Add `.env` to `.gitignore`**
4. **Set up Sentry** for error monitoring
5. **Enable database backups** in Supabase
6. **Review RLS policies** in Supabase
7. **Set up HTTPS** on backend
8. **Create privacy policy** and terms
9. **Test with 5+ real users**
10. **Configure proper app package name** (`app.json`)

---

## 📞 SUPPORT & RESOURCES

- **Expo Docs**: https://docs.expo.dev
- **Supabase Docs**: https://supabase.com/docs
- **React Native Docs**: https://reactnative.dev
- **Sentry Setup**: https://docs.sentry.io/platforms/react-native

---

**Next Steps**: Review this checklist with your team, prioritize based on your launch timeline, and start with the CRITICAL items. Good luck with your launch! 🚀
