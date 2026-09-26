# `components/ui` — UI kit reference

Every screen is built from the tokens in `lib/theme.ts` and the components in this
folder. Import components from the barrel and tokens from the theme:

```tsx
import { Screen, TopBar, Section, Card, Button } from "../components/ui";
import { colors, spacing, typography, iconSize } from "../lib/theme";
import { useLayout, useBottomPadding } from "../lib/useLayout";
import { useSelectedStore } from "../lib/useSelectedStore";
```

Rules that apply to every component here:

- **Tokens only.** No literal hex/rgba, font sizes, radii or shadows in screens. If a
  token or component is missing, report it — do not add a one-off style.
- **No outer margins.** Components fill the width they are given and own no
  `margin`. Parents space children with `gap` (24 between sections, 12 inside).
- **Accessibility.** Every interactive component sets `accessibilityRole`, `Label`
  and `State`. Touch targets are ≥44dp (or 40dp + hitSlop).
- **Loading / disabled.** Where relevant, `loading` shows a spinner and keeps the
  size fixed; `disabled` renders at 40% opacity with `elevation: 0`.
- `Ionicons` names are typed as `IoniconName`; use the `-outline` family.

Style blocks in screens hold layout only (flex, gap, width). All type is
`typography.*`, all colour is `colors.*`.

---

## Tokens (`lib/theme.ts`)

| Export | Contents |
| --- | --- |
| `colors` | Brand (`primary`, `primaryDark`, `primaryBg`, `primaryBorder`, `onPrimary`), neutrals (`background`, `surface`, `surfaceVariant`, `border`, `borderLight`, `textPrimary`, `textSecondary`, `textMuted`, `textTertiary`, `textDisabled`), semantic quartets (`success`/`successBg`/`successBorder`/`successText`, same for `warning`, `error`, `info`) plus `errorStrong` (solid error fill that carries `onPrimary` text — error toast, `CountBadge`), overlays (`overlay`, `scrim`), `transparent`. `secondary`, `accent`, `primaryLight` are **deprecated**. |
| `toneColors(tone)` | `{ fill, bg, border, text }` for a `Tone` (`'neutral' \| 'success' \| 'warning' \| 'error' \| 'info'`). |
| `typography` | `display`, `title`, `heading`, `subtitle`, `subheading`, `input`, `body`, `bodyStrong`, `bodySmall`, `bodySmallStrong`, `label`, `description`, `labelStrong`, `caption`, `captionStrong`, `overline`, `badge`, `countBadge`, `code`. Each has `fontSize` + `lineHeight` + `fontWeight`. Spread into a Text style: `{ ...typography.body, color: colors.textPrimary }`. `description` (13/18/400) is the regular-weight sibling of `label` — use it for row/step/notice descriptions instead of `{ ...typography.label, fontWeight: "400" }`. |
| `spacing` | `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48` |
| `radius` | `md 12` controls · `lg 16` cards · `xl 24` sheet top · `full` pills. (`xs`, `sm` deprecated.) |
| `shadows` | `sm`, `md`, `lg`. Only `md` is used, only on floating things. Never with a border. |
| `iconSize` | `sm 16 · md 20 · lg 24 · xl 32` |
| `layout` | Gutter/breakpoint/max-width constants, control heights (incl. `tabBarHeight` 60, excluding the bottom inset), touch-target sizes (`touchTarget` 44, `checkboxSize` 24), list-row leading slots (`listRowLeadingSlot` 40, `listRowLeadingSlotMd` 48, `listRowLeadingSlotLg` 52), `disabledOpacity`. |
| `motion` | Durations: `layout`, `sheetIn`, `sheetOut`, `skeletonPulse`, `toastIn`, `toastOut`, `splashFade`. |

## Hooks

### `lib/useLayout.ts`

- `useLayout()` → `{ width, height, gutter, contentWidth, isWide, isTablet }`. `gutter` is
  16 (24 at ≥600dp); `contentWidth = min(width − 2·gutter, 640)`. Never read
  `Dimensions` at module scope.
- `useBottomPadding()` → tab-bar height + 24 inside a tab navigator (read from
  `BottomTabBarHeightContext`; `@react-navigation/bottom-tabs` is a declared
  dependency), otherwise `insets.bottom + 24`. Use as
  `contentContainerStyle={{ paddingBottom }}`.

