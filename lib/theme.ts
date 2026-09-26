/**
 * Design tokens for the Near & Now Store Owner app.
 *
 * This file is the single source of truth for colour, type, spacing, radius,
 * elevation, icon sizes and layout constants. Screens and components import
 * from here and never define literal hex/rgba values, font sizes or radii.
 * See docs/design-system.md for the full contract.
 */
import type { TextStyle } from "react-native";

// ─── Colours ──────────────────────────────────────────────────────────────────

export const colors = {
  // Brand
  /** Fills, active states, links, primary buttons. */
  primary: "#0C831F",
  /** Pressed primary. */
  primaryDark: "#065F46",
  /** Soft tint backgrounds: empty-state circle, tonal button, selected chip. */
  primaryBg: "#F0F9F1",
  /** Borders on primary-tinted surfaces. */
  primaryBorder: "#BBE3C3",
  /** Text / icons on primary fills. */
  onPrimary: "#FFFFFF",

  /**
   * @deprecated Kept only so untouched code compiles. Do not use in new code —
   * use `primary` / `primaryDark` instead.
   */
  secondary: "#0A6B1A",
  /**
   * @deprecated Kept only so untouched code compiles. Do not use in new code —
   * use `success` (or `primary`) instead.
   */
  accent: "#10b981",
  /**
   * @deprecated Kept only so untouched code compiles. Do not use in new code —
   * use `primaryBg` / `primaryBorder` for tinted surfaces.
   */
  primaryLight: "#34d399",

  // Neutrals
  /** Screen background. */
  background: "#F7F7F7",
  /** Cards, bars, sheets, inputs. */
  surface: "#FFFFFF",
  /** Segmented-control track, skeleton base, pressed row. */
  surfaceVariant: "#FAFAFA",
  /** 1px borders. */
  border: "#E8E8E8",
  /** Hairline separators inside cards. */
  borderLight: "#F2F2F2",

  textPrimary: "#1A1A1A",
  /** Body-secondary, descriptions. */
  textSecondary: "#555555",
  /** Any text <= 13px that must stay >= 4.5:1 (captions, labels). */
  textMuted: "#6B6B70",
  /** Icons / decorative only — never body text. */
  textTertiary: "#8E8E93",
  textDisabled: "#C7C7CC",

  // Semantic — fill / bg / border / text
  success: "#10B981",
  successBg: "#D1FAE5",
  successBorder: "#A7F3D0",
  successText: "#047857",

  warning: "#F59E0B",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  warningText: "#B45309",

  error: "#EF4444",
  errorBg: "#FEE2E2",
  errorBorder: "#FECACA",
  errorText: "#B91C1C",
  /**
   * Solid error fill that carries `onPrimary` text (error toast, CountBadge).
   * `error` on white text is only 3.8:1; this reaches ~6.5:1.
   */
  errorStrong: "#B91C1C",

  info: "#3B82F6",
  infoBg: "#DBEAFE",
  infoBorder: "#BFDBFE",
  infoText: "#1D4ED8",

  // Overlays
  /** Modal / sheet scrim. */
  overlay: "rgba(0,0,0,0.45)",
  /** Light scrim over imagery. */
  scrim: "rgba(255,255,255,0.20)",
  /** Fully transparent — for borders that must reserve their width. */
  transparent: "transparent",
} as const;

export type ColorToken = keyof typeof colors;

// ─── Semantic tones ───────────────────────────────────────────────────────────

export type Tone = "neutral" | "success" | "warning" | "error" | "info";

export type ToneColors = {
  /** Solid fill (dots, progress, icons on plain surfaces). */
  fill: string;
  /** Tinted background. */
  bg: string;
  /** Border for the tinted background. */
  border: string;
  /** Text on the tinted background. */
  text: string;
};

const TONE_COLORS: Record<Tone, ToneColors> = {
  neutral: {
    fill: colors.textTertiary,
    bg: colors.surfaceVariant,
    border: colors.border,
    text: colors.textSecondary,
  },
  success: {
    fill: colors.success,
    bg: colors.successBg,
    border: colors.successBorder,
    text: colors.successText,
  },
  warning: {
    fill: colors.warning,
    bg: colors.warningBg,
    border: colors.warningBorder,
    text: colors.warningText,
  },
  error: {
    fill: colors.error,
    bg: colors.errorBg,
    border: colors.errorBorder,
    text: colors.errorText,
  },
  info: {
    fill: colors.info,
    bg: colors.infoBg,
    border: colors.infoBorder,
    text: colors.infoText,
  },
};

/** Resolve the `{ fill, bg, border, text }` quartet for a semantic tone. */
export function toneColors(tone: Tone): ToneColors {
  return TONE_COLORS[tone] ?? TONE_COLORS.neutral;
}

// ─── Spacing (base 4) ─────────────────────────────────────────────────────────

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ─── Radius ───────────────────────────────────────────────────────────────────

