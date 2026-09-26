# Near & Now Shopkeeper — Design System

This document is the contract for the UI. Every screen is built from the tokens in
`lib/theme.ts` and the components in `components/ui/`. Screens do **not** define their
own colours, radii, shadows, font sizes or button/input/card looks.

Target feel: minimal, modern, quiet. Strong hierarchy through size and weight, not
colour. One accent (brand green). Whitespace does the separating; borders are hairline
or 1px; shadows only on things that float.

---

## 1. Tokens (`lib/theme.ts`)

All existing exports (`colors`, `spacing`, `radius`, `shadows`) stay so untouched code
compiles. New tokens are added; a few old ones are documented as deprecated.

### 1.1 Colours

```
Brand
  primary        #0C831F   fills, active states, links, primary buttons
  primaryDark    #065F46   pressed primary
  primaryBg      #F0F9F1   soft tint backgrounds (empty-state circle, tonal button, selected chip)
  primaryBorder  #BBE3C3   borders on primary-tinted surfaces
  onPrimary      #FFFFFF   text/icons on primary fills

Neutrals
  background     #F7F7F7   screen background
  surface        #FFFFFF   cards, bars, sheets, inputs
  surfaceVariant #FAFAFA   segmented-control track, skeleton base, pressed row
  border         #E8E8E8   1px borders
  borderLight    #F2F2F2   hairline separators inside cards
  textPrimary    #1A1A1A
  textSecondary  #555555   body-secondary, descriptions
  textMuted      #6B6B70   any text ≤13px that must stay ≥4.5:1 (captions, labels)
  textTertiary   #8E8E93   icons / decorative only — never body text
  textDisabled   #C7C7CC

Semantic  (fill / bg / border / text)
  success  #10B981 / #D1FAE5 / #A7F3D0 / #047857
  warning  #F59E0B / #FEF3C7 / #FDE68A / #B45309
  error    #EF4444 / #FEE2E2 / #FECACA / #B91C1C
  info     #3B82F6 / #DBEAFE / #BFDBFE / #1D4ED8
  exported as successBg, successBorder, successText, warningBg, … infoText
  errorStrong #B91C1C  solid error fill that carries onPrimary text (error toast,
                       CountBadge) — `error` under white text is only 3.8:1

Overlays
  overlay  rgba(0,0,0,0.45)   modal / sheet scrim
  scrim    rgba(255,255,255,0.20)
```

Deprecated (keep exported, do not use in new code): `secondary`, `accent`,
`primaryLight`. Deleted concepts: `#FF9800`, `#FF6B00`, every `colors.x + "20"`
alpha-concatenation, every literal hex outside `lib/theme.ts` (the PDF template in the
invoice screen reads token values into its HTML string).

Rule: attention counts (unread bell, incoming orders tab badge) use **error**.
Genuinely pending states (awaiting approval, document under review) use **warning**.
Never colour by tab or by time bucket.

### 1.2 Typography (`typography`)

System font. Weights 400 / 500 / 600 / 700 only. Every style has `fontSize` +
`lineHeight` (+ `fontWeight`, optional `letterSpacing`).

```
display     28/34  700   auth screen titles, hero rupee amount (use tabular via fontVariant)
title       24/30  700   tab-screen titles (ScreenHeader)
heading     18/24  600   TopBar title, card titles, section titles
subheading  16/22  600   order codes, emphasised row titles, lg button label
body        15/22  400   default text
bodyStrong  15/22  600   list row titles, md button label
label       13/18  500   field labels, inactive segment text
description 13/18  400   row / step / notice descriptions (never `{...label, fontWeight: "400"}`)
caption     12/16  400   meta, dates, helper text — the floor for readable text
overline    12/16  600   uppercase, letterSpacing 0.5 — eyebrows, table headers
code        22/28  700   letterSpacing 4 — pickup code only
```

Badge text is 12/600. `CountBadge` alone may use 11/700. No 800/900 weights, no
negative letterSpacing, no sizes below 11.

### 1.3 Spacing (`spacing`, base 4)

`xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`

- Screen gutter: `layout.gutter` = 16 on phones, 24 at ≥600dp (use `useLayout()` hook).
- Content column: `layout.maxContentWidth` = 640 (480 for auth forms), centred.
- Section gap: 24, provided by the parent container's `gap` — **no component owns its
  outer margin**.
- Card padding 16 (compact 12). List row: minHeight 56, paddingVertical 12,
  paddingHorizontal 16, leading slot 40 (48 / 52 for thumbnail rows via
  `leadingSize`), gap 12.
- Icon–text gap: 4 for meta, 8 for control groups. Grid gap 12.
- Scroll bottom padding: tab-bar height + 24 on tab screens; `insets.bottom + 24` on
  stack screens.

### 1.4 Radius and elevation

```
radius.md   12   controls: buttons, inputs, segmented track, thumbnails
radius.lg   16   cards, banners, sheet body, modal card
radius.xl   24   bottom-sheet top corners only
radius.full      pills, chips, badges, avatars, circular icon buttons
```
`radius.xs`/`sm` stay exported but are not used in new code. No literal radii.

```
level 0  flat               buttons, inputs, banners, tab bar (hairline top border)
level 1  static card        1px border, NO shadow
level 2  floating           shadows.md — bottom sheet, FAB, modal card, sticky footer
```
Never combine a border with a shadow. Never tint `shadowColor`. Disabled = 40% opacity
**and** `elevation: 0`.

### 1.5 Icons (`iconSize`)

Ionicons, **outline family only**; filled variants are reserved for the selected tab
icon and for glyphs inside `Badge`.

`iconSize.sm 16` inline/meta · `iconSize.md 20` controls, list leading · `iconSize.lg 24`
header/nav · `iconSize.xl 32` empty-state glyph.

### 1.6 Motion

- No mount-time fade/slide animations on screens. The navigator transition is the
  entrance.
- Motion is spent on state change only: `LayoutAnimation` (150–200ms) for list
  add/remove and accordion expand; sheet slide 260ms in / 200ms out (native driver);
  skeleton pulse 800ms; one 300ms logo fade on cold-start splash.
- Haptics: `impactAsync(Light)` on toggles, `notificationAsync(Success)` on confirmed
  primary actions, `notificationAsync(Error)` on failed submits.

---

## 2. Components (`components/ui/`)

Each component is a single file, exported from `components/ui/index.ts`. Every
component: uses tokens only; `accessibilityRole`/`accessibilityLabel`/`accessibilityState`
set correctly; interactive elements are ≥44dp (or 40dp + `hitSlop`); handles `disabled`
and `loading` where relevant; no outer margin.

### Layout

**`Screen`** — `SafeAreaView` (edges top; bottom edge only when `edges` prop asks) with
`backgroundColor: colors.background`. Props: `children`, `edges?`, `style?`,
`keyboardAvoiding?: boolean` (wraps in `KeyboardAvoidingView`, iOS padding behaviour).

**`TopBar`** — fixed bar for stack screens. `colors.surface`, hairline bottom border
(`StyleSheet.hairlineWidth`, `colors.border`), height 56 (64 with subtitle), gutter
padding. Props: `title`, `subtitle?`, `overline?` (e.g. "Step 2 of 3"),
`onBack?` (renders 44dp back `IconButton`, label "Go back"; slot reserves 44dp even when
absent), `backHref?: Href` (convenience: when set and `onBack` is absent the back button
calls `goBackOr(backHref)` from `lib/navigation`), `right?: ReactNode` (one `IconButton`
or text `Button`; empty slot reserves 44dp), `transparent?`. Title 18/600 left-aligned, `numberOfLines={1}`, `flex: 1`. Never
animated. Always rendered, including during loading and error states.

**`ScreenHeader`** — in-scroll header for the four tab roots. `colors.background`,
paddingTop 16, gutter, paddingBottom 16, no border. Props: `title` (24/700,
`numberOfLines={1}`, flex 1), `eyebrow?` (14/400 textSecondary above), `subtitle?`
(14/400 textSecondary below), `right?: ReactNode` (row of 44dp `IconButton`s, gap 8).

