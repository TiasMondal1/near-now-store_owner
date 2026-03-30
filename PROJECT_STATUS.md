# Project Status - Near & Now Store Owner

Last updated: 2026-03-30
Owner: Store Owner app repo (`near-now-store_owner`)

## Current Snapshot

- Overall: **Functional for core store-owner workflow**, but **not production-ready yet**.
- Core app status: **working**
- Production readiness status: **pending critical hardening**
- Code health status: **needs cleanup** (TypeScript errors + partial refactor integration)

## Project Status Percentage

Scoring model used for this file:

- Done = 1.0 point
- Partial = 0.5 point
- Left = 0 point

Current tracked feature counts:

- Done: 14
- Partial: 8
- Left: 6
- Total tracked items: 28

Computed status:

- Strict completion (Done only): **50.0%** (14/28)
- Weighted progress (Done + Partial): **64.3%** ((14 + 8x0.5)/28)
- Remaining work: **35.7%**

## Done vs Left Tables

### Done Features

| # | Feature / Functionality | Status | Notes |
| --- | --- | --- | --- |
| 1 | Session check and auto redirect | Done | `app/landing.tsx` |
| 2 | OTP verification login | Done | `app/otp.tsx` |
| 3 | Customer session guard in owner app | Done | Prevents wrong-role session use |
| 4 | Store fetch and display on Home | Done | Home store card visible |
| 5 | Store online/offline toggle flow | Done | Confirm dialogs + API update |
| 6 | Inventory catalog browse | Done | Master catalog visible |
| 7 | Add catalog products to store | Done | Via stock/inventory flows |
| 8 | Search and category filter in inventory | Done | Implemented in UI |
| 9 | Your Stock list on Home | Done | Active/Inactive + delete |
| 10 | Custom product creation | Done | `app/(tabs)/stock.tsx` |
| 11 | Active orders list | Done | Home tab + periodic refresh |
| 12 | Previous orders history | Done | `app/(tabs)/previous-orders.tsx` |
| 13 | Order details modal | Done | Home tab order detail popup |
| 14 | Profile + logout flow | Done | `app/profile.tsx` |

### Left / Partial Features

| # | Feature / Functionality | Status | What is left |
| --- | --- | --- | --- |
| 1 | Settings route: Business Hours | Left | `/business-hours` screen missing |
| 2 | Settings route: Low Stock Settings | Left | `/low-stock-settings` screen missing |
| 3 | Payments/payouts real data | Left | Tab is placeholder, no live payout integration |
| 4 | End-to-end invoice PDF flow | Left | SQL exists, full generate/download path not verified |
| 5 | Automated tests | Left | No test suite in repo |
| 6 | CI quality gates | Left | No enforced type/lint/build pipeline |
| 7 | Store settings end-to-end backend parity | Partial | UI/modal exists, backend endpoint coverage may be incomplete |
| 8 | Notification pipeline | Partial | UI/service exists, production push path not fully verified |
| 9 | Low stock threshold feature | Partial | Service path has TS issues and missing screen flow |
| 10 | Order advanced filters/search/bulk/notes/CSV in UI | Partial | Service exists, UI not fully wired |
| 11 | Inventory bulk ops/CSV in UI | Partial | Service exists, UI not fully wired |
| 12 | Hook/service migration completion | Partial | Screens still use direct fetch logic in many places |
| 13 | TypeScript compile health | Partial | Build works functionally but `tsc --noEmit` currently fails |
| 14 | Error monitoring integration | Partial | `lib/error-handler.ts` has TODO placeholders |

## Features & Functionality Matrix (Done / Partial / Left)

Legend:

- Done: implemented + reachable from app flow
- Partial: implemented but not fully integrated / broken path / behind missing backend/Supabase work
- Left: not implemented

### Authentication & Session

- **Done**: Session check + redirect (`app/landing.tsx`)
- **Done**: OTP verify flow (server-based) (`app/otp.tsx`)
- **Done**: Multi-role guardrails (customer session detection/clearing)
- **Left (prod hardening)**: remove/avoid any dev-only shortcuts and ensure prod build cannot bypass auth

### Store Management

- **Done**: Fetch store(s) and show store card on Home tab
- **Done**: Online/Offline toggle with confirmation (`app/(tabs)/home.tsx`)
- **Done**: Cache invalidation when store goes offline
- **Partial**: Multi-store support (current UI effectively assumes first store only)

### Inventory / Stock

- **Done**: Browse master catalog and add products to store (`app/(tabs)/stock.tsx`, `app/inventory.tsx`)
- **Done**: Category chips + search in inventory views
- **Done**: “Your Stock” list on Home with Active/Inactive toggle + delete
- **Done**: Custom product creation (adds to master catalog) (`app/(tabs)/stock.tsx`)
- **Partial**: Low-stock threshold feature (UI route missing; `lib/inventory-service.ts` has type errors)
- **Partial**: Bulk operations + CSV export (services exist in `lib/*-service.ts` but not wired into screens)

### Orders

- **Done**: Active orders list on Home + periodic refresh (10s)
- **Done**: Previous Orders tab (delivered history)
- **Done**: Order detail modal on Home
- **Partial**: Advanced order management (filters/search/bulk/notes/CSV) exists in `lib/order-service.ts` but not integrated into UI flows

### Invoices

- **Partial**: Invoice screen route exists (`app/invoice/[orderId].tsx`)
- **Partial**: Supabase invoice numbering RPC SQL exists (`supabase/invoices.sql`)
- **Left**: End-to-end “generate and download PDF invoice” integration (Edge function + storage path + UI download flow) is not confirmed complete in this repo

### Payments / Payouts