### `lib/useSelectedStore.ts`

**The** store-id resolution hook. Every screen that needs "the shopkeeper's current
store" calls this; nothing else reads `selected_store_id` or the store cache directly.

`useSelectedStore()` → `{ session, store, storeId, loading, retry }`

| Field | Type | Notes |
| --- | --- | --- |
| `session` | `UserSession \| null` | From `getSession()`. No token → `router.replace("/landing")` and the hook stops. |
| `store` | `CachedStore \| null` | The whole cached row (`id`, `name`, `is_active`, …) so screens can lock controls while offline. |
| `storeId` | `string \| null` | `store?.id ?? null`. |
| `loading` | `boolean` | True only while the first bootstrap is in flight (warm loads paint from cache). |
| `retry` | `() => void` | Re-runs the bootstrap — the "Try again" path when no store resolved. |

Resolution order: `AsyncStorage("selected_store_id")` → `peekStores()` (no network on a
tab switch) → `fetchStoresCached(token, userId)` fallback; picks the selected store or
the first. On every later focus (`useFocusEffect`) the pick is re-read from
`peekStores() ?? peekStoresAny()` so a Go online / Go offline done on Home is reflected
when the owner comes back. A cancelled flag guards state after unmount.

```tsx
const { session, store, storeId, loading, retry } = useSelectedStore();
if (!loading && !storeId) return <ErrorState title="No store found" action={{ onPress: retry }} />;
```

`components/stock/useSelectedStore.ts` is a one-line re-export of this file and is
deprecated; import from `lib/useSelectedStore` in new code.

## Domain helpers (`lib/order-utils.ts`)

- `getStatusTone(status)` → `Tone` (pending / pending_review / under_review /
  in_review → warning, accepted/ready → info, picked up/delivered/approved → success,
  rejected/cancelled → error, default neutral).
- `formatStatus(status)` → "Pending", "Pending review", "Under review", "Approved",
  "Accepted", "Ready", "Ready for pickup", "Picked up", "Delivered", "Rejected",
  "Cancelled". The review statuses serve verification / product-submission records so
  one `Badge` mapping covers orders and approvals alike.
- `formatINR(value, { symbol = true })` → `"₹12,34,567"`, `"₹99.50"`; strips `.00`.
- `isDelivered(status)` → true for `delivered`, `order_delivered`, `completed` (the
  same set `getStatusTone` maps to success as "Delivered").
- `getStatusColor(status)` (legacy) → the tone's fill colour.

---

## Layout

### `Screen`

Root of every screen: `SafeAreaView` on `colors.background`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | |
| `edges` | `readonly Edge[]` | `["top"]` | Add `"bottom"` on screens with no tab bar / sticky footer. |
| `keyboardAvoiding` | `boolean` | `false` | Wraps children in `KeyboardAvoidingView` (iOS `padding`). |
| `style` | `ViewStyle` | — | |

```tsx
<Screen keyboardAvoiding><TopBar title="Profile" onBack={() => goBackOr("/settings")} />…</Screen>
```

### `TopBar`

Fixed header for stack screens. `surface` fill, hairline bottom border, 56dp (64 with subtitle). Always rendered, never animated.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | — | 18/600, one line. |
| `subtitle` | `string` | — | 13/500 textMuted under the title. |
| `overline` | `string` | — | Uppercase eyebrow above, e.g. "Step 2 of 3". |
| `onBack` | `() => void` | — | Renders a 44dp back `IconButton` ("Go back"). Slot reserved regardless. |
| `backHref` | `Href` | — | Convenience: when set and `onBack` is absent, the back button calls `goBackOr(backHref)` (pop history, else replace to this route). |
| `right` | `ReactNode` | — | One `IconButton` or a text `Button`. Slot reserved regardless. |
| `transparent` | `boolean` | `false` | No fill / border. |
| `style` | `ViewStyle` | — | |

```tsx
<TopBar title="Store details" overline="Step 3 of 3" onBack={goBack} right={<Button label="Skip" variant="text" size="sm" onPress={skip} />} />
<TopBar title="Profile" backHref="/settings" />
```

### `ScreenHeader`

In-scroll header for the tab roots (use as first child or `ListHeaderComponent`). No border.

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `string` | 24/700, one line. |
| `eyebrow` | `string` | 14/400 textSecondary above. |
| `subtitle` | `string` | 14/400 textSecondary below. |
| `right` | `ReactNode` | Row of 44dp `IconButton`s (gap 8). |
| `style` | `ViewStyle` | |