**`Section`** — `SectionHeader` + children with `gap: 12`. `SectionHeader`: overline
text 12/600 uppercase `textMuted` **or** sentence-case 13/600 (`variant`), optional
trailing `action` (text `Button` sm) or `count`. Spacing 16 above / 8 below when rendered
standalone.

**`Card`** — `colors.surface`, `radius.lg`, 1px `colors.border`, padding 16 (`compact` →
12), no shadow. Props: `title?` + `accessory?` render a header row (heading 18/600 +
trailing node) with 12 below it; `footer?`; `onPress?` (turns into a `Pressable` with
`surfaceVariant` pressed state); `padded?: boolean` default true; `tone?:
'neutral'|'success'|'warning'|'error'|'info'` gives the toneBg/toneBorder pair (used
sparingly, e.g. StoreStatusCard when offline is **not** tinted — status lives in a
Badge).

**`Divider`** — hairline `colors.borderLight`, optional `inset` (number).

**`StickyFooter`** — floating footer pinned under a scrolling form/list (Save/Cancel,
"Continue"). Level 2: `surface` + `shadows.md`, **no border** (§1.4). Gutter padding,
12 above, `max(insets.bottom, 12)` below; children in a centred `contentWidth` column
with an 8 gap. Rendered as the last sibling of the scroll view inside `Screen` (edges
top only — the footer owns the bottom inset). Props: `children`, `style?`, `testID?`.

### Actions

**`Button`** — `variant: 'primary'|'secondary'|'tonal'|'destructive'|'text'`, `size:
'lg'|'md'|'sm'` (heights 52/44/36; labels 16/600, 15/600, 13/600; `sm` gets a computed
vertical `hitSlop` of `(44 − 36) / 2` so its target reaches 44dp on its own), `radius.md`,
`fullWidth?`, `leftIcon?`/`rightIcon?` (Ionicons name, sized 20/20/16), `loading`
(spinner replaces label, height fixed, `accessibilityState.busy`), `disabled` (40%
opacity, `elevation 0`, `accessibilityState.disabled`), `onPress`, `haptic?:
'light'|'success'|'none'` (default light for primary/destructive), `accessibilityLabel?`.
Looks: primary = primary fill + onPrimary text; secondary = surface + 1px border +
primary text; tonal = primaryBg + primaryBorder + primary text; destructive = surface +
1px errorBorder + errorText; text = transparent, primary text, minHeight 44, hitSlop 8.
No shadows on any variant. "Try again" is always `secondary`.

**`IconButton`** — 44×44 (or `size={40}` + hitSlop 4), `radius.full`, `variant:
'plain'|'surface'|'tonal'|'floating'` (floating = surface + `shadows.md`, for FAB),
`icon` (Ionicons name, 24 default / 20 for size 40), `color?`, `badgeCount?` (renders
`CountBadge` top-right), **required** `accessibilityLabel`, `loading?` (spinner replaces
the glyph, size fixed, `accessibilityState.busy`, presses ignored), `disabled`, `onPress`.

**`Chip`** — selectable pill. `size 'sm'|'md'` (36/40), `radius.full`, 13/500, `selected`
= primaryBg + primaryBorder + primary text (no weight change), unselected = surface +
border + textSecondary; `icon?`; `accessibilityRole="button"` + `accessibilityState.selected`.

**`SegmentedControl`** — `items: {key, label, count?, icon?}[]`, `value`, `onChange`.
44dp track on `surfaceVariant` with 1px border and `radius.md`, 2dp inner padding;
segments `flex: 1` with vertical `hitSlop` so the full track height is tappable; active
segment = plain `surface` pill (`radius.md - 2`, no border of its own) with primary 14/600
text; inactive = 14/500 textSecondary. Count rendered as "Label · 3"; labels shrink to
85% before ellipsising. `maxWidth 480` and self-centred on wide screens.
`accessibilityRole="tab"` + `selected` state per segment. Optional `size 'sm'` (36dp,
13px) for in-card use and for 4-item sets on phones.

