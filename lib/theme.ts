/**
 * Clean, modern UI theme for Near & Now Store Owner app.
 */

export const colors = {
  primary: "#0C831F",
  secondary: "#0A6B1A",
  accent: "#10b981",
  primaryLight: "#34d399",
  primaryDark: "#065f46",
  primaryBg: "#F0F9F1",       // very subtle green tint for primary backgrounds

  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  background: "#F7F7F7",
  surface: "#FFFFFF",
  surfaceVariant: "#FAFAFA",

  textPrimary: "#1A1A1A",
  textSecondary: "#555555",
  textTertiary: "#8E8E93",
  textDisabled: "#C7C7CC",

  border: "#E8E8E8",
  borderLight: "#F2F2F2",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

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
