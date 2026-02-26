# Project Status (Near&Now · Store Owner)

Last updated: 2026-02-26

## Current state (high level)

- **App**: Expo + React Native (expo-router) store-owner app
- **Core flows working**: OTP login, store-owner signup w/ map location, owner dashboard, orders (accept/reject + QR verify), payments (today), inventory (edit quantities), add products (catalog + custom)
- **Backend**: External REST API (`EXPO_PUBLIC_API_BASE_URL`) + optional Supabase for inventory persistence

## Implemented (mostly done)

- **Auth**: phone number → OTP send/verify → session persisted (AsyncStorage)
- **Onboarding**: store-owner signup (details + map picker + reverse geocode) → registration success → dashboard
- **Dashboard**:
  - Store online/offline toggle
  - Orders list + order details
  - Incoming order popup w/ countdown + accept/reject
  - QR scan verification flow
  - Payments list + “Today’s total”
- **Inventory**: catalog merge + search + inline quantity updates (Supabase preferred, backend fallback, local cache)
- **Add products**:
  - Bulk add from master catalog
  - Custom product with image (camera/gallery) + quantity + price

## Partially implemented / cleanup needed

- **Payouts tab**: tab exists but **no screen / data** wired yet.
- **Incoming order popup duplication**: `owner-home` contains duplicate modal UI; reusable component exists but is unused.
- **Legacy screen**: `owner-orders` screen appears unused (dashboard contains orders already).
- **Inventory architecture**: mixed sources (Supabase + backend + cache) adds complexity; needs a “source of truth” decision.
- **Validation hardening**: some calls (e.g., custom product add) should guard `storeId`/`token` consistently.

## Next required steps (keep this updated)

### P0 — must do next (core completeness)

- [ ] **Implement “Payouts”**: UI + data model + backend endpoints + loading/empty/error states
  - Expected: payout balance, payout history, settlement status, filters by date range
- [ ] **Pick inventory source of truth** and simplify
  - Option A: backend owns inventory; app uses backend only (Supabase optional read-only or removed)
  - Option B: Supabase owns inventory; backend reads from Supabase; app writes to Supabase (requires secure RLS)

### P1 — cleanup + robustness

- [ ] **Deduplicate incoming order UI**
  - Replace inline modals with `components/IncomingOrderPopup` (or delete component and keep one modal)
- [ ] **Decide fate of `owner-orders` screen**
  - Either link to it intentionally, or remove to reduce confusion
- [ ] **Standardize guards for protected calls**
  - Before any `Authorization` request, ensure `token` present; ensure `storeId` present for store routes
- [ ] **Consistent empty/error states**
  - Orders, payments, inventory should show clear “no data” and retry UX on failure

### P2 — production hardening

- [ ] **Supabase security (if used in production)**
  - Replace dev-friendly anon RLS with auth-scoped policies per owner/store
- [ ] **Secrets hygiene**
  - Ensure `.env` is not committed and keys are rotated if exposed
  - Prefer `EXPO_PUBLIC_*` only for non-sensitive client-safe values

### P3 — product improvements (likely needed soon)

- [ ] **Store/profile settings**
  - Edit store name, address, delivery radius; owner profile details
- [ ] **Multi-store support in UI**
  - Store switcher + persist selected store
- [ ] **Basic analytics**
  - Weekly/monthly totals, top products, order stats

## Notes / decisions needed

- **Payouts**: confirm what “payout” means in your business (bank settlement? wallet? cash reconciliation?) and what backend endpoints exist/need to be built.
- **Inventory**: decide whether the backend or Supabase is canonical; current hybrid logic works but is harder to maintain.