### Data display

**`ListRow`** — grouped `Pressable` (only when `onPress`), minHeight 56, paddingVertical
12, gutter horizontal (`inset` prop for inside cards → 0), `leading?: ReactNode` in a
slot of `leadingSize?: 40 | 48 | 52` (default 40; or `icon` Ionicons name rendered 20
textSecondary in a `surfaceVariant` rounded tile filling the slot when `iconTile`),
`title` 15/600, `description?` `typography.description` textMuted (`numberOfLines` 2),
`trailing?: ReactNode` (chevron 20 textTertiary when `chevron`, `Badge`, `Switch`, or
value text 15/400 textSecondary via `value`), `showSeparator` (hairline `borderLight` at
bottom; caller skips on last row), pressed = `surfaceVariant`,
`accessibilityRole="button"` when pressable, `disabled`. `onLongPress` **without**
`onPress` keeps the row ungrouped (a trailing `Switch` stays its own element; touch
long-press still works on the whole row) and exposes the gesture to screen readers as
`accessibilityActions: [{ name: 'longpress', label: longPressLabel ?? 'More actions' }]`
on the text block, handled via `onAccessibilityAction`. With `onPress` the same action
is added to the grouped row.

**`KeyValueRow`** — label 13/500 textMuted left, value 15/400 textPrimary right
(`numberOfLines 2`, flex), optional `icon`, optional `onCopy` (long-press copies and
shows Toast). Used for profile/settings info.

**`Badge`** — `tone: 'neutral'|'success'|'warning'|'error'|'info'`, `size 'sm'|'md'`
(20/24dp), `radius.full`, text 12/600 toneText on toneBg, optional `dot` (6dp toneFill),
optional `icon` (Ionicons 12). `neutral` = surfaceVariant + border + textSecondary.

**`CountBadge`** — 18dp min, `radius.full`, `errorStrong` fill, 11/700 onPrimary, caps at "9+",
1.5dp surface ring when `ringed` (for overlaying an IconButton). Hidden when `count <= 0`.

**`InlineNotice`** — `tone` (info default, success, warning, error), 20 icon, `title`
14/600 toneText, `message?` 13/400 textSecondary, `lines?: string[]` (bulleted list
13/400 textSecondary under the title/message — use instead of a "\n"-joined message;
read as a list and included in the alert announcement), `action?: {label, onPress}`
rendered as text `Button` sm, optional `onDismiss`, `radius.lg`, toneBg + toneBorder,
padding 12, `accessibilityRole="alert"` for error/warning.

**`Skeleton`** — `Skeleton.Box({width,height,radius})`, `Skeleton.Text({lines,width})`,
`Skeleton.ListRow({count})`, `Skeleton.Chips({count})` (wrapping row of 36dp pills for a
`Chip` filter row), `Skeleton.Card({lines})`; base `surfaceVariant`, 800ms opacity pulse
(`Animated`, native driver), each composite announces `accessibilityLabel="Loading"` once.

**`EmptyState`** / **`ErrorState`** — centred with `flexGrow: 1`, 72dp `primaryBg`
circle (`errorBg` for ErrorState) with 32 outline icon, `title` 17/600 sentence case,
`message?` 14/400 textSecondary (1–2 lines), `action?: {label, onPress, variant}`
(EmptyState default primary; ErrorState default secondary "Try again"), `compact?`
(for inside cards: 56dp circle, 15/600 title). Designed to be a `ListEmptyComponent` so
pull-to-refresh keeps working.

**`Stepper`** — vertical steps `{title, description?, state: 'done'|'active'|'upcoming'}`
with 24dp markers (check / number / hollow), connector line `border`, active title
15/600 primary. **`ProgressBar`** — 4dp track `borderLight`, fill primary, `value 0..1`,
optional `label` caption right-aligned ("3 of 9").

### Inputs