- **Partial**: Payments tab exists but currently shows placeholder “No payouts yet” (`app/(tabs)/payments.tsx`)
- **Left**: Real payouts data integration (API + UI) is not implemented/verified here

### Settings / Profile

- **Done**: Profile screen (account/store info + logout) (`app/profile.tsx`)
- **Partial**: Settings screen exists (`app/settings.tsx`) but has broken navigation targets:
  - `/business-hours` (missing)
  - `/low-stock-settings` (missing)
- **Partial**: Store settings modal exists (`components/StoreSettingsModal.tsx`) but depends on backend endpoints listed in `IMPLEMENTATION_GUIDE.md` being implemented
- **Partial**: Notification preferences UI exists (`components/NotificationSettings.tsx`) but backend registration/preferences endpoints may be missing

### Notifications

- **Partial**: Notification service exists (`lib/notifications.ts`) + preferences UI exists
- **Left**: Verified production push pipeline (backend endpoints + tokens + real device testing) not confirmed

### Reliability / Production Readiness

- **Partial**: Error boundary exists in root layout (`app/_layout.tsx`)
- **Partial**: Centralized error handler exists (`lib/error-handler.ts`) but monitoring integration is TODO
- **Left**: CI checks (typecheck/lint/build), tests, and full security hardening per `PRODUCTION_READINESS.md`

## What Is Done (Verified in Code)

### App Flow and Core Features

- Authentication flow exists: landing -> phone/login screen (`/App`) -> OTP verification -> tabs.
- Session handling is implemented (`session.ts`) and used across screens.
- Main tabs are implemented and wired: `home`, `previous-orders`, `payments`, `stock`.
- Store online/offline toggle is implemented in `app/(tabs)/home.tsx`.
- Inventory catalog + add-to-store flow is implemented in `app/(tabs)/stock.tsx` and `app/inventory.tsx`.
- Custom product creation flow is implemented in `app/(tabs)/stock.tsx`.
- Previous orders screen and invoice route (`app/invoice/[orderId].tsx`) exist.

### Data/Backend Integration

- Backend API integration is present across screens (`/store-owner/stores`, orders endpoints, store status endpoints).
- Supabase integration exists for direct DB operations and realtime listeners.
- Orders RPC SQL exists: `supabase/orders-rpc-and-rls.sql`.
- Additional Supabase scripts are present for custom product RLS, trigger fixes, and invoices.

### Build/Deployment Scaffolding

- Android build scripts are present (`build:apk`, `build:android`, EAS profile usage).
- Deployment and readiness docs are present (`PLAY_STORE_DEPLOYMENT.md`, `PRODUCTION_READINESS.md`, etc.).

## What Is Partial / In Progress

- `lib/order-service.ts`, `lib/store-service.ts`, `lib/inventory-service.ts` are implemented, but app screens mostly still use direct `fetch` + direct DB helpers.
- Refactor hooks (`hooks/useStore.ts`, `hooks/useOrders.ts`, `hooks/useProducts.ts`) exist, but are not fully adopted by main screens.
- Settings screen exists (`app/settings.tsx`) with modal/settings UI, but links to routes that are missing:
  - `/business-hours`
  - `/low-stock-settings`

## What Is Left (Actionable)

### 1) Fix TypeScript Build Health (High)

Current `npx tsc --noEmit` fails with multiple errors, including:

- Undefined properties/constants in `lib/inventory-service.ts` (`lowStockThreshold`, `LOW_STOCK_THRESHOLD_KEY`, `DEFAULT_LOW_STOCK_THRESHOLD`).
- Unused vars/imports in several files (`payments.tsx`, `settings.tsx`, `order-service.ts`, `store-service.ts`, etc.).
- Legacy file errors (`app/add.product.old.tsx`) still included in compile.

### 2) Close Broken Navigation/UX Paths (High)

- Implement screens or remove links for:
  - `/business-hours`
  - `/low-stock-settings`

### 3) Consolidate Architecture (Medium)

- Complete migration from duplicated screen logic to hooks/services.
- Remove or archive legacy/duplicate screens once confirmed unused:
  - `app/add.product.old.tsx`
  - `app/owner-orders.tsx`
  - `app/registration-success.tsx`

### 4) Production Security Hardening (Critical before launch)

- Confirm no dev-only bypass behavior remains in production path.
- Validate and lock production API base and env values.
- Complete error monitoring integration (`lib/error-handler.ts` still has TODO placeholders).
- Tighten Supabase policies (current SQL/scripts still include permissive anon patterns for convenience).

### 5) Quality and Release Readiness (High)

- Add automated tests (currently no test files found).
- Add CI checks for typecheck/lint/build.
- Resolve console logging noise and adopt centralized logger consistently.

## Recommended Next Milestones

### Milestone A - Stabilize Build (1-2 days)

- Make `npx tsc --noEmit` pass.
- Fix or exclude legacy files causing compile failures.
- Remove dead imports/unused vars.

### Milestone B - Fix User-Facing Gaps (1 day)

- Add missing settings routes or hide those options.
- Validate end-to-end flows from tabs and profile/settings.

### Milestone C - Production Hardening (2-4 days)

- Integrate Sentry (or equivalent).
- Finalize secure RLS strategy for production.
- Add smoke tests for auth, orders, stock actions.

## Status Maintenance Log

### 2026-03-30

- Added `PROJECT_STATUS.md` based on code + docs audit.
- Confirmed core features are present and usable.
- Confirmed project still has compile and production-readiness gaps.
- Added feature-by-feature Done/Partial/Left matrix.

---

## Update Rule (for future updates)

When features are added/changed, update this page in the same PR:

1. Move completed items from "Left" -> "Done".
2. Update "Last updated" date.
3. Add one bullet in "Status Maintenance Log".
4. Re-run `npx tsc --noEmit` and reflect result here if status changes.