```tsx
<ScreenHeader eyebrow={`Hello, ${name}`} title={storeName} right={<IconButton icon="notifications-outline" badgeCount={unread} accessibilityLabel="Notifications" onPress={openInbox} />} />
```

### `Section` / `SectionHeader`

`Section` = optional `SectionHeader` + children with `gap`. The parent provides the 24 gap between sections.

`Section` props: `title?`, `variant?` (`'overline'` default | `'sentence'`), `action?: { label, onPress }`, `count?: number`, `gap?` (default 12), `children`, `style?`.

`SectionHeader` props: `title`, `variant?`, `action?` (text `Button` sm), `count?` (caption; ignored when `action` set), `standalone?` (adds 16 above / 8 below when used outside a `Section`), `style?`.

```tsx
<Section title="Today" action={{ label: "View all", onPress: goToPayouts }}><Card>…</Card></Section>
```

### `Card`

Level-1 surface: `surface`, `radius.lg`, 1px `border`, no shadow.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | |
| `title` | `string` | — | 18/600 header row with 12 below. |
| `accessory` | `ReactNode` | — | Trailing node in the header row (Badge, text Button). |
| `footer` | `ReactNode` | — | Rendered under the body with a 12 gap. |
| `onPress` / `onLongPress` | `() => void` | — | Turns the card into a `Pressable` (`surfaceVariant` pressed). |
| `padded` | `boolean` | `true` | `false` when children are `ListRow`s with their own padding. |
| `compact` | `boolean` | `false` | Padding 12 instead of 16. |
| `tone` | `Tone` | `'neutral'` | Tinted bg/border. Use sparingly. |
| `disabled` | `boolean` | `false` | |
| `accessibilityLabel`, `accessibilityHint` | | | Apply only when the card is pressable (label defaults to `title`). Static cards are not grouped, so buttons inside stay reachable. |
| `style`, `testID` | | | |

```tsx
<Card title="Store status" accessory={<Badge label="Online" tone="success" dot />}><Button label="Go offline" variant="secondary" onPress={toggle} fullWidth /></Card>
```

### `Divider`

Hairline `borderLight`. Props: `inset?: number` (left margin), `style?`.

```tsx
<Divider inset={56} />
```

### `StickyFooter`

Floating footer pinned under a scrolling form or list (Save/Cancel, "Continue"). Level-2
elevation: `surface` + `shadows.md`, **no** border (never both). Gutter padding, 12 above,
`max(insets.bottom, 12)` below; children sit in a centred `contentWidth` column with an
8 gap. Render it as the last sibling of the scroll view inside a `Screen` whose `edges`
exclude `"bottom"` (the footer handles the inset). Owns no outer margin.

| Prop | Type | Notes |
| --- | --- | --- |
| `children` | `ReactNode` | Usually one or two `Button`s (`fullWidth`). |
| `style`, `testID` | | |

```tsx
<Screen>
  <TopBar title="Billing details" backHref="/settings" />
  <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>…</ScrollView>
  <StickyFooter><Button label="Save" size="lg" fullWidth loading={saving} onPress={save} /></StickyFooter>
</Screen>
```

---

## Actions

### `Button`

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | |
| `onPress` | `() => void` | — | |
| `variant` | `'primary' \| 'secondary' \| 'tonal' \| 'destructive' \| 'text'` | `'primary'` | "Try again" is always `secondary`. |
| `size` | `'lg' \| 'md' \| 'sm'` | `'md'` | Heights 52 / 44 / 36. `sm` gets a computed vertical `hitSlop` (4 above / 4 below) so its own target reaches 44dp. |
| `fullWidth` | `boolean` | `false` | |
| `leftIcon` / `rightIcon` | `IoniconName` | — | 20 / 20 / 16 by size. |
| `loading` | `boolean` | `false` | Spinner replaces label, height fixed, `busy` state. |
| `disabled` | `boolean` | `false` | 40% opacity, `elevation 0`. |
| `haptic` | `'light' \| 'success' \| 'none'` | light for primary/destructive, none otherwise | |
| `accessibilityLabel`, `accessibilityHint`, `style`, `testID` | | | |

Also exported: `triggerHaptic('light' | 'success' | 'error' | 'none')` for custom controls.