**`TextField`** — height 48, `radius.md`, `surface`, 1px `border`; focus 2px primary;
error 1.5px error; disabled `surfaceVariant` + textDisabled. `label` 13/500 textSecondary
above (gap 6), `helper?` / `error?` 12 below (error in errorText, `accessibilityLiveRegion`
polite), `prefix?` ("+91" as 15/500 textSecondary), `leftIcon?`, `rightIcon?`/`onRightIconPress`
(e.g. clear), `multiline` (minHeight 96, top-aligned), forwards every `TextInput` prop
(keyboardType, maxLength, autoCapitalize, returnKeyType, onSubmitEditing, ref via
`forwardRef`). Text 16/400 textPrimary; placeholder textMuted (textTertiary is icons-only and fails 4.5:1).

**`SearchField`** — `TextField` preset: leading `search` icon, trailing clear button when
non-empty, `returnKeyType="search"`, `autoFocus?`, `accessibilityLabel` default
"Search".

**`OtpInput`** — 6 boxes flex 1 (max 48), height 56, `radius.md`, states idle/focused/
filled/error, paste-to-fill, backspace navigation, `onComplete`, `error?` message below.

**`Switch`** — thin wrapper over RN `Switch` with token track colours and required
`accessibilityLabel`.

**`Checkbox`** — 24dp glyph (`checkbox-outline` primary when checked / `square-outline`
textSecondary) inside a 44dp pressable row (minWidth 44 too), optional `label` 15/400
and `description` 13/400 textMuted, `disabled` (40% opacity), light haptic on toggle,
`accessibilityRole="checkbox"` + `checked` / `disabled` state. Props: `checked`,
`onChange(next)`, `label?`, `description?`, `disabled?`, `haptic?`,
`accessibilityLabel?` (required without `label`). Used for per-item include rows in
incoming orders and any multi-select list.

### Overlays

**`BottomSheet`** — shared animated sheet: `overlay` scrim, `surface` body with
`radius.xl` top corners, 36×4 handle, padding 16 + `max(insets.bottom,16)+12` bottom,
slide 260ms in / 200ms out (native driver), tap-outside and Android back dismiss unless
`busy`, `accessibilityViewIsModal`. Props: `visible`, `onClose`, `busy?`, `title?`,
`children`.

**`ConfirmSheet`** — `BottomSheet` variant: 64dp tinted icon circle (`tone`), `title`
18/600, `message` 15/400 textSecondary, primary/destructive `Button` (`confirmLabel`,
`loading` while `onConfirm` promise runs, shows `errorMessage` inline via `InlineNotice`
on rejection — never `Alert`), text `Button` "Cancel". Replaces Home's inline confirm
modal and every `Alert.alert(... [{Cancel},{Confirm}])`.

**`ActionSheet`** — `BottomSheet` with `options: {key, label, icon?, destructive?,
onPress}[]` rendered as `ListRow`s; used for "Take photo / Choose from gallery / Remove".
Selecting closes the sheet and runs `onPress` from `BottomSheet`'s `onClosed` (after the
exit animation and `Modal` unmount), so a handler may open another sheet or a native
picker.

**`NoticeSheet`** — one-button informational `BottomSheet` replacing
`Alert.alert(title, message, [{ text: "Continue", onPress }])`. `ConfirmSheet` layout
(64dp tinted icon circle by `tone`, default warning; `title` 18/600; `message` 15/400
textSecondary; lg primary `Button` `actionLabel`) with **no cancel path** — button,
backdrop and Android back all run `onAction`. Props: `visible`, `title`, `message`,
`actionLabel`, `onAction`, `tone?`, `icon?`, `testID?`.

**`Toast`** — `ToastProvider` mounted once in `app/_layout.tsx`; `useToast()` returns
`show({message, tone?: 'neutral'|'success'|'error', action?: {label, onPress},
duration? = 4000})`. Renders bottom-anchored above the tab bar: `app/(tabs)/_layout.tsx`
calls `setToastBottomOffset(layout.tabBarHeight + insets.bottom)` while the tab
navigator is focused and resets it to 0 otherwise; the host falls back to
`insets.bottom` at 0, and the provider's optional `bottomOffset` prop overrides both.
`radius.lg`, `textPrimary` fill with onPrimary text (dark toast) for neutral/success,
`errorStrong` fill for error, `shadows.md`, `accessibilityLiveRegion="polite"` plus an
explicit VoiceOver announcement on iOS. Only one toast at a time; new replaces old.