export const radius = {
  /** @deprecated Not used in new code. */
  xs: 6,
  /** @deprecated Not used in new code. */
  sm: 8,
  /** Controls: buttons, inputs, segmented track, thumbnails. */
  md: 12,
  /** Cards, banners, sheet body, modal card. */
  lg: 16,
  /** Bottom-sheet top corners only. */
  xl: 24,
  /** Pills, chips, badges, avatars, circular icon buttons. */
  full: 9999,
} as const;

// ─── Elevation ────────────────────────────────────────────────────────────────
// Level 0: flat (buttons, inputs, banners). Level 1: static card — 1px border,
// no shadow. Level 2: floating — `shadows.md` (sheets, FAB, modal, sticky footer).
// Never combine a border with a shadow. Never tint shadowColor.

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
// System font. Weights 400 / 500 / 600 / 700 only. Every style carries
// fontSize + lineHeight. No sizes below 11, no negative letterSpacing.

type TypeStyle = Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight" | "letterSpacing" | "textTransform" | "fontVariant">;

export const typography = {
  /** Auth screen titles, hero rupee amount (tabular figures). */
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  /** Tab-screen titles (ScreenHeader). */
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  /** TopBar title, card titles, section titles. */
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  /** Empty/error-state titles. */
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  /** Order codes, emphasised row titles, lg button label. */
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  /** Text input value. */
  input: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  /** Default text. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  /** List row titles, md button label. */
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  /** Header eyebrow / subtitle, notice message, toast text. */
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  /** Segment labels (active), notice titles. */
  bodySmallStrong: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  /** Field labels, inactive segment text. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  /** Row / step / notice descriptions — the regular-weight sibling of `label`. */
  description: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  /** sm button label, sentence-case section header. */
  labelStrong: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  /** Meta, dates, helper text — the floor for readable text. */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  /** Emphasised value inside a caption (e.g. the unit preview under a field). */
  captionStrong: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  /** Uppercase eyebrows, table headers. */
  overline: { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  /** Badge text. */
  badge: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  /** CountBadge text only. */
  countBadge: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  /** Pickup code only. */
  code: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: 4 },
} as const satisfies Record<string, TypeStyle>;

export type TypographyToken = keyof typeof typography;

// ─── Icons ────────────────────────────────────────────────────────────────────
// Ionicons, outline family only (filled reserved for selected tab + Badge glyphs).

export const iconSize = {
  /** Inline / meta. */
  sm: 16,
  /** Controls, list leading. */
  md: 20,
  /** Header / nav. */
  lg: 24,
  /** Empty-state glyph. */
  xl: 32,
} as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

export const layout = {
  /** Screen gutter on phones. */
  gutter: 16,
  /** Screen gutter at >= wideBreakpoint. */
  gutterWide: 24,
  /** Width (dp) at which the wide gutter and centred columns kick in. */
  wideBreakpoint: 600,
  /** Max width of the centred content column. */
  maxContentWidth: 640,
  /** Max width of auth / form columns. */
  maxFormWidth: 480,
  /** Max width of a SegmentedControl. */
  maxSegmentedWidth: 480,
  /** Minimum touch target. */
  touchTarget: 44,
  /** Checkbox glyph size (the row around it is `touchTarget`). */
  checkboxSize: 24,
  /** Compact touch target (must be paired with hitSlop). */
  touchTargetCompact: 40,
  /** Extra hitSlop applied around compact targets. */
  compactHitSlop: 4,
  /** TopBar height without / with subtitle. */
  topBarHeight: 56,
  topBarHeightWithSubtitle: 64,
  /** Tab bar height excluding the bottom safe-area inset (app/(tabs)/_layout.tsx). */
  tabBarHeight: 60,
  /** List row. */
  listRowMinHeight: 56,
  listRowLeadingSlot: 40,
  /** Larger leading slots for thumbnail rows (`ListRow leadingSize`). */
  listRowLeadingSlotMd: 48,
  listRowLeadingSlotLg: 52,
  /** Field heights. */
  fieldHeight: 48,
  multilineFieldMinHeight: 96,
  otpBoxHeight: 56,
  otpBoxMaxWidth: 48,
  /** Button heights by size. */
  buttonHeightLg: 52,
  buttonHeightMd: 44,
  buttonHeightSm: 36,
  /** Chip heights by size. */
  chipHeightSm: 36,
  chipHeightMd: 40,
  /** Segmented control track heights. */
  segmentedHeight: 44,
  segmentedHeightSm: 36,
  segmentedInnerPadding: 2,
  /** Bottom-sheet handle. */
  sheetHandleWidth: 36,
  sheetHandleHeight: 4,
  /** Extra bottom padding under scrolling content. */
  scrollBottomPadding: 24,
  /** Disabled opacity for controls. */
  disabledOpacity: 0.4,
} as const;

// ─── Motion ───────────────────────────────────────────────────────────────────

export const motion = {
  /** LayoutAnimation for list add/remove and accordion expand. */
  layout: 180,
  sheetIn: 260,
  sheetOut: 200,
  skeletonPulse: 800,
  toastIn: 220,
  toastOut: 160,
  splashFade: 300,
} as const;