```tsx
<Button label="Accept order" size="lg" fullWidth loading={accepting} onPress={accept} />
```

### `IconButton`

Circular icon-only button, 44×44 by default.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `icon` | `IoniconName` | — | |
| `accessibilityLabel` | `string` | **required** | |
| `onPress` | `() => void` | — | |
| `size` | `44 \| 40` | `44` | 40 adds hitSlop 4 and uses a 20dp glyph. |
| `variant` | `'plain' \| 'surface' \| 'tonal' \| 'floating'` | `'plain'` | `floating` = surface + `shadows.md` (FAB). |
| `color` | `string` | textPrimary (primary for tonal) | Icon colour. |
| `badgeCount` | `number` | — | Ringed `CountBadge` top-right when > 0; the spoken label becomes "`accessibilityLabel`, N new". |
| `loading` | `boolean` | `false` | Spinner (in the icon colour) replaces the glyph; size fixed; `accessibilityState.busy`; presses ignored while loading. |
| `disabled` | `boolean` | `false` | 40% opacity + `elevation 0` only (glyph colour unchanged). |
| `accessibilityHint`, `style`, `testID` | | | |

```tsx
<IconButton icon="ellipsis-horizontal" accessibilityLabel="More options" onPress={openMenu} />
<IconButton icon="refresh-outline" accessibilityLabel="Refresh" loading={refreshing} onPress={refetch} />
```

### `Chip`

Selectable pill; selection shown by tint, not weight.

| Prop | Type | Default |
| --- | --- | --- |
| `label` | `string` | — |
| `selected` | `boolean` | `false` |
| `onPress` | `() => void` | — |
| `size` | `'sm' \| 'md'` (36 / 40) | `'md'` |
| `icon` | `IoniconName` | — |
| `disabled`, `accessibilityLabel`, `style`, `testID` | | |

```tsx
<Chip label="kg" selected={unit === "kg"} onPress={() => setUnit("kg")} />
```

### `SegmentedControl`

Single-select filter. 44dp track (`size="sm"` → 36dp), one active colour, counts in the label. Segments get vertical `hitSlop` so the whole track height is tappable; labels shrink to 85% before ellipsising.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | `{ key, label, count?, icon? }[]` | — | `count` renders as "Label · 3". |
| `value` | `K` | — | Selected key. |
| `onChange` | `(key: K) => void` | — | |
| `size` | `'md' \| 'sm'` | `'md'` | Use `sm` for 4-item sets on phones (e.g. Details / Documents / Billing / Status). |
| `disabled` | `boolean` | `false` | |
| `haptic` | `boolean` | `true` | Light haptic on change. |
| `accessibilityLabel`, `style`, `testID` | | | |

```tsx
<SegmentedControl items={[{ key: "incoming", label: "Incoming", count: n }, { key: "active", label: "Active" }, { key: "previous", label: "Previous" }]} value={tab} onChange={setTab} />
```

---

## Data display

### `ListRow`

Standard row: minHeight 56, 40dp leading slot (48 / 52 via `leadingSize`), title/description, trailing. A grouped `Pressable` only when `onPress` is set.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | — | 15/600. |
| `description` | `string` | — | 13/400 textMuted (`typography.description`), 2 lines. |
| `leading` | `ReactNode` | — | Custom leading node. A thumbnail should fill the slot (`width: "100%", height: "100%"`, `radius.md`). |
| `leadingSize` | `40 \| 48 \| 52` | `40` | Leading slot width/height; the `iconTile` follows it. Use 48/52 for product thumbnails. |
| `icon` | `IoniconName` | — | 20dp textSecondary in the leading slot. |
| `iconTile` | `boolean` | `false` | Puts `icon` in a `surfaceVariant` tile filling the leading slot. |
| `trailing` | `ReactNode` | — | Badge / Switch / IconButton. |
| `value` | `string` | — | Right-aligned value text (ignored if `trailing`). |
| `chevron` | `boolean` | `false` | 20dp chevron in textTertiary. |
| `showSeparator` | `boolean` | `false` | Hairline at the bottom — skip on the last row. |
| `inset` | `boolean` | `false` | Zero horizontal padding (inside padded Cards). |
| `destructive` | `boolean` | `false` | Title/icon in errorText. |
| `accessibilityLabel` | `string` | "title, description, value" | Pressable and long-press-only rows; static rows are not grouped so a trailing `Switch` stays reachable. |
| `onLongPress` | `() => void` | — | With `onPress`: secondary gesture on the grouped row, also offered as a custom action. **Without** `onPress`: the row stays ungrouped (touch long-press on the whole row; the trailing `Switch`/`IconButton` remain their own elements) and the text block becomes the accessible element carrying an `accessibilityActions` entry `{ name: "longpress", label: longPressLabel }` handled via `onAccessibilityAction`. |
| `longPressLabel` | `string` | `"More actions"` | Spoken name of that custom action. |
| `onPress`, `disabled`, `accessibilityHint`, `style`, `testID` | | | |