### Domain helpers (in `lib/order-utils.ts`, not `components/ui`)

- `getStatusTone(status): 'neutral'|'success'|'warning'|'error'|'info'` covering
  pending_store/pending_acceptance (warning), pending_review/under_review/in_review
  (warning), accepted/store_accepted/ready/ready_for_pickup (info),
  picked_up/delivered/order_delivered/completed (success), approved (success),
  rejected/cancelled (error), default neutral. The review statuses let verification
  and product-submission records share the order `Badge` mapping.
- `formatStatus(status)` extended with "Picked up", "Ready for pickup", "Accepted",
  "Approved", "Under review", "Pending review".
- `isDelivered(status)` — `delivered` / `order_delivered` / `completed`, matching the
  statuses `getStatusTone` maps to success as "Delivered".
- `formatINR(value)` — en-IN grouping, strips ".00".
- `parseDbDate` already exists.

---

## 3. Screen patterns

### Headers
- Stack screens: `TopBar` fixed above a `ScrollView`/`FlatList`. Content starts 16 below.
- Tab screens: `ScreenHeader` inside the scroll (or as `ListHeaderComponent`). If the
  screen filters, `SegmentedControl` sits 16 below the header.
- Titles are nouns matching the tab label: Home shows the store name with a greeting
  eyebrow; Orders; Payouts; Inventory.

### States
- **Loading**: header (and any segmented control) always mounted. First load shows
  `Skeleton` shaped like the real rows. Warm loads paint from cache with no spinner.
  Inline waits use the busy `Button` or a small `ActivityIndicator` inside the row. Only
  the root approval gate and the splash may show a centred indicator.
- **Empty**: `EmptyState` as `ListEmptyComponent`; copy in sentence case; CTA leads to
  the fixing action. Copy never sends the user to another tab in prose — give a button.
- **Error**: `ErrorState` with secondary "Try again" when nothing is shown; `InlineNotice`
  (warning) "Couldn't refresh · showing saved data" with Retry when cached content is
  visible. Never swallow a first-load failure.
- **Success**: `Toast` (non-blocking), with Undo for soft deletes/toggles where the code
  already supports reversal. Multi-step flows use a success `InlineNotice` with the
  next-step button.
- **Validation**: inline `error` on the `TextField`, first invalid field focused and
  scrolled to, submit disabled until valid. `Alert.alert` is retired except for OS
  permission explanations and the rare case where inline is impossible.
- **Disabled**: 40% opacity plus a one-line caption explaining why nearby.

### Responsiveness
- `useLayout()` → `{ width, gutter, contentWidth, isWide }`. Wrap page content in a
  centred column of `contentWidth`. Never read `Dimensions` at module scope. Grids use
  flex basis percentages, not pixel widths. Text that can be long gets `numberOfLines`.

### Store resolution (`lib/useSelectedStore.ts`)
- `useSelectedStore()` → `{ session, store, storeId, loading, retry }` is **the** way a
  screen learns which store it is showing: `selected_store_id` → `peekStores()` →
  `fetchStoresCached` fallback, re-read from the cache on every focus, `retry` for the
  "Try again" path, `router.replace("/landing")` when there is no session. No screen
  reads `selected_store_id` or the store cache directly. (`components/stock/useSelectedStore`
  is a deprecated re-export.)

---

## 4. Information architecture changes (capabilities preserved)

1. **Home** = dashboard: `ScreenHeader` (eyebrow "Hello, {name}", title store name,
   right: bell `IconButton` with unread `CountBadge`, gear → Settings, avatar → Profile).
   Sections: approval `InlineNotice` (when just approved), `StoreStatusCard` (neutral
   `Card`, status `Badge`, Go Online/Offline `Button`), "Incoming orders · N" action card
   shown only when N > 0 (deep-links to Orders/Incoming), "Today" stat row (delivered
   count · order value → Payouts), and a compact **Stock summary** card ("12 products ·
   9 active", "Manage" → Inventory; offline hint). The Quick Actions grid and 3-stat row
   are removed because they duplicate the tab bar and the cards above. Pull-to-refresh
   stays.
2. **Inventory tab** (`app/(tabs)/stock.tsx`) = the owner's stock: `ScreenHeader` title
   "Inventory" with right `IconButton` search toggle and primary "Add products" action;
   `SegmentedControl` Packaged / Loose; `SearchField`; product rows (`ListRow` with
   Active/Off `Badge`+toggle trailing, remove via long-press/overflow → `ConfirmSheet`);
   "Remove all in section" moves under an overflow `IconButton` (ellipsis) so it is not a
   permanently visible red link. All existing logic (stale-while-revalidate cache,
   request ids, mutation stamps, realtime products channel, optimistic toggle with
   rollback, offline-disables-toggles with visible hint) moves with it into a hook
   `useStoreStock` (`lib/useStoreStock.ts`) + `components/stock/*`.
3. **Add products** (`app/add-products.tsx`, new stack screen) = today's catalog +
   custom-product form as `SegmentedControl` "From catalog" / "Custom product", `TopBar`
   with right text action "Submissions". Every feature of the current stock.tsx survives
   (categories, paged catalog with load more, search, add with undo toast, custom form
   with image, unit/basis chips, validation now inline, FAB scroll-to-top optional).
4. **Payouts**: title "Payouts", subtitle "Value of your delivered orders". Near & Now charges
   no platform fees, so the app never mentions settlement or fee deductions. Formerly: the settlement disclaimer was an
   `InlineNotice` info; period `SegmentedControl`; one summary `Card` (hero amount,
   count, avg) — the redundant quick-stats row is removed; list uses `OrderListCard`;
   stale-data `InlineNotice` on failed refresh.
5. **Orders**: `SegmentedControl` Incoming · N / Active / Previous with a single active
   colour; incoming card = neutral `Card` with warning `Badge` "New" (no orange, no glow);
   per-item include checkboxes are 44dp rows; Accept/Reject are `Button` md; success
   `Toast` after accept/reject; store-offline `InlineNotice` with "Go online" action.
6. **Settings** is the hub (profile card, notifications, preferences, submissions,
   billing, help, about, Logout). **Profile** is identity + editable store info with
   Save/Cancel together. Pending-verification and signup view-only keep their Logout
   because unapproved users cannot reach Settings.
7. **Onboarding**: phone, OTP, store details share `TopBar` with "Step N of 3" overline.
   Verification hub screens (Details / Documents / Billing / Status) render the
   `VerificationNavBar` as a `SegmentedControl` fixed under the `TopBar`, in flow order
   Details → Documents → Billing → Status, with `useHardwareBackTo` on all four.
   Documents/Billing get real titles with "3 of 9 uploaded" `ProgressBar`.

---

## 5. Implementation rules for screen work

- Import from `components/ui` and `lib/theme`. If a needed token/component is missing,
  **do not** add a one-off style — note it in your report so it can be added centrally.
- Delete every screen-level `Animated` mount fade/slide, every literal hex/rgba, every
  alpha-concatenation, every shadow on a static card or button.
- Keep every capability listed in the audit's `functionalityInventory` for your screens.
  Business logic, API calls, state management, polling, caching, navigation targets,
  validation rules and permissions do not change; only presentation and the way feedback
  is surfaced (Alert → inline/Toast/ConfirmSheet).
- Keep `accessibilityRole`/`Label`/`State` on everything interactive; ≥44dp targets.
- Style blocks: one `StyleSheet.create` per file, only layout (flex, gaps, widths) —
  colours/type/radius come from tokens or components.
- Run `npx tsc --noEmit` and fix errors in your files before finishing.