```tsx
<ListRow icon="notifications-outline" iconTile title="Notifications" description="Order alerts and sounds" chevron showSeparator onPress={openNotifications} />
<ListRow leadingSize={52} leading={<Image source={{ uri }} style={{ width: "100%", height: "100%", borderRadius: radius.md }} />} title={p.name} description={p.unit} trailing={<Switch value={p.active} onValueChange={toggle} accessibilityLabel={`${p.name} available`} />} onLongPress={openRowMenu} longPressLabel="Product options" />
```

### `KeyValueRow`

Label left (13/500 textMuted), value right (15/400, 2 lines). Read as one group: "label: value".

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | |
| `value` | `string` | — | |
| `icon` | `IoniconName` | — | 16dp before the label. |
| `onCopy` | `(value) => void \| Promise<void>` | — | Long-press handler; caller performs the clipboard write, a "Copied" toast follows. |
| `copiedMessage` | `string` | `"Copied"` | |
| `showSeparator` | `boolean` | `false` | |
| `style`, `testID` | | | |

```tsx
<KeyValueRow label="Store ID" value={store.id} onCopy={(v) => Clipboard.setStringAsync(v)} />
```

### `Badge`

Static status label. `neutral` = surfaceVariant + border + textSecondary. Grouped for screen readers (reads `label`).

| Prop | Type | Default |
| --- | --- | --- |
| `label` | `string` | — |
| `tone` | `Tone` | `'neutral'` |
| `size` | `'sm' \| 'md'` (20 / 24dp) | `'md'` |
| `dot` | `boolean` | `false` |
| `icon` | `IoniconName` (12dp) | — |
| `accessibilityLabel`, `style` | | |

```tsx
<Badge label={formatStatus(o.status)} tone={getStatusTone(o.status)} />
```

### `CountBadge`

Attention count — `errorStrong` fill (white text on `error` fails 4.5:1), 11/700. Hidden when `count <= 0`. Grouped for screen readers (reads "N new").

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `count` | `number` | — | |
| `ringed` | `boolean` | `false` | 1.5dp surface ring (overlaying an IconButton). |
| `max` | `number` | `9` | Renders "9+" above. |
| `style`, `accessibilityLabel` | | | |

```tsx
<CountBadge count={incomingCount} />
```

### `InlineNotice`

In-content banner. Error/warning tones announce as alerts (Android live region; explicit VoiceOver announcement on iOS when the title/message appears or changes).

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | — | 14/600 toneText. |
| `message` | `string` | — | 13/400 textSecondary. |
| `lines` | `string[]` | — | Bulleted list (13/400 textSecondary, `accessibilityRole="list"`) under the title / message. Use instead of a `"\n"`-joined `message`; empty strings are skipped; included in the VoiceOver announcement. |
| `tone` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | |
| `icon` | `IoniconName` | by tone | |
| `action` | `{ label, onPress }` | — | Text `Button` sm. |
| `onDismiss` | `() => void` | — | 40dp close button. |
| `style`, `testID` | | | |

```tsx
<InlineNotice tone="warning" title="Couldn't refresh" message="Showing saved data" action={{ label: "Retry", onPress: refetch }} />
<InlineNotice tone="error" title="Fix these before saving" lines={["Account number must be 6–20 digits", "IFSC code is invalid"]} />
```

### `Skeleton`

Pulsing placeholders (800ms, native driver). Shape them like the real rows. All
boxes on screen share one animation loop and pulse in sync; every variant announces
a single "Loading" (`progressbar`).

- `Skeleton.Box({ width?, height?, radius?, style? })`
- `Skeleton.Text({ lines? = 2, width?, lineHeight? = 14, style? })`
- `Skeleton.ListRow({ count? = 3, inset?, leading? = true, style? })`
- `Skeleton.Chips({ count? = 3, style? })` — a wrapping row of small (36dp) `Chip`
  pills with varied widths; announces "Loading" once.
- `Skeleton.Card({ lines? = 2, title? = true, style? })`

```tsx
{loading && !data ? <Skeleton.ListRow count={5} /> : null}
{categories == null ? <Skeleton.Chips count={5} /> : null}
```

### `EmptyState`

Centred, `flexGrow: 1`, 72dp primaryBg circle. Use as `ListEmptyComponent`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | — | 17/600 sentence case. |
| `message` | `string` | — | 14/400, 1–2 lines. |
| `icon` | `IoniconName` | `"file-tray-outline"` | |
| `action` | `{ label, onPress, variant?, loading? }` | — | Default variant `primary`. |
| `compact` | `boolean` | `false` | 56dp circle, 15/600 title (inside cards). |
| `style`, `testID` | | | |

```tsx
<EmptyState icon="cube-outline" title="No products yet" message="Add items from the catalog to start selling." action={{ label: "Add products", onPress: goToAdd }} />
```

### `ErrorState`

Same layout with an errorBg circle. Default title "Something went wrong"; action label defaults to "Try again", variant `secondary`.

| Prop | Type | Default |
| --- | --- | --- |
| `title` | `string` | `"Something went wrong"` |
| `message` | `string` | — |
| `icon` | `IoniconName` | `"alert-circle-outline"` |
| `action` | `{ onPress, label?, variant?, loading? }` | — |
| `compact`, `style`, `testID` | | |

```tsx
<ErrorState message={error} action={{ onPress: refetch, loading: refetching }} />
```

### `Stepper`

Vertical steps with 24dp markers (check / number / hollow). Each row is one accessible group: "Step N of M, title, completed / current step / not started".

Props: `steps: { title, description?, state: 'done' | 'active' | 'upcoming' }[]`, `style?`, `accessibilityLabel?` (list container only).

```tsx
<Stepper steps={[{ title: "Details", state: "done" }, { title: "Documents", state: "active" }, { title: "Billing", state: "upcoming" }]} />
```

### `ProgressBar`

4dp `borderLight` track, `primary` fill.

Props: `value: number` (0..1), `label?: string` (caption, right-aligned), `accessibilityLabel?`, `style?`.

```tsx
<ProgressBar value={uploaded / total} label={`${uploaded} of ${total} uploaded`} />
```

---

## Inputs

### `TextField`

48dp field, `radius.md`, focus 2px primary, error 1.5px error. Forwards every `TextInput` prop and the ref.

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | 13/500 above. |
| `helper` | `string` | 12 caption below (hidden while `error`). |
| `error` | `string` | errorText below; polite live region (Android) + VoiceOver announcement (iOS). |
| `prefix` | `string` | e.g. "+91". |
| `leftIcon` / `rightIcon` | `IoniconName` | |
| `onRightIconPress` | `() => void` | Makes the right icon a 40dp button (carries `disabled` state). |
| `rightIconAccessibilityLabel` | `string` | Default "Clear". |
| `placeholderTextColor` | `string` | Default `textMuted` (≥4.5:1). |
| `disabled` | `boolean` | surfaceVariant + textDisabled (icons too). |
| `multiline` | `boolean` | minHeight 96, top-aligned. |
| `containerStyle` / `fieldStyle` / `inputStyle` | | Wrapper / field box / TextInput overrides. |
| …`TextInputProps` | | `value`, `onChangeText`, `keyboardType`, `maxLength`, `autoCapitalize`, `returnKeyType`, `onSubmitEditing`, … |

```tsx
<TextField ref={phoneRef} label="Phone number" prefix="+91" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} error={phoneError} />
```

### `SearchField`

`TextField` preset: search icon, clear button when non-empty, `returnKeyType="search"`. Controlled only.

Props: `value`, `onChangeText`, `onClear?`, `placeholder?` (default "Search"), `accessibilityLabel?` (default "Search"), `autoFocus?`, plus other `TextField` props except icons.

```tsx
<SearchField ref={searchRef} value={query} onChangeText={setQuery} placeholder="Search products" autoFocus />
```

### `OtpInput`

Six 56dp boxes backed by one invisible `TextInput` (paste-to-fill, SMS autofill, backspace all native). Autofill hints are `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. Ref exposes `{ focus, blur, clear }`.

| Prop | Type | Default |
| --- | --- | --- |
| `length` | `number` | `6` |
| `value` | `string` | — (uncontrolled when omitted) |
| `onChange` | `(code) => void` | — |
| `onComplete` | `(code) => void` | — |
| `error` | `string` | — |
| `autoFocus` | `boolean` | `false` |
| `disabled` | `boolean` | `false` |
| `accessibilityLabel`, `style`, `testID` | | |

```tsx
<OtpInput ref={otpRef} autoFocus onComplete={verify} error={otpError} />
```

### `Switch`

RN `Switch` with token colours. `accessibilityLabel` is required.

Props: `value`, `onValueChange`, `accessibilityLabel`, `disabled?`, `haptic?` (default true), `accessibilityHint?`, `style?`, `testID?`.

```tsx
<ListRow title="Sound" trailing={<Switch value={sound} onValueChange={setSound} accessibilityLabel="Order sound" />} />
```

### `Checkbox`

24dp glyph (`checkbox-outline` in `primary` when checked, `square-outline` in
`textSecondary` otherwise) inside a 44dp pressable row. The whole row toggles, with a
light haptic. Announced as `checkbox` with `checked` / `disabled` state. Owns no outer
margin — parents stack them with `gap`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `checked` | `boolean` | — | |
| `onChange` | `(checked: boolean) => void` | — | Receives the next value. |
| `label` | `string` | — | 15/400 textPrimary, 2 lines. |
| `description` | `string` | — | 13/400 textMuted, 2 lines. |
| `disabled` | `boolean` | `false` | 40% opacity; presses ignored. |
| `haptic` | `boolean` | `true` | |
| `accessibilityLabel` | `string` | "label, description" | Required when there is no `label`. |
| `accessibilityHint`, `style`, `testID` | | | |

```tsx
<Checkbox checked={included} onChange={setIncluded} label={`${item.quantity} ${item.unit} — ${item.product_name}`} description={formatINR(item.price)} />
```

---

## Overlays

### `BottomSheet`

Shared animated sheet in a `Modal`: `overlay` scrim, `surface` body, `radius.xl` top corners, handle, slide 260ms in / 200ms out. Dismisses on backdrop tap and Android back unless `busy`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `visible` | `boolean` | — | |
| `onClose` | `() => void` | — | Request to close (backdrop, Android back, child). |
| `onClosed` | `() => void` | — | Fires after the exit animation finishes and the `Modal` unmounts. Open the next sheet / native picker here. |
| `busy` | `boolean` | `false` | Blocks dismissal. |
| `title` | `string` | — | 18/600. |
| `children` | `ReactNode` | — | |
| `scrollable` | `boolean` | `false` | Wraps children in a `ScrollView` (≤85% of window). |
| `accessibilityLabel`, `contentStyle`, `testID` | | | |

```tsx
<BottomSheet visible={open} onClose={() => setOpen(false)} title="Filter">…</BottomSheet>
```

### `ConfirmSheet`

Replaces `Alert.alert(..., [{Cancel},{Confirm}])`. Awaits `onConfirm`; spinner in the button while pending; rejection shown as an error `InlineNotice` inside the sheet; closes on success.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `visible`, `onClose` | | — | |
| `title` | `string` | — | 18/600. |
| `message` | `string` | — | 15/400 textSecondary. |
| `confirmLabel` | `string` | — | |
| `cancelLabel` | `string` | `"Cancel"` | |
| `onConfirm` | `() => void \| Promise<void>` | — | Throw / reject to show the error inline. |
| `destructive` | `boolean` | `false` | Destructive button + `error` tone. |
| `tone` | `Tone` | error if destructive, else info | Icon circle tint. |
| `icon` | `IoniconName` | by tone | |
| `fallbackErrorMessage` | `string` | "Something went wrong. Please try again." | |
| `testID` | | | |

```tsx
<ConfirmSheet visible={confirming} onClose={() => setConfirming(false)} destructive title="Remove product?" message="It will disappear from your store." confirmLabel="Remove" onConfirm={() => removeProduct(id)} />
```

### `ActionSheet`

`BottomSheet` with options as `ListRow`s. Selecting closes the sheet and runs the handler once the sheet has fully dismissed (via `onClosed`), so a handler may open another sheet or a native picker. Cancel discards any pending handler.

| Prop | Type | Default |
| --- | --- | --- |
| `visible`, `onClose` | | — |
| `title` | `string` | — |
| `options` | `{ key, label, description?, icon?, destructive?, disabled?, onPress }[]` | — |
| `cancelLabel` | `string \| null` | `"Cancel"` (`null` hides) |
| `testID` | | |

```tsx
<ActionSheet visible={pick} onClose={() => setPick(false)} title="Store photo" options={[{ key: "camera", label: "Take photo", icon: "camera-outline", onPress: takePhoto }, { key: "remove", label: "Remove", icon: "trash-outline", destructive: true, onPress: remove }]} />
```

### `NoticeSheet`

One-button informational `BottomSheet` — replaces `Alert.alert(title, message, [{ text: "Continue", onPress }])`.
Same layout as `ConfirmSheet` (64dp tinted icon circle, 18/600 title, 15/400 message, lg
primary `Button`) but with no cancel path: the button, backdrop tap and Android back all
run `onAction`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `visible` | `boolean` | — | |
| `title` | `string` | — | |
| `message` | `string` | — | |
| `actionLabel` | `string` | — | e.g. "Continue", "Got it". |
| `onAction` | `() => void` | — | Acknowledge handler; also runs on dismiss. |
| `tone` | `Tone` | `'warning'` | Icon circle tint. |
| `icon` | `IoniconName` | `"information-circle-outline"` | |
| `testID` | | | |

```tsx
<NoticeSheet visible={suspended} tone="warning" icon="shield-outline" title="Store sent back for re-verification" message="Editing a verification document after approval requires re-verification." actionLabel="Continue" onAction={continueAfterSuspension} />
```

### Toast

`ToastProvider` is mounted once in `app/_layout.tsx`. One toast at a time; a new
`show` replaces the current one. Dark (`textPrimary`) fill for neutral/success,
`errorStrong` fill for error; anchored above the tab bar. Announced via Android live
region and an explicit VoiceOver announcement on iOS.

- `ToastProvider` props: `children`, `bottomOffset?: number` — fixed distance from the
  window bottom that overrides the shared offset below (rarely needed).
- `useToast()` → `{ show(options), hide() }` — inside components.
- `toast.show(options)` / `toast.hide()` — module-level, for hooks/services outside
  the tree. Calls made before the provider mounts are shown once it does.
- `setToastBottomOffset(height)` — `app/(tabs)/_layout.tsx` calls this with
  `layout.tabBarHeight + insets.bottom` while the tab navigator is focused and resets
  it to `0` when a stack screen covers it or it unmounts; `0` falls back to
  `insets.bottom`.
- `getToastBottomOffset()` — current shared offset in dp (`0` when none set); mainly
  for tests/debugging.
- `ToastOptions`: `{ message: string; tone?: 'neutral' | 'success' | 'error'; action?: { label, onPress }; duration?: number = 4000 }` (`0` = sticky until replaced/hidden).

```tsx
const { show } = useToast(); show({ message: "Product removed", tone: "success", action: { label: "Undo", onPress: undoRemove } });
```

---

## Patterns

- **Stack screen**: `Screen` → `TopBar` (`backHref` for the fallback route) → `ScrollView` with `contentContainerStyle={{ paddingTop: 16, paddingHorizontal: gutter, paddingBottom, gap: 24 }}` and children in a centred column of `contentWidth`. Forms with a persistent Save/Continue end with a `StickyFooter` after the scroll view.
- **Store resolution**: every screen that needs the current store calls `useSelectedStore()` from `lib/useSelectedStore`; never read `selected_store_id` or the store cache directly.
- **Tab screen**: `Screen` → `FlatList` with `ListHeaderComponent={<ScreenHeader … />}`, `ListEmptyComponent={<EmptyState … />}`, `paddingBottom = useBottomPadding()`.
- **Loading**: header always mounted; first load renders `Skeleton.*`; warm loads paint from cache with no spinner.
- **Errors**: `ErrorState` when nothing is shown; `InlineNotice` (warning) with Retry when cached content is visible.
- **Feedback**: `Toast` for non-blocking success, `ConfirmSheet` for confirmations, inline `error` on `TextField` for validation. `Alert.alert` only for OS permission explanations.
